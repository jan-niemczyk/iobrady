import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { normalizeLinks, visibleWhere } from "@/lib/info";
import { infoSchema } from "@/lib/infoSchema";

const nameOf = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : null);

/**
 * GET - operator: wszystkie komunikaty (filtr ?status=); radny: tylko widoczne dla niego teraz,
 * ze stanem odczytu bieżącej wersji. Pobranie listy NIE zapisuje odczytu.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  if (session.user.role === "OPERATOR") {
    const status = sp.get("status");
    const posts = await prisma.infoPost.findMany({
      where: status && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status) ? { status } : {},
      orderBy: [{ updatedAt: "desc" }],
      include: { _count: { select: { attachments: true } } },
    });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(posts.flatMap((p) => [p.authorId, p.editorId]).filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return NextResponse.json(posts.map((p) => ({
      id: p.id, title: p.title, category: p.category, kind: p.kind, status: p.status, pinned: p.pinned, important: p.important,
      publishedAt: p.publishedAt, eventAt: p.eventAt, expiresAt: p.expiresAt, version: p.version, updatedAt: p.updatedAt,
      audienceAll: p.audienceAll, audienceOrgUnitIds: p.audienceOrgUnitIds, audienceUserIds: p.audienceUserIds,
      author: nameOf(byId.get(p.authorId ?? "")), attachments: p._count.attachments,
    })));
  }
  const where = await visibleWhere(session.user.id);
  const posts = await prisma.infoPost.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { important: "desc" }, { publishedAt: "desc" }],
    include: { _count: { select: { attachments: true } }, reads: { where: { userId: session.user.id }, select: { version: true } } },
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(posts.map((p) => p.authorId).filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return NextResponse.json(posts.map((p) => {
    const readVersions = p.reads.map((r) => r.version);
    const read = readVersions.includes(p.version);
    return {
      id: p.id, title: p.title, category: p.category, kind: p.kind, pinned: p.pinned, important: p.important,
      publishedAt: p.publishedAt, eventAt: p.eventAt, expiresAt: p.expiresAt, version: p.version,
      author: nameOf(byId.get(p.authorId ?? "")), attachments: p._count.attachments,
      unread: !read, changed: !read && readVersions.length > 0,
      excerpt: p.body.replace(/\*\*|_|\[(do-srodka|do-prawej|wyjustuj)\]/g, "").replace(/\s+/g, " ").slice(0, 220),
    };
  }));
}

/** POST - nowy komunikat (szkic). Tylko operator. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const parsed = infoSchema.extend({ title: z.string().trim().min(1, "Podaj tytuł.").max(300) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  const p = await prisma.$transaction(async (tx) => {
    const p = await tx.infoPost.create({
      data: {
        title: d.title, body: d.body ?? "", category: d.category || "Komunikat", kind: d.kind ?? "NEWS",
        pinned: d.pinned ?? false, important: d.important ?? false,
        eventAt: d.eventAt ? new Date(d.eventAt) : null, expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        links: normalizeLinks(d.links) as never,
        audienceAll: d.audienceAll ?? false, audienceOrgUnitIds: d.audienceOrgUnitIds ?? [], audienceUserIds: d.audienceUserIds ?? [],
        authorId: session.user.id, editorId: session.user.id,
      },
    });
    await audit({ action: "INFO_POST_CHANGED", description: "Utworzono szkic informacji", userId: session.user.id, metadata: { postId: p.id } }, tx);
    return p;
  });
  return NextResponse.json({ ok: true, id: p.id });
}
