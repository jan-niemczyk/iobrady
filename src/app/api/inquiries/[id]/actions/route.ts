import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled, requireSubmitRight } from "@/lib/inquiryAccess";
import { confirmedAuthorIds, formatNumber, nextSeq, notify, numberPeriod, operatorIds, refreshStatus } from "@/lib/inquiries";
import { INQUIRY_KIND_LABEL } from "@/lib/inquiryLabels";

const schema = z.object({
  action: z.enum(["submit", "confirm-coauthor", "decline-coauthor", "register", "withdraw", "close", "reopen"]),
  /** Rejestracja: kontrolowane wpisanie numeru z istniejącego rejestru (zamiast kolejnego). */
  manualSeq: z.number().int().min(1).max(1_000_000).optional(),
  manualPeriod: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9 ._/-]+$/).optional(),
  reason: z.string().trim().max(2000).optional(),
});

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
/** Blokada wiersza sprawy - czynności na jednej sprawie wykonują się po kolei. */
async function lockCase(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "InquiryCase" WHERE id = ${id} FOR UPDATE`;
  return tx.inquiryCase.findUniqueOrThrow({ where: { id }, include: { authors: true } });
}

/**
 * POST - czynności w sprawie. Każda sprawdza po stronie serwera: włączenie modułu, a dla radnego
 * także aktywne konto, prawo składania (w zakresie grupy sprawy) i udział w sprawie.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("inquiry action", async () => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const isOperator = session.user.role === "OPERATOR";
    const pre = await prisma.inquiryCase.findUnique({ where: { id }, select: { orgUnitId: true, title: true, kind: true, authors: { select: { userId: true } } } });
    if (!pre) throw new HttpError(404, "Nie znaleziono");
    if (!isOperator && !pre.authors.some((a) => a.userId === session.user.id)) throw new HttpError(404, "Nie znaleziono");
    const operatorOnly = ["register", "close", "reopen"].includes(d.action);
    if (operatorOnly && !isOperator) throw new HttpError(403, "Czynność rejestru wykonuje operator.");
    if (isOperator && ["submit", "confirm-coauthor", "decline-coauthor"].includes(d.action)) throw new HttpError(403, "Operator nie składa pism w imieniu autora - rejestruje pismo otrzymane poza aplikacją.");
    if (isOperator) await requireModuleEnabled();
    else await requireSubmitRight(session.user.id, pre.orgUnitId);
    const link = (forOperator: boolean) => (forOperator ? `/inquiries/${id}` : `/session/interpelacje/${id}`);
    const label = `${INQUIRY_KIND_LABEL[pre.kind]}: ${pre.title}`;

    const result = await prisma.$transaction(async (tx) => {
      const message = await perform(tx);
      const status = await refreshStatus(tx, id);
      await audit({ action: "INQUIRY_CHANGED", description: `${message}: ${label}${d.reason ? ` (${d.reason})` : ""}`, userId: session.user.id, metadata: { caseId: id, action: d.action, status } }, tx);
      return message;
    });
    return NextResponse.json({ ok: true, message: result });

    async function perform(tx: Tx): Promise<string> {
      const c = await lockCase(tx, id);
      const me = c.authors.find((a) => a.userId === session!.user.id);
      switch (d.action) {
        case "submit": {
          if (!me?.isPrimary) throw new HttpError(403, "Złożyć może autor główny.");
          if (c.status !== "DRAFT") throw new HttpError(409, "Sprawa została już złożona.");
          const letter = await tx.inquiryLetter.findFirst({ where: { caseId: id, kind: "SUBMISSION" } });
          if (!letter?.body.trim()) throw new HttpError(400, "Uzupełnij treść przed złożeniem.");
          if ((await tx.inquiryAddressee.count({ where: { caseId: id } })) === 0) throw new HttpError(400, "Wskaż co najmniej jednego adresata.");
          const now = new Date();
          // Złożenie utrwala datę i treść (wersja złożona); dalsze zmiany tylko jawnymi pismami.
          await tx.inquiryLetter.update({ where: { id: letter.id }, data: { state: "FINAL", finalizedAt: now, letterDate: letter.letterDate ?? now, authorName: c.authors.filter((a) => a.confirmation !== "PENDING").map((a) => a.name).join(", ") } });
          await tx.inquiryCase.update({ where: { id }, data: { submittedAt: now } });
          await notify(tx, await operatorIds(), `Złożono: ${label}`, link(true));
          await notify(tx, c.authors.filter((a) => a.confirmation === "PENDING" && a.userId).map((a) => a.userId!), `Prośba o potwierdzenie współautorstwa: ${label}`, link(false));
          return "Złożono";
        }
        case "confirm-coauthor":
        case "decline-coauthor": {
          if (!me || me.isPrimary) throw new HttpError(403, "Nie jesteś zaproszonym współautorem.");
          if (me.confirmation !== "PENDING") throw new HttpError(409, "Współautorstwo zostało już potwierdzone.");
          if (c.withdrawnAt) throw new HttpError(409, "Sprawa została wycofana.");
          if (d.action === "confirm-coauthor") await tx.inquiryAuthor.update({ where: { id: me.id }, data: { confirmation: "SELF", confirmedAt: new Date() } });
          else await tx.inquiryAuthor.delete({ where: { id: me.id } });
          await notify(tx, c.authors.filter((a) => a.isPrimary && a.userId).map((a) => a.userId!), `${me.name} ${d.action === "confirm-coauthor" ? "potwierdza" : "odrzuca"} współautorstwo: ${label}`, link(false));
          return d.action === "confirm-coauthor" ? "Potwierdzono współautorstwo" : "Odrzucono współautorstwo";
        }
        case "register": {
          if (c.registeredAt) throw new HttpError(409, `Sprawa jest już zarejestrowana pod numerem ${c.number}.`);
          if (!c.submittedAt && !c.receivedAt) throw new HttpError(409, "Sprawa nie została złożona.");
          if (c.withdrawnAt) throw new HttpError(409, "Sprawa została wycofana.");
          let period: string;
          try { period = d.manualPeriod ?? await numberPeriod(c.receivedAt ?? c.submittedAt!); } catch { throw new HttpError(400, "Numeracja według kadencji wymaga oznaczenia bieżącej kadencji w Ustawieniach."); }
          let seq: number;
          if (d.manualSeq) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inquiry:${c.kind}:${period}`}))`;
            if (await tx.inquiryCase.count({ where: { kind: c.kind, period, seq: d.manualSeq } })) throw new HttpError(409, `Numer ${formatNumber(d.manualSeq, period)} jest już zajęty.`);
            seq = d.manualSeq;
          } else seq = await nextSeq(tx, c.kind, period);
          const number = formatNumber(seq, period);
          await tx.inquiryCase.update({ where: { id }, data: { seq, period, number, registeredAt: new Date(), registeredById: session!.user.id, receivedAt: c.receivedAt ?? c.submittedAt } });
          await notify(tx, await confirmedAuthorIds(tx, id), `Zarejestrowano pod numerem ${number}: ${label}`, link(false));
          return `Zarejestrowano pod numerem ${number}${d.manualSeq ? " (numer wpisany ręcznie)" : ""}`;
        }
        case "withdraw": {
          if (!isOperator && !me?.isPrimary) throw new HttpError(403, "Wycofać może autor główny.");
          if (c.withdrawnAt || c.status === "DRAFT") throw new HttpError(409, "Tej sprawy nie można wycofać.");
          await tx.inquiryCase.update({ where: { id }, data: { withdrawnAt: new Date() } });
          if (isOperator) await notify(tx, await confirmedAuthorIds(tx, id), `Odnotowano wycofanie: ${label}`, link(false));
          else await notify(tx, await operatorIds(), `Wycofano: ${label}`, link(true));
          return "Wycofano";
        }
        case "close": {
          if (c.closedAt || c.withdrawnAt) throw new HttpError(409, "Sprawa jest już zakończona.");
          if (!c.registeredAt) throw new HttpError(409, "Najpierw zarejestruj sprawę.");
          await tx.inquiryCase.update({ where: { id }, data: { closedAt: new Date() } });
          return "Zakończono";
        }
        case "reopen": {
          if (!c.closedAt) throw new HttpError(409, "Sprawa nie jest zakończona.");
          await tx.inquiryCase.update({ where: { id }, data: { closedAt: null } });
          return "Wznowiono";
        }
      }
    }
  });
}
