import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled, requireSubmitRight } from "@/lib/inquiryAccess";
import { confirmedAuthorIds, nextLetterSeq, notify, operatorIds, refreshStatus } from "@/lib/inquiries";
import { AUTHOR_LETTER_KINDS, LETTER_KIND_LABEL, OPERATOR_LETTER_KINDS } from "@/lib/inquiryLabels";

const date = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "Nieprawidłowa data.");
const schema = z.object({
  kind: z.enum(["ANSWER", "SUPPLEMENT", "FOLLOWUP", "CORRECTION", "OTHER"]),
  addresseeId: z.string().max(64).nullable().optional(),
  refLetterId: z.string().max(64).nullable().optional(),
  authorName: z.string().trim().max(300).nullable().optional(),
  title: z.string().trim().max(500).nullable().optional(),
  body: z.string().max(200_000).default(""),
  letterDate: date.nullable().optional(),
  receivedAt: date.nullable().optional(),
  /** Autor: false = szkic pisma, true = złożenie od razu. */
  submit: z.boolean().optional(),
});

/**
 * POST - nowe pismo w istniejącej sprawie (oddzielny rekord - nie nadpisuje wcześniejszych).
 *  - Operator: odpowiedź adresata (także wyłącznie jako plik - treść może być pusta), uzupełnienie,
 *    ponowienie, korekta, inne pismo otrzymane poza aplikacją; z datą pisma i wpływu.
 *  - Autor (prawo składania): uzupełnienie, ponowienie pytania, korekta - szkic albo złożenie.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("inquiry letter POST", async () => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const isOperator = session.user.role === "OPERATOR";
    const c = await prisma.inquiryCase.findUnique({ where: { id }, include: { authors: true, addressees: { select: { id: true, name: true } } } });
    if (!c) throw new HttpError(404, "Nie znaleziono");
    const me = c.authors.find((a) => a.userId === session.user.id && a.confirmation !== "PENDING");
    if (!isOperator && !me) throw new HttpError(404, "Nie znaleziono");
    if (isOperator) {
      await requireModuleEnabled();
      if (c.status === "DRAFT" && !c.enteredById) throw new HttpError(404, "Nie znaleziono");
      if (!(OPERATOR_LETTER_KINDS as readonly string[]).includes(d.kind)) throw new HttpError(400, "Nieprawidłowy rodzaj pisma.");
    } else {
      await requireSubmitRight(session.user.id, c.orgUnitId);
      if (!(AUTHOR_LETTER_KINDS as readonly string[]).includes(d.kind)) throw new HttpError(400, "Ten rodzaj pisma rejestruje operator.");
    }
    if (c.status === "DRAFT") throw new HttpError(409, "Najpierw złóż sprawę.");
    if (c.withdrawnAt) throw new HttpError(409, "Sprawa została wycofana.");
    if (d.addresseeId && !c.addressees.some((a) => a.id === d.addresseeId)) throw new HttpError(400, "Nieprawidłowy adresat.");
    if (d.kind === "ANSWER" && !d.addresseeId) throw new HttpError(400, "Wskaż adresata, od którego jest odpowiedź.");
    if (d.kind === "ANSWER" && !d.receivedAt) throw new HttpError(400, "Podaj datę wpływu odpowiedzi.");
    if (d.refLetterId && !(await prisma.inquiryLetter.count({ where: { id: d.refLetterId, caseId: id } }))) throw new HttpError(400, "Nieprawidłowe pismo powiązane.");
    if (!isOperator && !d.body.trim()) throw new HttpError(400, "Uzupełnij treść pisma.");
    const final = isOperator || d.submit === true;
    const now = new Date();
    const addresseeName = c.addressees.find((a) => a.id === d.addresseeId)?.name;
    // Odpowiedź: imię i nazwisko podpisującego, pod nim adresat (funkcja/urząd); bez nazwiska - sam adresat.
    const answerAuthor = d.kind === "ANSWER" && d.authorName && addresseeName && !d.authorName.includes(addresseeName) ? `${d.authorName}\n${addresseeName}` : d.authorName;
    const authorName = isOperator ? (answerAuthor || (d.kind === "ANSWER" ? addresseeName : null) || null) : c.authors.filter((a) => a.confirmation !== "PENDING").map((a) => a.name).join(", ");
    const letter = await prisma.$transaction(async (tx) => {
      // Numer porządkowy tylko dla pisma utrwalonego (szkic dostaje go przy złożeniu).
      const seq = final ? await nextLetterSeq(tx, id) : null;
      const l = await tx.inquiryLetter.create({
        data: {
          caseId: id, seq, kind: d.kind, addresseeId: d.addresseeId || null, refLetterId: d.refLetterId || null, authorName,
          authorUserId: isOperator ? null : session.user.id, title: d.title || null, body: d.body,
          letterDate: d.letterDate ? new Date(d.letterDate) : final ? (isOperator ? null : now) : null,
          receivedAt: d.receivedAt ? new Date(d.receivedAt) : !isOperator && final ? now : null,
          state: final ? "FINAL" : "DRAFT", finalizedAt: final ? now : null, createdById: session.user.id,
        },
      });
      const status = await refreshStatus(tx, id);
      const what = `${LETTER_KIND_LABEL[d.kind]}${addresseeName ? ` (${addresseeName})` : ""}`;
      await audit({ action: "INQUIRY_CHANGED", description: `${final ? "Dodano" : "Utworzono szkic"}: ${what} - sprawa „${c.title}”`, userId: session.user.id, metadata: { caseId: id, letterId: l.id, kind: d.kind, status } }, tx);
      if (final && isOperator && (d.kind === "ANSWER" || d.kind === "OTHER" || d.kind === "SUPPLEMENT"))
        await notify(tx, await confirmedAuthorIds(tx, id), `${d.kind === "ANSWER" ? "Nowa odpowiedź" : what}: ${c.title}`, `/session/interpelacje/${id}`);
      if (final && !isOperator) await notify(tx, await operatorIds(tx), `${what}: ${c.title}`, `/inquiries/${id}`);
      return l;
    });
    return NextResponse.json({ ok: true, id: letter.id });
  });
}
