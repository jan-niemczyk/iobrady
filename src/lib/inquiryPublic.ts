import { prisma } from "@/lib/db";
import type { PdfCase } from "@/lib/inquiryPdf";

/**
 * Publiczny rejestr: wyłącznie sprawy opublikowane i opublikowane pisma utrwalone, w wersji
 * publicznej (treść przygotowana do publikacji, pliki oznaczone jako wersja publiczna). Wewnętrzny
 * oryginał, uwagi przekazania i dane kontaktowe nie są udostępniane. Wymaga włączenia archiwum.
 */
export async function publicArchiveEnabled(): Promise<boolean> {
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { inquiriesPublicArchive: true } });
  return s?.inquiriesPublicArchive === true;
}

const iso = (x: Date | null) => (x ? x.toISOString() : null);

export async function loadPublicCase(id: string) {
  if (!(await publicArchiveEnabled())) return null;
  const c = await prisma.inquiryCase.findFirst({
    where: { id, published: true, status: { not: "DRAFT" } },
    include: {
      authors: { where: { confirmation: { not: "PENDING" } }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      addressees: { orderBy: { order: "asc" } },
      letters: { where: { published: true, state: "FINAL" }, include: { attachments: { where: { isPublicVersion: true }, orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!c) return null;
  const letters = c.letters
    .sort((a, b) => (a.receivedAt ?? a.finalizedAt ?? a.createdAt).getTime() - (b.receivedAt ?? b.finalizedAt ?? b.createdAt).getTime())
    .map((l) => ({
      id: l.id, kind: l.kind, state: l.state, addresseeId: l.addresseeId,
      // Odniesienie tylko do pisma, które też jest publiczne.
      refLetterId: l.refLetterId && c.letters.some((x) => x.id === l.refLetterId) ? l.refLetterId : null,
      authorName: l.authorName, title: l.title, body: l.publicBody ?? "",
      letterDate: iso(l.letterDate), receivedAt: iso(l.receivedAt), finalizedAt: iso(l.finalizedAt),
      attachments: l.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
    }));
  return {
    id: c.id, kind: c.kind, status: c.status, number: c.number, title: c.publicTitle || c.title,
    submittedAt: iso(c.submittedAt), receivedAt: iso(c.receivedAt), registeredAt: iso(c.registeredAt), publishedAt: iso(c.publishedAt),
    closedAt: iso(c.closedAt), withdrawnAt: iso(c.withdrawnAt),
    authors: c.authors.map((a) => ({ name: a.name, confirmation: a.confirmation })),
    addressees: c.addressees.map((a) => ({ id: a.id, name: a.name, institution: a.institution, forwardedAt: iso(a.forwardedAt) })),
    letters,
  } satisfies PdfCase & Record<string, unknown>;
}

export async function listPublicCases() {
  if (!(await publicArchiveEnabled())) return null;
  const rows = await prisma.inquiryCase.findMany({
    where: { published: true, status: { not: "DRAFT" } },
    orderBy: [{ registeredAt: "desc" }, { createdAt: "desc" }],
    include: {
      authors: { where: { confirmation: { not: "PENDING" } }, select: { name: true } },
      addressees: { select: { name: true, institution: true } },
      letters: { where: { published: true, state: "FINAL" }, select: { kind: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id, kind: c.kind, status: c.status, number: c.number, title: c.publicTitle || c.title,
    receivedAt: iso(c.receivedAt ?? c.submittedAt), publishedAt: iso(c.publishedAt),
    authors: c.authors.map((a) => a.name), addressees: c.addressees.map((a) => [a.name, a.institution].filter(Boolean).join(", ")),
    answers: c.letters.filter((l) => l.kind === "ANSWER").length,
  }));
}
