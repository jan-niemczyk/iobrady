import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { canViewPost, normalizeLinks, notifyAudience, resolveAudience } from "@/lib/info";
import { infoSchema } from "@/lib/infoSchema";
import { deleteAttachmentFile } from "@/lib/attachments";

const nameOf = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : null);

/** Treść komunikatu. Radny - tylko gdy ma teraz dostęp; samo pobranie NIE zapisuje odczytu. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canViewPost(session.user, id))) return new NextResponse("Nie znaleziono", { status: 404 });
  const p = await prisma.infoPost.findUnique({
    where: { id },
    include: {
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
      reads: { where: { userId: session.user.id }, select: { version: true } },
    },
  });
  if (!p) return new NextResponse("Nie znaleziono", { status: 404 });
  const people = await prisma.user.findMany({ where: { id: { in: [p.authorId, p.editorId].filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } });
  const byId = new Map(people.map((u) => [u.id, u]));
  const base = {
    id: p.id, title: p.title, body: p.body, category: p.category, kind: p.kind, status: p.status, pinned: p.pinned, important: p.important,
    publishedAt: p.publishedAt, eventAt: p.eventAt, expiresAt: p.expiresAt, version: p.version, updatedAt: p.updatedAt,
    links: normalizeLinks(p.links), attachments: p.attachments,
    author: nameOf(byId.get(p.authorId ?? "")), editor: nameOf(byId.get(p.editorId ?? "")),
  };
  if (session.user.role === "OPERATOR") {
    return NextResponse.json({ ...base, audienceAll: p.audienceAll, audienceOrgUnitIds: p.audienceOrgUnitIds, audienceUserIds: p.audienceUserIds });
  }
  const readVersions = p.reads.map((r) => r.version);
  return NextResponse.json({ ...base, unread: !readVersions.includes(p.version), changed: !readVersions.includes(p.version) && readVersions.length > 0 });
}

const patchSchema = infoSchema.extend({
  action: z.enum(["save", "publish", "archive", "restore"]).optional(),
  /** Istotna zmiana opublikowanego komunikatu - odbiorcy zobaczą ją jako nieprzeczytaną (bez kopii poprzedniej treści). */
  significant: z.boolean().optional(),
});

/**
 * Zmiana komunikatu (operator). action: save | publish | archive | restore.
 * Opublikowanie powiadamia bieżących odbiorców w aplikacji. Edycja nadpisuje bieżącą treść - poprzednie
 * treści nie są przechowywane (ani w bazie, ani w rejestrze czynności). Istotna zmiana podnosi licznik
 * zmian, więc odbiorcy widzą informację jako nieprzeczytaną; rejestr otwarć zostaje.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  const cur = await prisma.infoPost.findUnique({ where: { id } });
  if (!cur) return new NextResponse("Nie znaleziono", { status: 404 });
  const action = d.action ?? "save";

  const data = {
    ...(d.title !== undefined ? { title: d.title } : {}),
    ...(d.body !== undefined ? { body: d.body } : {}),
    ...(d.category !== undefined ? { category: d.category || "Komunikat" } : {}),
    ...(d.kind !== undefined ? { kind: d.kind } : {}),
    ...(d.pinned !== undefined ? { pinned: d.pinned } : {}),
    ...(d.important !== undefined ? { important: d.important } : {}),
    ...(d.eventAt !== undefined ? { eventAt: d.eventAt ? new Date(d.eventAt) : null } : {}),
    ...(d.expiresAt !== undefined ? { expiresAt: d.expiresAt ? new Date(d.expiresAt) : null } : {}),
    ...(d.links !== undefined ? { links: normalizeLinks(d.links) as never } : {}),
    ...(d.audienceAll !== undefined ? { audienceAll: d.audienceAll } : {}),
    ...(d.audienceOrgUnitIds !== undefined ? { audienceOrgUnitIds: d.audienceOrgUnitIds } : {}),
    ...(d.audienceUserIds !== undefined ? { audienceUserIds: d.audienceUserIds } : {}),
  };
  const next = { ...cur, ...data };
  if ((action === "publish" || (cur.status === "PUBLISHED" && action === "save")) && !next.audienceAll && next.audienceOrgUnitIds.length === 0 && next.audienceUserIds.length === 0)
    return NextResponse.json({ error: "Wybierz odbiorców komunikatu." }, { status: 400 });
  if (action === "publish" && cur.status !== "DRAFT") return NextResponse.json({ error: "Komunikat jest już opublikowany." }, { status: 409 });

  const contentChanged = (d.title !== undefined && d.title !== cur.title) || (d.body !== undefined && d.body !== cur.body)
    || (d.links !== undefined && JSON.stringify(normalizeLinks(d.links)) !== JSON.stringify(normalizeLinks(cur.links)));
  const newVersion = cur.status === "PUBLISHED" && action === "save" && d.significant === true && contentChanged;
  const version = newVersion ? cur.version + 1 : cur.version;

  let notify: { kind: string; title: string } | null = null;
  const status = action === "publish" ? "PUBLISHED" : action === "archive" ? "ARCHIVED" : action === "restore" ? "PUBLISHED" : cur.status;
  if (action === "restore" && cur.status !== "ARCHIVED") return NextResponse.json({ error: "Komunikat nie jest w archiwum." }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    const p = await tx.infoPost.update({
      where: { id },
      data: { ...data, status, version, editorId: session.user.id, ...(action === "publish" && !cur.publishedAt ? { publishedAt: new Date() } : {}) },
    });
    if (action === "publish") notify = { kind: "INFO", title: `Nowa informacja: ${p.title}` };
    if (newVersion) notify = { kind: "INFO", title: `Zmieniona informacja: ${p.title}` };
    if (notify) {
      const audience = await resolveAudience(p, new Date(), tx);
      await notifyAudience(tx, audience.map((u) => u.id), { ...notify, link: `/session/informacje/${id}` });
    }
    const what = action === "publish" ? "Opublikowano" : action === "archive" ? "Zarchiwizowano" : action === "restore" ? "Przywrócono" : newVersion ? "Zmieniono istotnie" : "Zmieniono";
    // Rejestr czynności bez treści i tytułu informacji - tylko identyfikator i nazwy zmienionych pól.
    await audit({ action: "INFO_POST_CHANGED", description: `${what} informację`, userId: session.user.id, metadata: { postId: id, action, fields: Object.keys(data) } }, tx);
  });
  return NextResponse.json({ ok: true, version });
}

/** Trwałe usunięcie informacji (każdy status) z załącznikami, ewidencją otwarć i powiadomieniami. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const cur = await prisma.infoPost.findUnique({ where: { id }, include: { attachments: { select: { storedName: true } } } });
  if (!cur) return new NextResponse("Nie znaleziono", { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.infoPost.delete({ where: { id } });
    await tx.notification.deleteMany({ where: { link: `/session/informacje/${id}` } });
    await audit({ action: "INFO_POST_CHANGED", description: "Usunięto trwale informację", userId: session.user.id, metadata: { postId: id } }, tx);
  });
  for (const a of cur.attachments) await deleteAttachmentFile(a.storedName);
  return NextResponse.json({ ok: true });
}
