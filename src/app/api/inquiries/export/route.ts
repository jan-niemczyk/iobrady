import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { filtersFromParams, listInquiries, type InquiryFilters } from "@/lib/inquiryList";
import { buildXlsx } from "@/lib/xlsx";
import { fileResponse, MIME, renderPdf } from "@/lib/serverPdf";
import { INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL } from "@/lib/inquiryLabels";
import { serverError } from "@/lib/http";
import { BW_HORIZONTAL_LINES } from "@/lib/pdfLayouts";

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "");

function filterText(f: InquiryFilters): string {
  const parts = [
    f.kind ? `rodzaj: ${INQUIRY_KIND_LABEL[f.kind] ?? f.kind}` : "", f.status ? `status: ${INQUIRY_STATUS_LABEL[f.status] ?? f.status}` : "",
    f.number ? `numer: ${f.number}` : "", f.period ? `okres: ${f.period}` : "", f.author ? `autor: ${f.author}` : "", f.addressee ? `adresat: ${f.addressee}` : "",
    f.q ? `treść: ${f.q}` : "", f.from ? `od: ${f.from}` : "", f.to ? `do: ${f.to}` : "",
    f.pending ? "oczekujące" : "", f.overdue ? "po terminie" : "", f.newAnswers ? "nowe odpowiedzi" : "",
  ].filter(Boolean);
  return parts.length ? `Filtry: ${parts.join(", ")}` : "Bez filtrów";
}

/** GET ?format=xlsx|pdf + filtry rejestru - eksport rejestru spraw (operator). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const f = filtersFromParams(sp);
  const rows = await listInquiries(session.user, f);
  const head = ["Rodzaj", "Numer", "Tytuł", "Autorzy", "Adresaci", "Złożono / wpływ", "Rejestracja", "Status", "Odpowiedzi", "Najbliższy termin", "Po terminie", "Publikacja"];
  const data = rows.map((r) => [INQUIRY_KIND_LABEL[r.kind], r.number ?? "", r.title, r.authors.join(", "), r.addressees.join("; "), d(r.receivedAt ?? r.submittedAt), d(r.registeredAt), INQUIRY_STATUS_LABEL[r.status], r.answers, d(r.nearestDue), r.overdue ? "tak" : "", r.published ? "tak" : ""]);
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    if (sp.get("format") === "pdf") {
      const buf = await renderPdf({
        pageOrientation: "landscape", pageMargins: [30, 40, 30, 40],
        footer: (cp: number, pc: number) => ({ text: `Strona ${cp} z ${pc}`, alignment: "right", fontSize: 8, margin: [30, 10] }),
        content: [
          { text: "Rejestr interpelacji i zapytań", fontSize: 14, bold: true },
          { text: `${filterText(f)}. Liczba spraw: ${rows.length}. Stan na ${d(new Date().toISOString())}.`, fontSize: 9, margin: [0, 2, 0, 8] },
          { table: { headerRows: 1, widths: [50, 40, "*", 80, 90, 50, 50, 60, 35, 50, 30, 35], body: [head.map((h) => ({ text: h, bold: true })), ...data.map((r) => r.map((x) => String(x)))] }, fontSize: 7.5, layout: BW_HORIZONTAL_LINES },
        ],
      });
      return fileResponse(buf, `rejestr-interpelacji-${stamp}.pdf`, MIME.pdf);
    }
    const buf = await buildXlsx([{ name: "Rejestr", rows: [["Rejestr interpelacji i zapytań"], [filterText(f)], [], head, ...data], headerRows: [0, 3], colWidths: [14, 10, 50, 30, 40, 14, 14, 24, 10, 14, 10, 10] }]);
    return fileResponse(buf, `rejestr-interpelacji-${stamp}.xlsx`, MIME.xlsx);
  } catch (e) {
    return serverError("inquiries export", e);
  }
}
