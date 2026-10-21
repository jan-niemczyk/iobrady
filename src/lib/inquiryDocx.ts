import { AlignmentType, Document, Footer, LevelFormat, Packer, PageNumber, Paragraph, TextRun } from "docx";
import { parseBlocks } from "@/lib/noticeText";
import { INQUIRY_KIND_LABEL, LETTER_KIND_LABEL } from "@/lib/inquiryLabels";
import type { PdfCase } from "@/lib/inquiryPdf";

const FONT = "Arial";
const SIZE = 22;
const TZ = "Europe/Warsaw";
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }) : null);
const p = (text: string, o: { bold?: boolean; size?: number; after?: number; color?: string; italics?: boolean } = {}) =>
  new Paragraph({ spacing: { after: o.after ?? 80 }, children: [new TextRun({ text, bold: o.bold, size: o.size ?? SIZE, font: FONT, color: o.color, italics: o.italics })] });

/** Edytowalny DOCX korespondencji sprawy (te same dane i kolejność co zbiorczy PDF). */
export async function caseDocx(c: PdfCase, org: string): Promise<Buffer> {
  const ref = `${INQUIRY_KIND_LABEL[c.kind]}${c.number ? ` nr ${c.number}` : " (bez numeru)"}`;
  const authors = c.authors.filter((a) => a.confirmation !== "PENDING").map((a) => a.name).join(", ");
  const body: Paragraph[] = [
    p(org, { size: 18, color: "555555" }),
    p(ref, { size: 20 }),
    p(c.title, { bold: true, size: 30, after: 160 }),
    p(`Autorzy: ${authors}`),
    p(`Adresaci: ${c.addressees.map((a) => [a.name, a.institution].filter(Boolean).join(", ")).join("; ")}`),
    ...(c.receivedAt ?? c.submittedAt ? [p(`Złożono / wpływ: ${d(c.receivedAt ?? c.submittedAt)}`)] : []),
    ...(c.registeredAt ? [p(`Rejestracja: ${d(c.registeredAt)}`, { after: 240 })] : []),
  ];
  c.letters.forEach((l, i) => {
    const addressee = c.addressees.find((a) => a.id === l.addresseeId);
    const refL = l.refLetterId ? c.letters.findIndex((x) => x.id === l.refLetterId) : -1;
    body.push(new Paragraph({ spacing: { before: 280, after: 120 }, keepNext: true, children: [new TextRun({ text: `Pismo ${i + 1} z ${c.letters.length} - ${LETTER_KIND_LABEL[l.kind]}${l.state === "DRAFT" ? " (PROJEKT - niezłożone)" : ""}`, bold: true, size: 26, font: FONT })] }));
    if (l.title && l.kind !== "SUBMISSION") body.push(p(l.title, { bold: true }));
    if (l.authorName) body.push(p(`${l.kind === "SUBMISSION" ? "Autorzy" : "Autor / podmiot"}: ${l.authorName}`));
    if (addressee) body.push(p(`${l.kind === "ANSWER" ? "Odpowiedź od" : "Adresat"}: ${[addressee.name, addressee.institution].filter(Boolean).join(", ")}`));
    if (refL >= 0) body.push(p(`W odniesieniu do: pismo ${refL + 1} (${LETTER_KIND_LABEL[c.letters[refL].kind]})`));
    if (l.letterDate) body.push(p(`Data pisma: ${d(l.letterDate)}`));
    if (l.receivedAt) body.push(p(`Data wpływu: ${d(l.receivedAt)}`, { after: 160 }));
    if (!l.body.trim()) body.push(p("Treść pisma wyłącznie w załączonym pliku.", { italics: true }));
    for (const b of parseBlocks(l.body)) {
      if (b.type === "p" && !b.runs.some((r) => r.text.trim())) continue;
      const align = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }[b.align];
      body.push(new Paragraph({
        alignment: align, spacing: { after: 100 },
        ...(b.type === "ol" ? { numbering: { reference: "q", level: 0, instance: i + 1 } } : b.type === "ul" ? { numbering: { reference: "b", level: 0 } } : {}),
        children: b.runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, font: FONT, size: SIZE })),
      }));
    }
    if (l.attachments.length) {
      body.push(p("Załączniki:", { bold: true }));
      l.attachments.forEach((a, k) => body.push(p(`${k + 1}. ${a.fileName}`)));
    }
  });
  const doc = new Document({
    creator: "iOBRADY", title: `${ref} - korespondencja`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    numbering: { config: [
      { reference: "q", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 360 } } } }] },
      { reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "-", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] },
    ] },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1418, right: 1134, footer: 567 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${ref} - strona `, PageNumber.CURRENT, " z ", PageNumber.TOTAL_PAGES], font: FONT, size: 16 })] })] }) },
      children: body,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
