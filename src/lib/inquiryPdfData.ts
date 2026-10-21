import { prisma } from "@/lib/db";
import type { InquiryView } from "@/lib/inquiryDetail";
import type { PdfCase } from "@/lib/inquiryPdf";

/** Karta sprawy (wewnętrzna) -> dane PDF/DOCX: tylko pisma widoczne dla tej osoby. */
export function pdfCaseFromView(v: InquiryView): PdfCase {
  return {
    kind: v.kind, number: v.number, title: v.title, submittedAt: v.submittedAt, receivedAt: v.receivedAt, registeredAt: v.registeredAt,
    authors: v.authors, addressees: v.addressees, meeting: v.meeting ? { number: v.meeting.number, name: v.meeting.name } : null,
    letters: v.letters.map((l) => ({ ...l, attachments: l.attachments.filter((a) => !a.isPublicVersion) })),
  };
}

export async function orgName(): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { organizationName: true } });
  return s?.organizationName ?? "";
}

export const caseFileBase = (v: { kind: string; number: string | null }) =>
  `${v.kind === "INTERPELLATION" ? "interpelacja" : "zapytanie"}-${(v.number ?? "projekt").replace(/[^A-Za-z0-9]+/g, "-")}`;
