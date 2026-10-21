import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled, requireSubmitRight } from "@/lib/inquiryAccess";
import { letterForViewer } from "@/lib/inquiryLetterAccess";
import { deleteAttachmentFile } from "@/lib/attachments";
import { LETTER_KIND_LABEL } from "@/lib/inquiryLabels";

const schema = z.object({
  title: z.string().trim().max(500).nullable().optional(),
  body: z.string().max(200_000).optional(),
  refLetterId: z.string().max(64).nullable().optional(),
  addresseeId: z.string().max(64).nullable().optional(),
  // Publikacja (operator): wersja publiczna osobno od wewnętrznego oryginału.
  published: z.boolean().optional(),
  publicBody: z.string().max(200_000).nullable().optional(),
});

/** PATCH - autor: edycja własnego szkicu pisma; operator: wersja publiczna i publikacja pisma. */
export async function PATCH(req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("inquiry letter PATCH", async () => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const { letter: l, isOperator } = await letterForViewer(lid, session.user);
    if (isOperator) {
      await requireModuleEnabled();
      if (d.published === true) {
        if (l.state !== "FINAL") throw new HttpError(409, "Publikuje się wyłącznie pisma utrwalone.");
        const body = d.publicBody !== undefined ? d.publicBody : l.publicBody;
        const publicFiles = await prisma.inquiryAttachment.count({ where: { letterId: lid, isPublicVersion: true } });
        if (!body?.trim() && publicFiles === 0) throw new HttpError(400, "Przygotuj wersję publiczną (treść albo plik wersji publicznej).");
      }
      await prisma.$transaction(async (tx) => {
        await tx.inquiryLetter.update({ where: { id: lid }, data: {
          ...(d.publicBody !== undefined ? { publicBody: d.publicBody || null } : {}),
          ...(d.published !== undefined ? { published: d.published } : {}),
        } });
        await audit({ action: "INQUIRY_CHANGED", description: `${d.published === true ? "Opublikowano" : d.published === false ? "Wycofano z publikacji" : "Zmieniono wersję publiczną"}: ${LETTER_KIND_LABEL[l.kind]} - sprawa „${l.case.title}”`, userId: session.user.id, metadata: { caseId: l.caseId, letterId: lid } }, tx);
      });
      return NextResponse.json({ ok: true });
    }
    if (l.createdById !== session.user.id || l.state !== "DRAFT" || l.kind === "SUBMISSION") throw new HttpError(409, "Edytować można własny szkic pisma (treść sprawy - w szkicu sprawy).");
    await requireSubmitRight(session.user.id, l.case.orgUnitId);
    if (d.refLetterId && !(await prisma.inquiryLetter.count({ where: { id: d.refLetterId, caseId: l.caseId } }))) throw new HttpError(400, "Nieprawidłowe pismo powiązane.");
    await prisma.inquiryLetter.update({ where: { id: lid }, data: {
      ...(d.title !== undefined ? { title: d.title || null } : {}),
      ...(d.body !== undefined ? { body: d.body } : {}),
      ...(d.refLetterId !== undefined ? { refLetterId: d.refLetterId || null } : {}),
      ...(d.addresseeId !== undefined ? { addresseeId: d.addresseeId || null } : {}),
    } });
    return NextResponse.json({ ok: true });
  });
}

/** DELETE - autor usuwa własny szkic pisma (pisma utrwalone pozostają w historii). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("inquiry letter DELETE", async () => {
    const { letter: l } = await letterForViewer(lid, session.user);
    if (l.createdById !== session.user.id || l.state !== "DRAFT" || l.kind === "SUBMISSION") throw new HttpError(409, "Usunąć można tylko własny szkic pisma.");
    const files = await prisma.inquiryAttachment.findMany({ where: { letterId: lid }, select: { storedName: true } });
    await prisma.inquiryLetter.delete({ where: { id: lid } });
    for (const f of files) await deleteAttachmentFile(f.storedName);
    return NextResponse.json({ ok: true });
  });
}
