import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled, requireSubmitRight } from "@/lib/inquiryAccess";
import { loadInquiry } from "@/lib/inquiryDetail";
import { deleteAttachmentFile } from "@/lib/attachments";

/** Karta sprawy (operator albo autor/zaproszony współautor). Odczyt nie wymaga prawa składania. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const c = await loadInquiry(id, session.user);
  if (!c) return new NextResponse("Nie znaleziono", { status: 404 });
  return NextResponse.json(c);
}

const schema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  body: z.string().max(200_000).optional(),
  addressees: z.array(z.object({ name: z.string().trim().min(1).max(300), institution: z.string().trim().max(300).optional().nullable() })).max(30).optional(),
  coAuthorUserIds: z.array(z.string().max(64)).max(50).optional(),
  orgUnitId: z.string().max(64).optional().nullable(),
  meetingId: z.string().max(64).optional().nullable(),
});

/**
 * PATCH - edycja szkicu przez autora głównego (z prawem składania) albo danych porządkowych
 * (powiązanie z posiedzeniem/grupą) przez operatora. Po złożeniu treść nie jest nadpisywana -
 * zmiana odbywa się jawnym pismem (korekta/uzupełnienie).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("inquiry PATCH", async () => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const c = await prisma.inquiryCase.findUnique({ where: { id }, include: { authors: true } });
    if (!c) throw new HttpError(404, "Nie znaleziono");
    if (session.user.role === "OPERATOR") {
      await requireModuleEnabled();
      if (c.status === "DRAFT" && !c.enteredById) throw new HttpError(404, "Nie znaleziono");
      await prisma.$transaction(async (tx) => {
        await tx.inquiryCase.update({ where: { id }, data: {
          ...(d.meetingId !== undefined ? { meetingId: d.meetingId || null } : {}),
          ...(d.orgUnitId !== undefined ? { orgUnitId: d.orgUnitId || null } : {}),
        } });
        await audit({ action: "INQUIRY_CHANGED", description: `Zmieniono powiązania sprawy „${c.title}”`, userId: session.user.id, metadata: { caseId: id, fields: Object.keys(d) } }, tx);
      });
      return NextResponse.json({ ok: true });
    }
    const primary = c.authors.find((a) => a.isPrimary);
    if (primary?.userId !== session.user.id) throw new HttpError(403, "Szkic może zmieniać autor główny.");
    await requireSubmitRight(session.user.id, d.orgUnitId !== undefined ? d.orgUnitId : c.orgUnitId);
    if (c.status !== "DRAFT") throw new HttpError(409, "Sprawa została złożona - zmiany wprowadza się jako korektę lub uzupełnienie.");
    const co = d.coAuthorUserIds?.filter((x) => x !== session.user.id);
    const coUsers = co ? await prisma.user.findMany({ where: { id: { in: co }, active: true, role: "PARTICIPANT" }, select: { id: true, firstName: true, lastName: true } }) : null;
    await prisma.$transaction(async (tx) => {
      await tx.inquiryCase.update({ where: { id }, data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.orgUnitId !== undefined ? { orgUnitId: d.orgUnitId || null } : {}),
        ...(d.meetingId !== undefined ? { meetingId: d.meetingId || null } : {}),
      } });
      if (d.title !== undefined || d.body !== undefined)
        await tx.inquiryLetter.updateMany({ where: { caseId: id, kind: "SUBMISSION", state: "DRAFT" }, data: { ...(d.title !== undefined ? { title: d.title } : {}), ...(d.body !== undefined ? { body: d.body } : {}) } });
      if (d.addressees) {
        await tx.inquiryAddressee.deleteMany({ where: { caseId: id } });
        await tx.inquiryAddressee.createMany({ data: d.addressees.map((a, i) => ({ caseId: id, name: a.name, institution: a.institution || null, order: i })) });
      }
      if (coUsers) {
        await tx.inquiryAuthor.deleteMany({ where: { caseId: id, isPrimary: false, userId: { notIn: coUsers.map((u) => u.id) } } });
        const existing = new Set(c.authors.map((a) => a.userId));
        for (const u of coUsers) if (!existing.has(u.id)) await tx.inquiryAuthor.create({ data: { caseId: id, userId: u.id, name: `${u.firstName} ${u.lastName}`, confirmation: "PENDING" } });
      }
    });
    return NextResponse.json({ ok: true });
  });
}

/**
 * DELETE - trwałe usunięcie sprawy z korespondencją i plikami.
 *  - Operator: dowolna sprawa widoczna w rejestrze.
 *  - Autor główny: wyłącznie niezłożony szkic.
 * Numeracja: kolejny numer to „największy zajęty + 1” w rodzaju i okresie - usunięcie ostatniej
 * sprawy zwalnia jej numer, usunięcie wcześniejszej nie zmienia numerów pozostałych (luka zostaje).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("inquiry DELETE", async () => {
    const c = await prisma.inquiryCase.findUnique({ where: { id }, include: { authors: true } });
    if (!c) throw new HttpError(404, "Nie znaleziono");
    const isOperator = session.user.role === "OPERATOR";
    if (isOperator) {
      if (c.status === "DRAFT" && !c.enteredById) throw new HttpError(404, "Nie znaleziono");
    } else {
      // Spoza grona autorów - jak nieistniejąca sprawa (bez ujawniania jej stanu).
      if (!c.authors.some((a) => a.userId === session.user.id)) throw new HttpError(404, "Nie znaleziono");
      if (c.authors.find((a) => a.isPrimary)?.userId !== session.user.id) throw new HttpError(403, "Szkic może usunąć autor główny.");
      if (c.status !== "DRAFT") throw new HttpError(409, "Usunąć można tylko niezłożony szkic.");
    }
    const files = await prisma.inquiryAttachment.findMany({ where: { letter: { caseId: id } }, select: { storedName: true } });
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InquiryCase" WHERE id = ${id} FOR UPDATE`;
      await tx.inquiryCase.delete({ where: { id } });
      await tx.notification.deleteMany({ where: { link: { in: [`/inquiries/${id}`, `/session/interpelacje/${id}`, `/odpowiedzi/${id}`] } } });
      await audit({
        action: "INQUIRY_CHANGED",
        description: c.status === "DRAFT" ? "Usunięto szkic sprawy" : `Usunięto trwale sprawę${c.number ? ` nr ${c.number}` : ""}`,
        userId: session.user.id, metadata: { caseId: id, number: c.number, kind: c.kind },
      }, tx);
    });
    for (const f of files) await deleteAttachmentFile(f.storedName);
    return NextResponse.json({ ok: true });
  });
}
