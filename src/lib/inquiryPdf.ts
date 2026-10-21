import { renderPdf } from "@/lib/serverPdf";
import { parseBlocks, type Block, type Run } from "@/lib/noticeText";
import { INQUIRY_KIND_LABEL, LETTER_KIND_LABEL } from "@/lib/inquiryLabels";

/**
 * PDF interpelacji, zapytań i pism powiązanych - generowany z treści zapisanej w aplikacji
 * (bez potrzeby wgrywania pliku). Pokazuje wyłącznie dane zapisane w sprawie: nie dodaje daty
 * wysłania, podpisu ani potwierdzenia doręczenia. Szkic ma znak wodny „PROJEKT” - jego
 * wygenerowanie niczego nie składa i nie nadaje numeru. Wersja publiczna bierze wyłącznie
 * treść przygotowaną do publikacji (anonimizowaną), nigdy wewnętrzny oryginał.
 */

export type PdfLetter = {
  id: string; kind: string; state: string; addresseeId: string | null; refLetterId: string | null; authorName: string | null;
  title: string | null; body: string; letterDate: string | null; receivedAt: string | null; finalizedAt: string | null;
  attachments: { fileName: string }[];
};
export type PdfCase = {
  kind: string; number: string | null; title: string; submittedAt: string | null; receivedAt: string | null; registeredAt: string | null;
  authors: { name: string; confirmation: string }[];
  addressees: { id: string; name: string; institution: string | null; forwardedAt: string | null }[];
  letters: PdfLetter[];
  meeting?: { number: string; name: string } | null;
};

const TZ = "Europe/Warsaw";
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }) : null);

const runs = (rs: Run[]) => rs.map((r) => ({ text: r.text, bold: r.bold || undefined, italics: r.italic || undefined }));

/** Treść w ograniczonym zapisie -> akapity i listy pdfmake (numeracja pytań zachowana). */
function bodyContent(src: string): unknown[] {
  const blocks = parseBlocks(src);
  const out: unknown[] = [];
  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i];
    if (b.type === "p") {
      if (b.runs.some((r) => r.text.trim())) out.push({ text: runs(b.runs), alignment: b.align, margin: [0, 0, 0, 6] });
      i++;
      continue;
    }
    const group: Block[] = [];
    let j = i;
    while (j < blocks.length && blocks[j].type === b.type) group.push(blocks[j++]);
    const items = group.map((g) => ({ text: runs(g.runs), margin: [0, 0, 0, 3] }));
    out.push(b.type === "ol" ? { ol: items, start: group[0].number ?? 1, margin: [0, 0, 0, 6] } : { ul: items, margin: [0, 0, 0, 6] });
    i = j;
  }
  return out;
}

function caseRef(c: PdfCase) {
  return `${INQUIRY_KIND_LABEL[c.kind]}${c.number ? ` nr ${c.number}` : " (bez numeru - przed rejestracją)"}`;
}

function facts(rows: [string, string | null | undefined][]) {
  const body = rows.filter(([, v]) => v).map(([k, v]) => [{ text: k, color: "#555555" }, { text: v as string }]);
  if (!body.length) return null;
  return { table: { widths: [130, "*"], body }, layout: "noBorders", margin: [0, 0, 0, 10], fontSize: 9.5 };
}

