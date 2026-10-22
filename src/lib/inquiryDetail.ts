import { prisma } from "@/lib/db";
import { addresseeAnswered, bySeq } from "@/lib/inquiries";
import { hasSubmitRight, moduleEnabled } from "@/lib/inquiryAccess";

export type Viewer = { id: string; role: string };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Karta sprawy dla operatora albo autora. Szkice pism autora (i szkic całej sprawy) widzą
 * wyłącznie autorzy; operator widzi pisma utrwalone. null = brak dostępu.
 */
export async function loadInquiry(id: string, viewer: Viewer) {
  const c = await prisma.inquiryCase.findUnique({
    where: { id },
    include: {
      authors: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      addressees: { orderBy: { order: "asc" } },
      letters: { include: { attachments: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, isPublicVersion: true } } } },
      meeting: { select: { id: true, number: true, name: true } },
    },
  });
  if (!c) return null;
  const isOperator = viewer.role === "OPERATOR";
  const me = c.authors.find((a) => a.userId === viewer.id) ?? null;
  if (!isOperator && !me) return null;
  // Sprawa w szkicu autora nie jest widoczna dla operatora (chyba że to operator ją wprowadza).
  if (isOperator && c.status === "DRAFT" && !c.enteredById) return null;

  const enabled = await moduleEnabled();
  const right = !isOperator && (await hasSubmitRight(viewer.id, c.orgUnitId));
  const users = await prisma.user.findMany({
    where: { id: { in: [c.registeredById, c.enteredById, c.createdById, ...c.letters.map((l) => l.createdById)].filter((x): x is string => !!x) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameOf = (uid: string | null) => { const u = users.find((x) => x.id === uid); return u ? `${u.firstName} ${u.lastName}` : null; };
  const now = Date.now();
  const letters = c.letters
    .filter((l) => l.state === "FINAL" || (!!me && (l.createdById === viewer.id || l.kind === "SUBMISSION")) || (isOperator && !!c.enteredById && l.kind === "SUBMISSION"))
    .sort(bySeq);

  return {
    id: c.id, kind: c.kind, status: c.status, number: c.number, period: c.period, title: c.title, orgUnitId: c.orgUnitId,
    meeting: c.meeting, submittedAt: iso(c.submittedAt), receivedAt: iso(c.receivedAt), registeredAt: iso(c.registeredAt),
    registeredBy: nameOf(c.registeredById), enteredBy: nameOf(c.enteredById), closedAt: iso(c.closedAt), withdrawnAt: iso(c.withdrawnAt),
    published: c.published, publishedAt: iso(c.publishedAt), publicTitle: c.publicTitle, createdAt: iso(c.createdAt),
    authors: c.authors.map((a) => ({ id: a.id, userId: a.userId, name: a.name, isPrimary: a.isPrimary, confirmation: a.confirmation, confirmedAt: iso(a.confirmedAt) })),
    addressees: c.addressees.map((a) => ({
      id: a.id, name: a.name, institution: a.institution, forwardedAt: iso(a.forwardedAt), forwardNote: isOperator ? a.forwardNote : null, dueDate: iso(a.dueDate),
      responderUserId: isOperator ? a.responderUserId : null,
      answered: addresseeAnswered(c, a.id),
      overdue: !!a.forwardedAt && !!a.dueDate && a.dueDate.getTime() < now && !addresseeAnswered(c, a.id),
    })),
    letters: letters.map((l) => ({
      id: l.id, seq: l.seq, kind: l.kind, state: l.state, addresseeId: l.addresseeId, refLetterId: l.refLetterId, authorName: l.authorName,
      title: l.title, body: l.body, letterDate: iso(l.letterDate), receivedAt: iso(l.receivedAt), finalizedAt: iso(l.finalizedAt),
      createdAt: iso(l.createdAt), createdBy: nameOf(l.createdById), mine: l.createdById === viewer.id,
      published: l.published, publicBody: isOperator ? l.publicBody : null,
      attachments: l.attachments.filter((a) => isOperator || !a.isPublicVersion),
    })),
    viewer: {
      isOperator, enabled,
      myAuthor: me ? { id: me.id, isPrimary: me.isPrimary, confirmation: me.confirmation } : null,
      canSubmit: enabled && right,
    },
  };
}

export type InquiryView = NonNullable<Awaited<ReturnType<typeof loadInquiry>>>;
