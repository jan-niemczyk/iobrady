import { prisma } from "@/lib/db";
import type { InquiryStatus, Prisma } from "@prisma/client";

/**
 * Sprawy interpelacji i zapytań: stan obiegu wynika z rzeczywistych zdarzeń zapisanych w sprawie
 * (złożenie, rejestracja, przekazania, pisma), a nie z ręcznie ustawianej etykiety.
 *  - Każdy adresat ma osobne przekazanie i osobne odpowiedzi; odpowiedź jednego adresata nie
 *    oznacza odpowiedzi pozostałych.
 *  - Ponowienie pytania do adresata po jego odpowiedzi znów oznacza oczekiwanie na tego adresata.
 *  - „Otrzymano odpowiedzi” nie zamyka sprawy - zakończenie jest osobną, jawną czynnością.
 */

type CaseForStatus = {
  submittedAt: Date | null; receivedAt: Date | null; registeredAt: Date | null; closedAt: Date | null; withdrawnAt: Date | null;
  addressees: { id: string; forwardedAt: Date | null }[];
  letters: { kind: string; state: string; addresseeId: string | null; seq?: number | null; createdAt: Date }[];
};

/** Kolejność pism w sprawie: numer porządkowy nadany przy dodaniu (daty pism mogą być wpisane wstecz). */
const letterOrder = (l: CaseForStatus["letters"][number]) => l.seq ?? l.createdAt.getTime() / 1e13;
export const bySeq = <T extends { seq?: number | null; createdAt: Date }>(a: T, b: T) =>
  (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER) || a.createdAt.getTime() - b.createdAt.getTime();

/** Czy adresat odpowiedział na ostatnie skierowane do niego pytanie. */
export function addresseeAnswered(c: CaseForStatus, addresseeId: string): boolean {
  const final = c.letters.filter((l) => l.state === "FINAL" && l.addresseeId === addresseeId);
  const answers = final.filter((l) => l.kind === "ANSWER");
  if (answers.length === 0) return false;
  const lastAnswer = Math.max(...answers.map(letterOrder));
  const lastFollowup = Math.max(0, ...final.filter((l) => l.kind === "FOLLOWUP").map(letterOrder));
  return lastAnswer >= lastFollowup;
}

export function deriveStatus(c: CaseForStatus): InquiryStatus {
  if (c.withdrawnAt) return "WITHDRAWN";
  if (c.closedAt) return "CLOSED";
  if (!c.submittedAt && !c.receivedAt) return "DRAFT";
  if (!c.registeredAt) return "SUBMITTED";
  const forwarded = c.addressees.filter((a) => a.forwardedAt);
  if (forwarded.length === 0) return "REGISTERED";
  const answered = forwarded.filter((a) => addresseeAnswered(c, a.id)).length;
  if (answered === 0) return forwarded.length < c.addressees.length ? "FORWARDED" : "AWAITING";
  if (answered === c.addressees.length) return "ANSWERED";
  return "PARTIAL";
}

/** Przelicza i zapisuje stan sprawy (w transakcji czynności). */
export async function refreshStatus(tx: Prisma.TransactionClient, caseId: string): Promise<InquiryStatus> {
  const c = await tx.inquiryCase.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      submittedAt: true, receivedAt: true, registeredAt: true, closedAt: true, withdrawnAt: true,
      addressees: { select: { id: true, forwardedAt: true } },
      letters: { select: { kind: true, state: true, addresseeId: true, seq: true, createdAt: true } },
    },
  });
  const status = deriveStatus(c);
  await tx.inquiryCase.update({ where: { id: caseId }, data: { status } });
  return status;
}

/** Okres numeracji według konfiguracji: rok wpływu/złożenia albo oznaczenie bieżącej kadencji. */
export async function numberPeriod(at: Date): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { inquiryNumberScope: true, currentTermLabel: true } });
  if (s?.inquiryNumberScope === "TERM") {
    if (!s.currentTermLabel) throw new Error("TERM_LABEL_MISSING");
    return s.currentTermLabel;
  }
  return String(Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Warsaw" }).format(at)));
}

/**
 * Kolejny numer w rodzaju i okresie. Wywoływać w transakcji: blokada doradcza na (rodzaj, okres)
 * szereguje równoczesne rejestracje, a unikalny indeks (kind, period, seq) jest dodatkowym
 * zabezpieczeniem przed duplikatem. Edycja szkicu numeru nie zużywa.
 */
export async function nextSeq(tx: Prisma.TransactionClient, kind: string, period: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inquiry:${kind}:${period}`}))`;
  const agg = await tx.inquiryCase.aggregate({ where: { kind: kind as never, period }, _max: { seq: true } });
  return (agg._max.seq ?? 0) + 1;
}

export const formatNumber = (seq: number, period: string) => `${seq}/${period}`;

type DueRule = { days: number | null; start: "FORWARDED" | "RECEIVED" } | null | undefined;

/** Termin odpowiedzi z reguły jednostki (jeśli skonfigurowana) - inaczej null (ręczny albo nieustalony). */
export async function dueFromRule(kind: string, forwardedAt: Date, receivedAt: Date | null): Promise<Date | null> {
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { inquiryDueRules: true } });
  const rules = (s?.inquiryDueRules ?? {}) as Record<string, DueRule>;
  const r = rules[kind];
  if (!r?.days) return null;
  const from = r.start === "RECEIVED" ? (receivedAt ?? forwardedAt) : forwardedAt;
  return new Date(from.getTime() + r.days * 24 * 3600 * 1000);
}

/** Konta operatorów - adresaci powiadomień o złożeniu i nowych pismach autorów. */
export async function operatorIds(): Promise<string[]> {
  return (await prisma.user.findMany({ where: { role: "OPERATOR", active: true }, select: { id: true } })).map((u) => u.id);
}

/** Potwierdzeni autorzy (konta) sprawy - adresaci powiadomień o rejestracji i odpowiedziach. */
export async function confirmedAuthorIds(tx: Prisma.TransactionClient, caseId: string): Promise<string[]> {
  const rows = await tx.inquiryAuthor.findMany({ where: { caseId, userId: { not: null }, confirmation: { not: "PENDING" } }, select: { userId: true } });
  return rows.map((r) => r.userId!).filter(Boolean);
}

export async function notify(tx: Prisma.TransactionClient, userIds: string[], title: string, link: string) {
  const ids = [...new Set(userIds)];
  if (ids.length) await tx.notification.createMany({ data: ids.map((userId) => ({ userId, kind: "INQUIRY", title: title.slice(0, 300), link })) });
}

/** Kolejny numer porządkowy pisma w sprawie - wywoływać w transakcji z blokadą wiersza sprawy. */
export async function nextLetterSeq(tx: Prisma.TransactionClient, caseId: string): Promise<number> {
  await tx.$queryRaw`SELECT id FROM "InquiryCase" WHERE id = ${caseId} FOR UPDATE`;
  const agg = await tx.inquiryLetter.aggregate({ where: { caseId }, _max: { seq: true } });
  return (agg._max.seq ?? 0) + 1;
}