function letterSection(c: PdfCase, l: PdfLetter, idx: number | null, total: number | null): unknown[] {
  const addressee = c.addressees.find((a) => a.id === l.addresseeId);
  const ref = l.refLetterId ? c.letters.find((x) => x.id === l.refLetterId) : null;
  const refIdx = ref ? c.letters.indexOf(ref) + 1 : null;
  const authors = c.authors.filter((a) => a.confirmation !== "PENDING").map((a) => a.name).join(", ");
  const isSubmission = l.kind === "SUBMISSION";
  return [
    { text: `${idx ? `Pismo ${idx}${total ? ` z ${total}` : ""} - ` : ""}${LETTER_KIND_LABEL[l.kind]}${l.state === "DRAFT" ? " (PROJEKT - niezłożone)" : ""}`, style: "h2" },
    l.title && !isSubmission ? { text: l.title, bold: true, margin: [0, 0, 0, 6] } : null,
    facts([
      ["Dotyczy", `${caseRef(c)} - ${c.title}`],
      [isSubmission ? "Autorzy" : "Autor / podmiot", isSubmission ? authors : l.authorName],
      [l.kind === "ANSWER" ? "Odpowiedź od" : "Adresat", addressee ? [addressee.name, addressee.institution].filter(Boolean).join(", ") : isSubmission ? c.addressees.map((a) => [a.name, a.institution].filter(Boolean).join(", ")).join("; ") : null],
      ["W odniesieniu do", ref ? `pismo ${refIdx}: ${LETTER_KIND_LABEL[ref.kind]}${ref.letterDate ? ` z ${d(ref.letterDate)}` : ""}` : null],
      ["Data pisma", d(l.letterDate)],
      [isSubmission && !c.receivedAt ? "Data złożenia" : "Data wpływu", d(l.receivedAt ?? (isSubmission ? c.receivedAt ?? c.submittedAt : null))],
    ]),
    ...(l.body.trim() ? bodyContent(l.body) : [{ text: "Treść pisma wyłącznie w załączonym pliku.", italics: true, color: "#555555", margin: [0, 0, 0, 6] }]),
    l.attachments.length ? { text: "Załączniki:", bold: true, margin: [0, 6, 0, 2] } : null,
    l.attachments.length ? { ol: l.attachments.map((a) => a.fileName), margin: [0, 0, 0, 6] } : null,
  ].filter(Boolean);
}

function header(c: PdfCase, org: string) {
  return [
    { text: org, fontSize: 9, color: "#555555", margin: [0, 0, 0, 4] },
    { text: caseRef(c), style: "kicker" },
    { text: c.title, style: "h1" },
    facts([
      ["Autorzy", c.authors.filter((a) => a.confirmation !== "PENDING").map((a) => a.name).join(", ")],
      ["Adresaci", c.addressees.map((a) => [a.name, a.institution].filter(Boolean).join(", ")).join("; ")],
      ["Złożono / wpływ", d(c.receivedAt ?? c.submittedAt)],
      ["Rejestracja", d(c.registeredAt)],
      ["Posiedzenie", c.meeting ? `nr ${c.meeting.number} - ${c.meeting.name}` : null],
    ]),
  ];
}

const STYLES = {
  h1: { fontSize: 15, bold: true, margin: [0, 2, 0, 8] },
  h2: { fontSize: 12, bold: true, margin: [0, 10, 0, 6] },
  kicker: { fontSize: 10, color: "#333333" },
};

function doc(content: unknown[], draft: boolean, title: string) {
  return {
    info: { title },
    pageMargins: [56, 50, 56, 50],
    defaultStyle: { font: "Lato", fontSize: 10.5, lineHeight: 1.25 },
    styles: STYLES,
    ...(draft ? { watermark: { text: "PROJEKT", opacity: 0.12, bold: true, fontSize: 90 } } : {}),
    footer: (cp: number, pc: number) => ({ text: `${draft ? "PROJEKT - pismo niezłożone. " : ""}Strona ${cp} z ${pc}`, alignment: "right", fontSize: 8, margin: [56, 16] }),
    content,
  };
}

/** PDF jednego pisma (z odniesieniem do sprawy). */
export async function letterPdf(c: PdfCase, letterId: string, org: string): Promise<Buffer> {
  const l = c.letters.find((x) => x.id === letterId);
  if (!l) throw new Error("LETTER_NOT_IN_CASE");
  const idx = c.letters.indexOf(l) + 1;
  return renderPdf(doc([...header(c, org), ...letterSection(c, l, idx, c.letters.length)], l.state === "DRAFT", `${caseRef(c)} - ${LETTER_KIND_LABEL[l.kind]}`));
}

/** Zbiorczy PDF korespondencji sprawy w kolejności chronologicznej (numerowane pisma). */
export async function casePdf(c: PdfCase, org: string): Promise<Buffer> {
  const sections = c.letters.flatMap((l, i) => [
    i > 0 ? { canvas: [{ type: "line", x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.5, lineColor: "#999999" }], margin: [0, 8, 0, 0] } : null,
    ...letterSection(c, l, i + 1, c.letters.length),
  ].filter(Boolean));
  return renderPdf(doc([...header(c, org), { text: `Korespondencja (${c.letters.length})`, style: "h2" }, ...sections], c.letters.some((l) => l.state === "DRAFT"), `${caseRef(c)} - korespondencja`));
}
