import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { addresseeAnswered } from "@/lib/inquiries";

export type InquiryFilters = {
  kind?: string; status?: string; q?: string; number?: string; author?: string; addressee?: string;
  from?: string; to?: string; period?: string; pending?: boolean; overdue?: boolean; newAnswers?: boolean;
};

export function filtersFromParams(sp: URLSearchParams): InquiryFilters {
  const g = (k: string) => sp.get(k)?.trim() || undefined;
  return {
    kind: g("rodzaj"), status: g("status"), q: g("q"), number: g("numer"), author: g("autor"), addressee: g("adresat"),
    from: g("od"), to: g("do"), period: g("okres"), pending: sp.get("oczekujace") === "1", overdue: sp.get("po_terminie") === "1", newAnswers: sp.get("nowe_odpowiedzi") === "1",
  };
}

const NEW_ANSWER_DAYS = 14;

/**
 * Rejestr spraw (operator) albo sprawy autora (radny) z filtrami. Filtr treści przeszukuje tytuł
 * i treść pism; „po terminie” = przekazano, termin minął, brak odpowiedzi adresata.
 */
export async function listInquiries(viewer: { id: string; role: string }, f: InquiryFilters) {
  const and: Prisma.InquiryCaseWhereInput[] = [];
  if (viewer.role === "OPERATOR") and.push({ OR: [{ status: { not: "DRAFT" } }, { enteredById: { not: null } }] });
  else and.push({ authors: { some: { userId: viewer.id } } });
  if (f.kind === "INTERPELLATION" || f.kind === "QUESTION") and.push({ kind: f.kind });
  if (f.status) and.push({ status: f.status as never });
  if (f.number) and.push({ number: { contains: f.number, mode: "insensitive" } });
  if (f.period) and.push({ period: f.period });
  if (f.author) and.push({ authors: { some: { name: { contains: f.author, mode: "insensitive" }, confirmation: { not: "PENDING" } } } });
  if (f.addressee) and.push({ addressees: { some: { OR: [{ name: { contains: f.addressee, mode: "insensitive" } }, { institution: { contains: f.addressee, mode: "insensitive" } }] } } });
  if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { letters: { some: { state: "FINAL", body: { contains: f.q, mode: "insensitive" } } } }] });
  const dateField = { gte: f.from ? new Date(`${f.from}T00:00:00`) : undefined, lte: f.to ? new Date(`${f.to}T23:59:59`) : undefined };
  if (f.from || f.to) and.push({ OR: [{ receivedAt: dateField }, { receivedAt: null, submittedAt: dateField }] });
  if (f.pending) and.push({ status: { in: ["SUBMITTED", "REGISTERED", "FORWARDED", "AWAITING", "PARTIAL"] } });

  const rows = await prisma.inquiryCase.findMany({
    where: { AND: and },
    orderBy: [{ registeredAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 2000,
    include: {
      authors: { where: { confirmation: { not: "PENDING" } }, select: { name: true, isPrimary: true } },
      addressees: { select: { id: true, name: true, institution: true, forwardedAt: true, dueDate: true } },
      letters: { select: { kind: true, state: true, addresseeId: true, seq: true, receivedAt: true, createdAt: true } },
    },
  });
  const now = Date.now();
  const out = rows.map((c) => {
    const overdue = c.addressees.some((a) => a.forwardedAt && a.dueDate && a.dueDate.getTime() < now && !addresseeAnswered(c, a.id));
    const lastAnswer = Math.max(0, ...c.letters.filter((l) => l.kind === "ANSWER" && l.state === "FINAL").map((l) => (l.receivedAt ?? l.createdAt).getTime()));
    const nearestDue = c.addressees.filter((a) => a.forwardedAt && a.dueDate && !addresseeAnswered(c, a.id)).map((a) => a.dueDate!.getTime()).sort()[0];
    return {
      id: c.id, kind: c.kind, status: c.status, number: c.number, title: c.title, published: c.published,
      submittedAt: c.submittedAt?.toISOString() ?? null, receivedAt: c.receivedAt?.toISOString() ?? null, registeredAt: c.registeredAt?.toISOString() ?? null,
      authors: c.authors.map((a) => a.name), addressees: c.addressees.map((a) => [a.name, a.institution].filter(Boolean).join(", ")),
      overdue, newAnswer: lastAnswer > now - NEW_ANSWER_DAYS * 24 * 3600 * 1000,
      nearestDue: nearestDue ? new Date(nearestDue).toISOString() : null,
      answers: c.letters.filter((l) => l.kind === "ANSWER" && l.state === "FINAL").length,
    };
  });
  return out.filter((r) => (!f.overdue || r.overdue) && (!f.newAnswers || r.newAnswer));
}
