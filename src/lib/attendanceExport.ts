import { AlignmentType, Document, Footer, Packer, PageNumber, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle } from "docx";
import type { AttendanceSummary, MeetingAttendance, PersonResult } from "@/lib/attendanceReport";
import { SOURCE_LABEL } from "@/lib/attendanceReport";
import { renderPdf } from "@/lib/serverPdf";
import { buildXlsx, type Cell } from "@/lib/xlsx";

/** Eksport raportów obecności - PDF, DOCX i XLSX z tych samych danych co widok (lib/attendanceReport). */

const TZ = "Europe/Warsaw";
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "");
const date = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
const stamp = () => new Date().toLocaleString("pl-PL", { timeZone: TZ });

export const STATUS_LABEL: Record<string, string> = { PRESENT: "obecny", ABSENT: "nieobecny", NO_DATA: "brak danych" };
const QUALITY_LABEL: Record<string, string> = { FULL: "", PARTIAL: "dane częściowe", NONE: "brak danych" };

function statusText(p: PersonResult): string {
  return [STATUS_LABEL[p.status], p.status === "PRESENT" && p.partial ? "przez część posiedzenia" : "", QUALITY_LABEL[p.quality]].filter(Boolean).join(", ");
}
function intervalsText(p: PersonResult): string {
  if (p.quality !== "FULL") return p.quality === "PARTIAL" ? "godziny nieznane" : "";
  return p.intervals.map((i) => `${time(i.from)}-${i.to ? time(i.to) : "…"}`).join(", ");
}
const yesNo = (v: boolean | null, min: number | null) => (v === null ? "nie ustalono" : v ? `tak (${min} min)` : "nie");
const pct = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(1).replace(".", ",")}%`);

export const LEGEND = [
  "Status formalny wynika z zapisanych czynności: potwierdzenia przez radnego, decyzji operatora, sprawdzenia obecności, głosowania kworum lub udokumentowanej korekty. Rozłączenie lub wylogowanie nie jest nieobecnością.",
  "Spóźnienie i wcześniejsze wyjście liczone są względem faktycznego otwarcia i zamknięcia posiedzenia z tolerancją; są niezależne od statusu obecności (osoba może być obecna, spóźnić się i wyjść wcześniej).",
  "„Brak danych” i „dane częściowe” nie są nieobecnością. Frekwencja = obecności / (obecności + stwierdzone nieobecności); gdy mianownik wynosi 0 - „-”.",
  "Goście są wykazani osobno i nie wliczają się do uprawnionych ani frekwencji.",
];

function meetingRows(r: MeetingAttendance, withNotes: boolean): Cell[][] {
  const head = ["Lp.", "Nazwisko i imię", "Klub / koło", "Rola", "Status formalny", "Obecność (godziny)", "Spóźnienie", "Wcześniejsze wyjście", "Źródło danych", ...(withNotes ? ["Usprawiedliwienie", "Uwagi"] : [])];
  const rows: Cell[][] = [head];
  r.people.forEach((p, i) => rows.push([
    i + 1, `${p.lastName} ${p.firstName}`, p.club ?? "", p.kind === "VOTING" ? "z prawem głosu" : "bez prawa głosu",
    statusText(p), intervalsText(p), p.status === "PRESENT" ? yesNo(p.late, p.lateMinutes) : "-", p.status === "PRESENT" ? yesNo(p.earlyLeave, p.earlyMinutes) : "-",
    p.sources.map((s) => SOURCE_LABEL[s] ?? s).join(", "),
    ...(withNotes ? [p.excused ? "tak" : "", p.note ?? ""] : []),
  ]));
  return rows;
}

function meetingHeader(r: MeetingAttendance, org: string): string[] {
  return [
    org,
    `Lista obecności - posiedzenie nr ${r.meeting.number}`,
    `${r.meeting.name}, ${date(r.meeting.scheduledAt)}`,
    `Otwarcie: ${r.meeting.openedAt ? `${date(r.meeting.openedAt)} ${time(r.meeting.openedAt)}` : "brak danych"}; zamknięcie: ${r.meeting.closedAt ? `${date(r.meeting.closedAt)} ${time(r.meeting.closedAt)}` : r.meeting.provisional ? "posiedzenie trwa (wynik roboczy)" : "brak danych"}`,
    `Tolerancja: spóźnienie ${r.toleranceLate} min, wcześniejsze wyjście ${r.toleranceEarly} min. Wygenerowano: ${stamp()} (czas polski).`,
    `Uprawnieni: ${r.counts.eligible}; obecni: ${r.counts.present}; nieobecni: ${r.counts.absent}; brak danych: ${r.counts.noData}; spóźnienia: ${r.counts.late}; wcześniejsze wyjścia: ${r.counts.early}.`,
  ];
}

// ─── Posiedzenie ───────────────────────────────────────────────────────────

export async function meetingAttendancePdf(r: MeetingAttendance, org: string, withNotes: boolean): Promise<Buffer> {
  const rows = meetingRows(r, withNotes);
  const guestRows = r.guests.map((g, i) => [String(i + 1), `${g.lastName} ${g.firstName}`, statusText(g), intervalsText(g)]);
  const h = meetingHeader(r, org);
  return renderPdf({
    pageOrientation: "landscape",
    pageMargins: [30, 40, 30, 40],
    footer: (cp: number, pc: number) => ({ text: `Strona ${cp} z ${pc}`, alignment: "right", fontSize: 8, margin: [30, 10] }),
    content: [
      { text: h[0], fontSize: 10, bold: true },
      { text: h[1], fontSize: 14, bold: true, margin: [0, 4, 0, 2] },
      { text: h[2], fontSize: 10 },
      { text: h[3], fontSize: 9, margin: [0, 4, 0, 0] },
      { text: h[4], fontSize: 8, color: "#000000" },
      { text: h[5], fontSize: 9, bold: true, margin: [0, 6, 0, 6] },
      ...r.basisNotes.map((n) => ({ text: n, fontSize: 8, italics: true })),
      { table: { headerRows: 1, widths: rows[0].map((_, i) => (i === 1 ? "*" : "auto")), body: rows.map((row, ri) => row.map((c) => ({ text: String(c ?? ""), fontSize: 8, bold: ri === 0 }))) }, layout: "lightHorizontalLines", margin: [0, 6, 0, 8] },
      ...(guestRows.length ? [
        { text: "Goście (bez prawa głosu, poza kworum i frekwencją)", fontSize: 10, bold: true, margin: [0, 6, 0, 4] },
        { table: { headerRows: 1, widths: ["auto", "*", "auto", "auto"], body: [["Lp.", "Nazwisko i imię", "Status", "Godziny"].map((t) => ({ text: t, bold: true, fontSize: 8 })), ...guestRows.map((g) => g.map((c) => ({ text: c, fontSize: 8 })))] }, layout: "lightHorizontalLines" },
      ] : []),
      { text: "Legenda", fontSize: 9, bold: true, margin: [0, 10, 0, 2] },
      ...LEGEND.map((l) => ({ text: l, fontSize: 8, margin: [0, 0, 0, 2] })),
    ],
  });
}

function docxTable(rows: Cell[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      children: r.map((c) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(c ?? ""), bold: ri === 0, size: 16, font: "Arial" })] })],
        borders: { top: { style: BorderStyle.SINGLE, size: 2, color: "000000" }, bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
      })),
    })),
  });
}

const para = (text: string, o: { bold?: boolean; size?: number; italics?: boolean } = {}) =>
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, bold: o.bold, italics: o.italics, size: o.size ?? 20, font: "Arial" })] });

function docxDocument(children: (Paragraph | Table)[]): Document {
  return new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Strona ", PageNumber.CURRENT, " z ", PageNumber.TOTAL_PAGES], size: 16, font: "Arial" })] })] }) },
      children,
    }],
  });
}

export async function meetingAttendanceDocx(r: MeetingAttendance, org: string, withNotes: boolean): Promise<Buffer> {
  const h = meetingHeader(r, org);
  const children: (Paragraph | Table)[] = [
    para(h[0], { bold: true }), para(h[1], { bold: true, size: 28 }), para(h[2]), para(h[3], { size: 18 }), para(h[4], { size: 16 }), para(h[5], { bold: true, size: 18 }),
    ...r.basisNotes.map((n) => para(n, { italics: true, size: 16 })),
    docxTable(meetingRows(r, withNotes)),
  ];
  if (r.guests.length) {
    children.push(para("Goście (bez prawa głosu, poza kworum i frekwencją)", { bold: true }));
    children.push(docxTable([["Lp.", "Nazwisko i imię", "Status", "Godziny"], ...r.guests.map((g, i) => [i + 1, `${g.lastName} ${g.firstName}`, statusText(g), intervalsText(g)])]));
  }
  children.push(para("Legenda", { bold: true }), ...LEGEND.map((l) => para(l, { size: 16 })));
  return Buffer.from(await Packer.toBuffer(docxDocument(children)));
}

export async function meetingAttendanceXlsx(r: MeetingAttendance, org: string, withNotes: boolean): Promise<Buffer> {
  const info = meetingHeader(r, org).map((t) => [t]);
  const history: Cell[][] = [["Nazwisko i imię", "Czas", "Zdarzenie", "Źródło", "Wprowadził", "Uzasadnienie", "Zastąpione korektą"]];
  for (const p of [...r.people, ...r.guests]) for (const e of p.history) history.push([`${p.lastName} ${p.firstName}`, `${date(e.at)} ${time(e.at)}`, e.present ? "obecny" : "nieobecny", SOURCE_LABEL[e.source] ?? e.source, e.by ?? "", e.reason ?? "", e.superseded ? "tak" : ""]);
  return buildXlsx([
    { name: "Lista obecności", rows: [...info, [], ...meetingRows(r, withNotes)], headerRows: [info.length + 1], colWidths: [5, 30, 12, 16, 26, 22, 16, 18, 30, 14, 30] },
    { name: "Goście", rows: [["Lp.", "Nazwisko i imię", "Status", "Godziny"], ...r.guests.map((g, i) => [i + 1, `${g.lastName} ${g.firstName}`, statusText(g), intervalsText(g)])], colWidths: [5, 30, 26, 22] },
    { name: "Historia zdarzeń", rows: history, colWidths: [30, 18, 12, 26, 24, 40, 16] },
    { name: "Legenda", rows: LEGEND.map((l) => [l]), headerRows: [], colWidths: [140] },
  ]);
}

// ─── Raport zbiorczy ───────────────────────────────────────────────────────

function summaryRows(s: AttendanceSummary): Cell[][] {
  const rows: Cell[][] = [["Lp.", "Nazwisko i imię", "Klub / koło", "Posiedzenia objęte", "Obecności", "w tym przez część posiedzenia", "Stwierdzone nieobecności", "w tym usprawiedliwione", "Brak danych", "Spóźnienia", "Wcześniejsze wyjścia", "Frekwencja", "Pokrycie danych"]];
  s.rows.forEach((r, i) => rows.push([i + 1, `${r.lastName} ${r.firstName}`, r.club ?? "", r.meetings, r.present, r.partial, r.absent, r.excused, r.noData, r.late, r.early, pct(r.rate), pct(r.coverage)]));
  return rows;
}
function summaryHeader(s: AttendanceSummary, org: string): string[] {
  return [org, "Raport zbiorczy obecności", ...s.filterLabels, `Posiedzeń w raporcie: ${s.meetings.length}. Wygenerowano: ${stamp()} (czas polski).`];
}
function detailRows(s: AttendanceSummary): Cell[][] {
  const rows: Cell[][] = [["Nazwisko i imię", "Data", "Posiedzenie", "Status", "Spóźnienie", "Wcześniejsze wyjście", "Przez część", "Usprawiedliwienie"]];
  for (const r of s.rows) for (const d of r.details) rows.push([`${r.lastName} ${r.firstName}`, date(d.date), `nr ${d.number} - ${d.name}`, [STATUS_LABEL[d.status], QUALITY_LABEL[d.quality]].filter(Boolean).join(", "), d.late === null ? "nie ustalono" : d.late ? "tak" : "nie", d.early === null ? "nie ustalono" : d.early ? "tak" : "nie", d.partial ? "tak" : "", d.excused ? "tak" : ""]);
  return rows;
}

export async function summaryPdf(s: AttendanceSummary, org: string): Promise<Buffer> {
  const rows = summaryRows(s);
  const h = summaryHeader(s, org);
  return renderPdf({
    pageOrientation: "landscape", pageMargins: [30, 40, 30, 40],
    footer: (cp: number, pc: number) => ({ text: `Strona ${cp} z ${pc}`, alignment: "right", fontSize: 8, margin: [30, 10] }),
    content: [
      { text: h[0], fontSize: 10, bold: true },
      { text: h[1], fontSize: 14, bold: true, margin: [0, 4, 0, 4] },
      ...h.slice(2).map((t) => ({ text: t, fontSize: 9 })),
      { table: { headerRows: 1, widths: rows[0].map((_, i) => (i === 1 ? "*" : "auto")), body: rows.map((row, ri) => row.map((c) => ({ text: String(c ?? ""), fontSize: 8, bold: ri === 0 }))) }, layout: "lightHorizontalLines", margin: [0, 8, 0, 8] },
      { text: "Legenda", fontSize: 9, bold: true, margin: [0, 6, 0, 2] },
      ...LEGEND.map((l) => ({ text: l, fontSize: 8, margin: [0, 0, 0, 2] })),
      { text: "Szczegóły - posiedzenia osób", fontSize: 10, bold: true, pageBreak: "before", margin: [0, 0, 0, 4] },
      { table: { headerRows: 1, widths: ["auto", "auto", "*", "auto", "auto", "auto", "auto", "auto"], body: detailRows(s).map((row, ri) => row.map((c) => ({ text: String(c ?? ""), fontSize: 7, bold: ri === 0 }))) }, layout: "lightHorizontalLines" },
    ],
  });
}

export async function summaryDocx(s: AttendanceSummary, org: string): Promise<Buffer> {
  const h = summaryHeader(s, org);
  return Buffer.from(await Packer.toBuffer(docxDocument([
    para(h[0], { bold: true }), para(h[1], { bold: true, size: 28 }), ...h.slice(2).map((t) => para(t, { size: 18 })),
    docxTable(summaryRows(s)),
    para("Legenda", { bold: true }), ...LEGEND.map((l) => para(l, { size: 16 })),
    para("Szczegóły - posiedzenia osób", { bold: true }),
    docxTable(detailRows(s)),
  ])));
}

export async function summaryXlsx(s: AttendanceSummary, org: string): Promise<Buffer> {
  const info = summaryHeader(s, org).map((t) => [t]);
  return buildXlsx([
    { name: "Zestawienie", rows: [...info, [], ...summaryRows(s)], headerRows: [info.length + 1], colWidths: [5, 30, 12, 12, 11, 14, 14, 14, 11, 11, 13, 11, 12] },
    { name: "Szczegóły", rows: detailRows(s), colWidths: [30, 12, 50, 22, 12, 14, 11, 16] },
    { name: "Posiedzenia", rows: [["Data", "Numer", "Nazwa", "Grupy"], ...s.meetings.map((m) => [date(m.date), m.number, m.name, m.units.join(", ")])], colWidths: [12, 14, 60, 40] },
    { name: "Legenda", rows: LEGEND.map((l) => [l]), headerRows: [], colWidths: [140] },
  ]);
}
