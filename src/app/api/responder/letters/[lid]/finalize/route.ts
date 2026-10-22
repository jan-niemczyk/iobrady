import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled } from "@/lib/inquiryAccess";
import { myAnswerDraft, requireResponder } from "@/lib/responder";
import { confirmedAuthorIds, nextLetterSeq, notify, operatorIds, refreshStatus } from "@/lib/inquiries";

/** POST - złożenie szkicu odpowiedzi (treść lub co najmniej jeden plik). */
export async function POST(_req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("responder finalize", async () => {
    await requireResponder(session.user);
    await requireModuleEnabled();
    const l = await myAnswerDraft(session.user.id, lid);
    if (l.state !== "DRAFT") throw new HttpError(409, "Odpowiedź została już złożona.");
    if (l.case.withdrawnAt) throw new HttpError(409, "Sprawa została wycofana.");
    const files = await prisma.inquiryAttachment.count({ where: { letterId: lid } });
    if (!l.body.trim() && files === 0) throw new HttpError(400, "Dodaj treść albo plik odpowiedzi.");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.inquiryLetter.update({ where: { id: lid }, data: { seq: await nextLetterSeq(tx, l.caseId), state: "FINAL", finalizedAt: now, receivedAt: now, letterDate: l.letterDate ?? now } });
      const status = await refreshStatus(tx, l.caseId);
      await audit({ action: "INQUIRY_CHANGED", description: "Złożono odpowiedź (konto odpowiadającego)", userId: session.user.id, metadata: { caseId: l.caseId, letterId: lid, status } }, tx);
      await notify(tx, await operatorIds(tx), `Nowa odpowiedź: ${l.case.title}`, `/inquiries/${l.caseId}`);
      await notify(tx, await confirmedAuthorIds(tx, l.caseId), `Nowa odpowiedź: ${l.case.title}`, `/session/interpelacje/${l.caseId}`);
    });
    return NextResponse.json({ ok: true });
  });
}
