import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled } from "@/lib/inquiryAccess";
import { requireCaseAccess, requireResponder } from "@/lib/responder";
import { confirmedAuthorIds, nextLetterSeq, notify, operatorIds, refreshStatus } from "@/lib/inquiries";

const date = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "Nieprawidłowa data.");
const schema = z.object({
  addresseeId: z.string().max(64),
  refLetterId: z.string().max(64).nullable().optional(),
  title: z.string().trim().max(500).nullable().optional(),
  body: z.string().max(200_000).default(""),
  letterDate: date.nullable().optional(),
  submit: z.boolean().optional(),
});

/**
 * POST - odpowiedź adresata przypisanego temu kontu: szkic albo złożenie (utrwala treść, datę
 * wpływu i numer pisma). Autor odpowiedzi to adresat; konto zapisywane jako osoba wprowadzająca.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("responder answer", async () => {
    await requireResponder(session.user);
    await requireModuleEnabled();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const mine = await requireCaseAccess(session.user.id, id);
    const ad = mine.find((a) => a.id === d.addresseeId);
    if (!ad) throw new HttpError(403, "Ten adresat nie jest przypisany do Twojego konta.");
    const c = await prisma.inquiryCase.findUniqueOrThrow({ where: { id }, select: { title: true, withdrawnAt: true } });
    if (c.withdrawnAt) throw new HttpError(409, "Sprawa została wycofana.");
    if (d.refLetterId && !(await prisma.inquiryLetter.count({ where: { id: d.refLetterId, caseId: id, state: "FINAL" } }))) throw new HttpError(400, "Nieprawidłowe pismo powiązane.");
    const submit = d.submit === true;
    if (submit && !d.body.trim()) throw new HttpError(400, "Uzupełnij treść odpowiedzi albo zapisz szkic i dołącz plik.");
    const now = new Date();
    const l = await prisma.$transaction(async (tx) => {
      const seq = submit ? await nextLetterSeq(tx, id) : null;
      const l = await tx.inquiryLetter.create({
        data: {
          caseId: id, seq, kind: "ANSWER", addresseeId: ad.id, refLetterId: d.refLetterId || null,
          authorName: [ad.name, ad.institution].filter(Boolean).join(", "), authorUserId: session.user.id,
          title: d.title || null, body: d.body, letterDate: d.letterDate ? new Date(d.letterDate) : submit ? now : null,
          receivedAt: submit ? now : null, state: submit ? "FINAL" : "DRAFT", finalizedAt: submit ? now : null, createdById: session.user.id,
        },
      });
      const status = await refreshStatus(tx, id);
      await audit({ action: "INQUIRY_CHANGED", description: submit ? "Złożono odpowiedź (konto odpowiadającego)" : "Utworzono szkic odpowiedzi (konto odpowiadającego)", userId: session.user.id, metadata: { caseId: id, letterId: l.id, addresseeId: ad.id, status } }, tx);
      if (submit) {
        await notify(tx, await operatorIds(tx), `Nowa odpowiedź (${ad.name}): ${c.title}`, `/inquiries/${id}`);
        await notify(tx, await confirmedAuthorIds(tx, id), `Nowa odpowiedź: ${c.title}`, `/session/interpelacje/${id}`);
      }
      return l;
    });
    return NextResponse.json({ ok: true, id: l.id });
  });
}
