import { renderPdf } from "@/lib/serverPdf";
import { parseBlocks, type Block, type Run } from "@/lib/noticeText";
import { INQUIRY_KIND_GEN, INQUIRY_KIND_LABEL, LETTER_KIND_LABEL } from "@/lib/inquiryLabels";

/**
 * PDF interpelacji, zapytań i pism powiązanych - z treści zapisanej w aplikacji (bez wgrywania pliku).
 * Układ pisma urzędowego: nazwa jednostki, znak (numer sprawy) i data, adresat po prawej, tytuł,
 * treść z zachowanymi akapitami i numerowanymi pytaniami, autorzy pod treścią, wykaz załączników.
 * Pokazuje wyłącznie dane zapisane w sprawie - bez daty wysłania, podpisu ani potwierdzenia doręczenia.
 * Szkic: oznaczenie „PROJEKT” w nagłówku każdej strony pisma, a w zbiorczym PDF nad samym pismem (czarny tekst).
 * Wersja publiczna bierze wyłącznie treść przygotowaną do publikacji. Wyłącznie czerń.
 */

export type PdfLetter = {
  id: string; seq?: number | null; kind: string; state: string; addresseeId: string | null; refLetterId: string | null; authorName: string | null;
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
const d = (iso: string | null) => (iso ? `${new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ })} r.` : null);
const runs = (rs: Run[]) => rs.map((r) => ({ text: r.text, bold: r.bold || undefined, italics: r.italic || undefined }));
const M = { l: 70, r: 60, t: 64, b: 64 }; // ok. 25/21/22,5 mm
const WIDTH = 595.28 - M.l - M.r;

/** Treść w ograniczonym zapisie -> akapity i listy (numeracja pytań zachowana). */
function bodyContent(src: string): unknown[] {
  const blocks = parseBlocks(src);
  const out: unknown[] = [];
  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i];
    if (b.type === "p") {
      if (b.runs.some((r) => r.text.trim())) out.push({ text: runs(b.runs), alignment: b.align === "left" ? "justify" : b.align, margin: [0, 0, 0, 7] });
      i++;
      continue;
    }
    const group: Block[] = [];
    let j = i;
    while (j < blocks.length && blocks[j].type === b.type) group.push(blocks[j++]);
    const items = group.map((g) => ({ text: runs(g.runs), margin: [0, 0, 0, 4], alignment: "justify" }));
    out.push(b.type === "ol" ? { ol: items, start: group[0].number ?? 1, margin: [8, 0, 0, 7] } : { ul: items, margin: [8, 0, 0, 7] });
    i = j;
  }
  return out;
}

const caseRef = (c: PdfCase) => `${INQUIRY_KIND_LABEL[c.kind]}${c.number ? ` nr ${c.number}` : " (przed rejestracją)"}`;
const confirmed = (c: PdfCase) => c.authors.filter((a) => a.confirmation !== "PENDING").map((a) => a.name);
const addrText = (a: { name: string; institution: string | null }) => [a.name, a.institution].filter(Boolean).join("\n");

/** Jedno pismo w układzie urzędowym. */
function letterBlock(c: PdfCase, l: PdfLetter, org: string, inlineDraftMark = false): unknown[] {
  const ad = c.addressees.find((a) => a.id === l.addresseeId);
  const ref = l.refLetterId ? c.letters.find((x) => x.id === l.refLetterId) : null;
  const isSub = l.kind === "SUBMISSION";
  const isAnswer = l.kind === "ANSWER";
  const date = d(l.letterDate) ?? d(l.receivedAt ?? l.finalizedAt);
  // Nadawca: odpowiedź - adresat sprawy; pozostałe - autorzy (radni) albo podmiot wpisany przy piśmie.
  const sender = isAnswer ? (l.authorName ?? (ad ? addrText(ad) : "")) : isSub ? confirmed(c).join("\n") : (l.authorName ?? confirmed(c).join("\n"));
  // Odbiorca: pismo radnych - adresat(ci); odpowiedź - autorzy sprawy.
  const to = isAnswer ? confirmed(c).join("\n") : ad ? addrText(ad) : c.addressees.map(addrText).join("\n\n");
  const kindLine = `${isSub ? INQUIRY_KIND_LABEL[c.kind] : LETTER_KIND_LABEL[l.kind]}${l.seq ? ` (pismo ${l.seq} w sprawie)` : ""}`;

  return [
    inlineDraftMark && l.state === "DRAFT" ? { text: "PROJEKT - PISMO NIEZŁOŻONE", bold: true, alignment: "center", margin: [0, 0, 0, 12] } : null,
    { columns: [{ text: org, bold: true, width: "*" }, { text: date ?? "", alignment: "right", width: "auto" }], margin: [0, 0, 0, 14] },
    { text: [{ text: "Sprawa: ", bold: true }, `${caseRef(c)} - ${c.title}`], margin: [0, 0, 0, 2] },
    ref ? { text: [{ text: "Dotyczy pisma: ", bold: true }, `${ref.seq ?? "-"} (${LETTER_KIND_LABEL[ref.kind]}${ref.letterDate ? ` z ${d(ref.letterDate)}` : ""})`], margin: [0, 0, 0, 2] } : null,
    l.receivedAt && !isSub ? { text: [{ text: "Data wpływu: ", bold: true }, d(l.receivedAt) ?? ""], margin: [0, 0, 0, 2] } : null,
    isSub && (c.receivedAt ?? c.submittedAt) ? { text: [{ text: c.receivedAt ? "Data wpływu: " : "Data złożenia: ", bold: true }, d(c.receivedAt ?? c.submittedAt) ?? ""], margin: [0, 0, 0, 2] } : null,
    to ? { stack: [{ text: to, bold: true }], margin: [WIDTH * 0.5, 18, 0, 22] } : { text: "", margin: [0, 0, 0, 18] },
    { text: kindLine.toUpperCase(), bold: true, alignment: "center", fontSize: 12, margin: [0, 0, 0, 4] },
    { text: isSub ? c.title : (l.title ?? `w sprawie ${INQUIRY_KIND_GEN[c.kind]} ${c.number ? `nr ${c.number}` : ""}`.trim()), bold: true, alignment: "center", margin: [0, 0, 0, 16] },
    ...(l.body.trim() ? bodyContent(l.body) : [{ text: "Treść pisma znajduje się w załączonym pliku.", italics: true, margin: [0, 0, 0, 7] }]),
    sender ? { stack: [{ text: sender }], margin: [WIDTH * 0.5, 24, 0, 0], unbreakable: true } : null,
    l.attachments.length ? { text: "Załączniki:", bold: true, margin: [0, 22, 0, 3] } : null,
    l.attachments.length ? { ol: l.attachments.map((a) => a.fileName), margin: [8, 0, 0, 0] } : null,
  ].filter(Boolean);
}

