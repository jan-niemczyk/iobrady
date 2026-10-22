import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/booth";
import { addresseeAnswered, bySeq } from "@/lib/inquiries";
import type { PdfCase } from "@/lib/inquiryPdf";

/**
 * Konto odpowiadającego (rola RESPONDER). Dostęp wyłącznie do spraw, w których operator przypisał
 * to konto adresatowi i odnotował przekazanie. Widoczne: pismo wnoszące, pisma skierowane do tego
 * adresata (lub do wszystkich) i odpowiedzi tego adresata. Bez uwag wewnętrznych, wersji publicznych
 * i pism innych adresatów. Proxy nie dopuszcza tej roli do żadnego innego API.
 */

export async function requireResponder(user: { id: string; role: string }) {
  if (user.role !== "RESPONDER") throw new HttpError(403, "Brak dostępu.");
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { active: true } });
  if (!u?.active) throw new HttpError(403, "Konto jest nieaktywne.");
}

/** Adresaci sprawy przypisani temu kontu i już przekazani; pusta lista = brak dostępu. */
export async function myAddressees(userId: string, caseId: string) {
  return prisma.inquiryAddressee.findMany({ where: { caseId, responderUserId: userId, forwardedAt: { not: null }, case: { status: { not: "DRAFT" } } } });
}

export async function requireCaseAccess(userId: string, caseId: string) {
  const mine = await myAddressees(userId, caseId);
  if (!mine.length) throw new HttpError(404, "Nie znaleziono");
  return mine;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function responderCases(userId: string) {
  const rows = await prisma.inquiryCase.findMany({
    where: { status: { not: "DRAFT" }, addressees: { some: { responderUserId: userId, forwardedAt: { not: null } } } },
    orderBy: [{ registeredAt: "desc" }, { createdAt: "desc" }],
    include: {
      addressees: true,
      letters: { select: { kind: true, state: true, addresseeId: true, seq: true, createdAt: true } },
    },
  });
  return rows.map((c) => {
    const mine = c.addressees.filter((a) => a.responderUserId === userId && a.forwardedAt);
    const answered = mine.every((a) => addresseeAnswered(c, a.id));
    const due = mine.map((a) => a.dueDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      id: c.id, kind: c.kind, number: c.number, title: c.title, forwardedAt: iso(mine[0]?.forwardedAt), dueDate: iso(due),
      answered, withdrawn: !!c.withdrawnAt, closed: !!c.closedAt, addressees: mine.map((a) => a.name),
    };
  });
}

/** Karta sprawy dla odpowiadającego - tylko niezbędne dane. */
export async function responderCase(userId: string, caseId: string) {
  const mine = await requireCaseAccess(userId, caseId);
  const mineIds = new Set(mine.map((a) => a.id));
  const c = await prisma.inquiryCase.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      authors: { where: { confirmation: { not: "PENDING" } }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      letters: { include: { attachments: { where: { isPublicVersion: false }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } } },
    },
  });
  const letters = c.letters
    .filter((l) => {
      if (l.kind === "SUBMISSION") return l.state === "FINAL";
      if (l.kind === "ANSWER") return !!l.addresseeId && mineIds.has(l.addresseeId) && (l.state === "FINAL" || l.createdById === userId);
      return l.state === "FINAL" && (!l.addresseeId || mineIds.has(l.addresseeId));
    })
    .sort(bySeq);
  return {
    id: c.id, kind: c.kind, number: c.number, title: c.title, receivedAt: iso(c.receivedAt ?? c.submittedAt), registeredAt: iso(c.registeredAt),
    withdrawn: !!c.withdrawnAt, closed: !!c.closedAt,
    authors: c.authors.map((a) => ({ name: a.name, confirmation: a.confirmation })),
    addressees: mine.map((a) => ({ id: a.id, name: a.name, institution: a.institution, forwardedAt: iso(a.forwardedAt), dueDate: iso(a.dueDate), answered: addresseeAnswered({ ...c, addressees: mine }, a.id) })),
    letters: letters.map((l) => ({
      id: l.id, seq: l.seq, kind: l.kind, state: l.state, addresseeId: l.addresseeId, refLetterId: l.refLetterId, authorName: l.authorName,
      title: l.title, body: l.body, letterDate: iso(l.letterDate), receivedAt: iso(l.receivedAt), finalizedAt: iso(l.finalizedAt),
      mine: l.createdById === userId, attachments: l.attachments,
    })),
  };
}

export type ResponderCase = Awaited<ReturnType<typeof responderCase>>;

export function responderPdfCase(c: ResponderCase): PdfCase {
  return {
    kind: c.kind, number: c.number, title: c.title, submittedAt: c.receivedAt, receivedAt: c.receivedAt, registeredAt: c.registeredAt,
    authors: c.authors, addressees: c.addressees.map((a) => ({ id: a.id, name: a.name, institution: a.institution, forwardedAt: a.forwardedAt })),
    letters: c.letters,
  };
}

/** Pismo odpowiadającego (szkic własnej odpowiedzi) albo 404. */
export async function myAnswerDraft(userId: string, lid: string) {
  const l = await prisma.inquiryLetter.findUnique({ where: { id: lid }, include: { case: { select: { id: true, title: true, withdrawnAt: true } } } });
  if (!l || l.kind !== "ANSWER" || l.createdById !== userId || !l.addresseeId) throw new HttpError(404, "Nie znaleziono");
  await requireCaseAccess(userId, l.caseId);
  return l;
}
