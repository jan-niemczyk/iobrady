import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireSubmitRight } from "@/lib/inquiryAccess";
import { letterForViewer } from "@/lib/inquiryLetterAccess";
import { nextLetterSeq, notify, operatorIds, refreshStatus } from "@/lib/inquiries";
import { LETTER_KIND_LABEL } from "@/lib/inquiryLabels";

/** POST - złożenie szkicu pisma autora (uzupełnienie, ponowienie, korekta): utrwala treść i datę. */
export async function POST(_req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("inquiry letter finalize", async () => {
    const { letter: l, me } = await letterForViewer(lid, session.user);
    if (!me || l.createdById !== session.user.id || l.kind === "SUBMISSION") throw new HttpError(403, "Złożyć można własne pismo.");
    await requireSubmitRight(session.user.id, l.case.orgUnitId);
    if (l.state !== "DRAFT") throw new HttpError(409, "Pismo zostało już złożone.");
    if (!l.body.trim()) throw new HttpError(400, "Uzupełnij treść pisma.");
    if (l.case.withdrawnAt) throw new HttpError(409, "Sprawa została wycofana.");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.inquiryLetter.update({ where: { id: lid }, data: { seq: await nextLetterSeq(tx, l.caseId), state: "FINAL", finalizedAt: now, letterDate: l.letterDate ?? now, receivedAt: now, authorName: l.case.authors.filter((a) => a.confirmation !== "PENDING").map((a) => a.name).join(", ") } });
      const status = await refreshStatus(tx, l.caseId);
      await audit({ action: "INQUIRY_CHANGED", description: `Złożono: ${LETTER_KIND_LABEL[l.kind]} - sprawa „${l.case.title}”`, userId: session.user.id, metadata: { caseId: l.caseId, letterId: lid, status } }, tx);
      await notify(tx, await operatorIds(tx), `${LETTER_KIND_LABEL[l.kind]}: ${l.case.title}`, `/inquiries/${l.caseId}`);
    });
    return NextResponse.json({ ok: true });
  });
}