function doc(content: unknown[], draft: boolean, title: string, footerRef: string) {
  return {
    info: { title },
    pageSize: "A4",
    pageMargins: [M.l, M.t, M.r, M.b],
    defaultStyle: { font: "Lato", fontSize: 11, lineHeight: 1.3, color: "#000000" },
    header: draft ? () => ({ text: "PROJEKT - PISMO NIEZŁOŻONE", bold: true, alignment: "center", fontSize: 10, margin: [M.l, 26, M.r, 0] }) : undefined,
    footer: (cp: number, pc: number) => ({
      columns: [{ text: footerRef, fontSize: 8 }, { text: `Strona ${cp} z ${pc}`, alignment: "right", fontSize: 8, width: "auto" }],
      margin: [M.l, 24, M.r, 0],
    }),
    content,
  };
}

/** PDF jednego pisma. */
export async function letterPdf(c: PdfCase, letterId: string, org: string): Promise<Buffer> {
  const l = c.letters.find((x) => x.id === letterId);
  if (!l) throw new Error("LETTER_NOT_IN_CASE");
  return renderPdf(doc(letterBlock(c, l, org), l.state === "DRAFT", `${caseRef(c)} - ${LETTER_KIND_LABEL[l.kind]}`, caseRef(c)));
}

/** Zbiorczy PDF sprawy: zestawienie (autorzy, adresaci, daty, wykaz pism), potem każde pismo od nowej strony. */
export async function casePdf(c: PdfCase, org: string): Promise<Buffer> {
  const facts: [string, string | null][] = [
    ["Rodzaj i numer", caseRef(c)],
    ["Autorzy", confirmed(c).join(", ")],
    ["Adresaci", c.addressees.map((a) => [a.name, a.institution].filter(Boolean).join(", ")).join("; ")],
    [c.receivedAt ? "Data wpływu" : "Data złożenia", d(c.receivedAt ?? c.submittedAt)],
    ["Rejestracja", d(c.registeredAt)],
    ["Posiedzenie", c.meeting ? `nr ${c.meeting.number} - ${c.meeting.name}` : null],
  ];
  const summary = [
    { text: org, bold: true, margin: [0, 0, 0, 14] },
    { text: caseRef(c).toUpperCase(), bold: true, alignment: "center", fontSize: 12 },
    { text: c.title, bold: true, alignment: "center", fontSize: 13, margin: [0, 4, 0, 16] },
    {
      table: { widths: [120, "*"], body: facts.filter(([, v]) => v).map(([k, v]) => [{ text: k, bold: true }, { text: v as string }]) },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#000000", vLineColor: () => "#000000", paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 6, paddingRight: () => 6 },
      margin: [0, 0, 0, 16],
    },
    { text: `Korespondencja (${c.letters.length})`, bold: true, margin: [0, 0, 0, 4] },
    {
      table: {
        headerRows: 1, widths: [30, "*", 130],
        body: [
          [{ text: "Nr", bold: true }, { text: "Pismo", bold: true }, { text: "Data", bold: true }],
          ...c.letters.map((l) => [
            { text: l.seq ? String(l.seq) : "-" },
            { text: `${LETTER_KIND_LABEL[l.kind]}${l.state === "DRAFT" ? " (projekt)" : ""}${l.authorName && l.kind !== "SUBMISSION" ? ` - ${l.authorName.split("\n")[0]}` : ""}` },
            { text: d(l.letterDate ?? l.receivedAt ?? l.finalizedAt) ?? "-" },
          ]),
        ],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#000000", vLineColor: () => "#000000", paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 6, paddingRight: () => 6 },
    },
  ];
  // Oznaczenie projektu tylko przy piśmie niezłożonym - nie w nagłówku wszystkich stron zestawienia.
  const letters = c.letters.flatMap((l) => [{ text: "", pageBreak: "before" }, ...letterBlock(c, l, org, true)]);
  return renderPdf(doc([...summary, ...letters], false, `${caseRef(c)} - korespondencja`, caseRef(c)));
}
