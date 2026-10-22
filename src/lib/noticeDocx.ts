import {
  AlignmentType, BorderStyle, Document, Footer, Header, HorizontalPositionRelativeFrom, ImageRun, LevelFormat, Packer, PageNumber,
  Paragraph, Table, TableCell, TableRow, TabStopType, TextRun, TextWrappingType, VerticalAlignTable, VerticalPositionRelativeFrom, WidthType,
} from "docx";
import { fillPlaceholders, parseBlocks, type Align, type NoticeAgendaItem, type NoticeContent, type NoticeRecipient } from "@/lib/noticeText";
import { loadRaster, uploadedFilePath, type RasterImage } from "@/lib/rasterImage";

/**
 * Generator DOCX zawiadomienia (układ jak we wzorze jednostki):
 *  - nagłówek treści: logo/herb po lewej, obok nazwa organu (pogrubiona) i dane (np. nazwa posiedzenia, termin);
 *  - wiersz: znak sprawy po lewej, miejscowość i data po prawej;
 *  - adresat (tylko dokument imienny) w prawej części strony, z odstępem przed treścią;
 *  - tytuł, zwrot, wstęp z podstawą prawną (treść dokumentu), porządek obrad, treść po porządku;
 *  - podpis w treści, w prawej części strony; prawdziwa stopka z numeracją stron;
 *  - papier firmowy: obraz całej strony za tekstem na każdej stronie, treść w marginesach z ustawień.
 * Czcionka Arial, wyłącznie czerń.
 */

const FONT = "Arial";
const SIZE = 22; // 11 pt
const ALIGN: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED,
};
const A4_W = 11906, A4_H = 16838; // twipy
const MM = 56.7; // twipy na milimetr
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

export interface NoticeRenderInput {
  content: NoticeContent;
  agenda: NoticeAgendaItem[];
  /** Adresat dokumentu spersonalizowanego; null - dokument ogólny bez danych adresata. */
  recipient: NoticeRecipient | null;
  values: Record<string, string>;
  logoPath: string | null;
}

export function placeholderValues(base: Record<string, string>, r: NoticeRecipient | null): Record<string, string> {
  return {
    ...base,
    adresat: r ? [r.name, r.functionTitle].filter(Boolean).join(", ") : "",
    zwrot: r?.salutation ?? "",
  };
}

/** Wszystkie nierozwiązane znaczniki dokumentu (pokazywane przed eksportem). */
export function unresolvedIn(c: NoticeContent, agenda: NoticeAgendaItem[], values: Record<string, string>): string[] {
  const all = [c.title, c.intro, c.agendaLabel, c.outro, c.signature, c.footer, c.letterhead, c.unitName, c.unitDetails, c.place, c.caseRef, ...agenda.map((a) => a.title)];
  return [...new Set(all.flatMap((t) => fillPlaceholders(t, values).unresolved))];
}

const fill = (t: string, v: Record<string, string>) => fillPlaceholders(t, v).text;

function run(text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) {
  return new TextRun({ text, bold: o.bold, italics: o.italics, font: FONT, size: o.size ?? SIZE, color: "000000" });
}

function runsFor(text: string, values: Record<string, string>, base: { bold?: boolean; size?: number } = {}): TextRun[] {
  return parseBlocks(fill(text, values))[0]?.runs.map((r) => run(r.text, { bold: r.bold || base.bold, italics: r.italic, size: base.size })) ?? [];
}

function richParagraphs(text: string, values: Record<string, string>, ref: string): Paragraph[] {
  const filled = fill(text, values);
  if (!filled.trim()) return [];
  return parseBlocks(filled).map((b) => new Paragraph({
    alignment: ALIGN[b.align],
    spacing: { after: 100, line: 300 },
    ...(b.type === "ul" ? { numbering: { reference: "bullets", level: 0 } } : {}),
    ...(b.type === "ol" ? { numbering: { reference: ref, level: 0 } } : {}),
    children: b.runs.map((r) => run(r.text, { bold: r.bold, italics: r.italic })),
  }));
}

function lines(text: string, values: Record<string, string>, opts: { align?: Align; size?: number; bold?: boolean; firstBold?: boolean } = {}): Paragraph[] {
  return fill(text, values).split(/\r?\n/).filter((l) => l.trim()).map((l, i) => new Paragraph({
    alignment: ALIGN[opts.align ?? "left"],
    spacing: { after: 0 },
    children: [run(l, { size: opts.size, bold: opts.bold || (opts.firstBold && i === 0) })],
  }));
}

function cell(children: Paragraph[], width: number, valign: "top" | "center" = "top") {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders: NO_BORDERS,
    verticalAlign: valign === "center" ? VerticalAlignTable.CENTER : VerticalAlignTable.TOP,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: children.length ? children : [new Paragraph({ children: [] })],
  });
}

function twoCols(left: Paragraph[], right: Paragraph[], leftW: number, total: number, valign: "top" | "center" = "top") {
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: [leftW, total - leftW], borders: NO_BORDERS,
    rows: [new TableRow({ children: [cell(left, leftW, valign), cell(right, total - leftW, valign)] })],
  });
}

/** Logo w nagłówku treści: wysokość ok. 2 cm, szerokość wg proporcji (maks. 3,5 cm). */
function logoRun(img: RasterImage) {
  const h = 76, w = Math.max(20, Math.min(132, Math.round((img.width / img.height) * h)));
  return new ImageRun({ type: img.kind, data: img.data, transformation: { width: w, height: h } });
}

export async function buildNoticeDocx(input: NoticeRenderInput): Promise<Buffer> {
  const { content: c, agenda, recipient } = input;
  const values = placeholderValues(input.values, recipient);
  const left = Math.round(c.marginLeftMm * MM), right = Math.round(c.marginRightMm * MM);
  const top = Math.round(c.marginTopMm * MM), bottom = Math.round(c.marginBottomMm * MM);
  const W = A4_W - left - right; // szerokość treści
  const logo = c.useLogo ? await loadRaster(input.logoPath, 800) : null;
  const paper = c.letterheadImage ? await loadRaster(uploadedFilePath(c.letterheadImage), 2480) : null;
  const body: (Paragraph | Table)[] = [];

  // 1. Logo + nazwa organu i dane (np. nazwa posiedzenia, termin).
  const unit = [...lines(c.unitName, values, { bold: true }), ...lines(c.unitDetails, values)];
  if (logo || unit.length) {
    if (logo) {
      const logoW = 2400;
      body.push(twoCols([new Paragraph({ children: [logoRun(logo)] })], unit, logoW, W, "center"));
    } else body.push(...unit);
  }

  // 2. Znak sprawy (lewa) i miejscowość z datą (prawa) w jednym wierszu.
  const placeDate = [fill(c.place, values), c.letterDate ? values.data_pisma : ""].filter(Boolean).join(", ");
  const ref = fill(c.caseRef, values).trim();
  if (placeDate || ref) {
    body.push(new Paragraph({ spacing: { before: 240 }, children: [] }));
    body.push(twoCols(
      ref ? [new Paragraph({ children: [run(ref)] })] : [],
      placeDate ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(placeDate)] })] : [],
      Math.round(W / 2), W,
    ));
  }

  // 3. Adresat - wyłącznie w dokumencie spersonalizowanym, w prawej części strony.
  if (recipient) {
    const addr = [recipient.name, recipient.functionTitle, recipient.institution, ...recipient.address.split(/\r?\n/)].map((x) => x.trim()).filter(Boolean);
    const indent = Math.round(W * 0.55);
    body.push(new Paragraph({ spacing: { before: 240 }, children: [] }));
    for (const [i, l] of addr.entries()) body.push(new Paragraph({ indent: { left: indent }, spacing: { after: 0 }, children: [run(l, { bold: i === 0 })] }));
  }
  body.push(new Paragraph({ spacing: { after: 360 }, children: [] }));

  // 4. Treść.
  if (c.title.trim()) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: runsFor(c.title, values, { bold: true, size: 26 }) }));
  if (recipient?.salutation.trim()) body.push(new Paragraph({ spacing: { after: 120 }, children: [run(recipient.salutation.trim())] }));
  body.push(...richParagraphs(c.intro, values, "intro-ol"));

  if (c.agendaPosition !== "none" && agenda.length) {
    if (c.agendaLabel.trim()) body.push(new Paragraph({ spacing: { before: 200, after: 120 }, keepNext: true, children: runsFor(c.agendaLabel, values, { bold: true }) }));
    for (const a of agenda) {
      const indent = a.level === 1 ? { left: 1134, hanging: 567 } : { left: 567, hanging: 567 };
      const num = a.unnumbered || !a.number.trim() ? "" : `${a.number.replace(/\.$/, "")}.`;
      body.push(new Paragraph({
        indent: num ? indent : { left: indent.left },
        tabStops: [{ type: TabStopType.LEFT, position: indent.left }],
        spacing: { after: 80, line: 276 },
        children: [...(num ? [run(num), run("\t")] : []), ...runsFor(a.title, values)],
      }));
    }
  }
  body.push(...richParagraphs(c.outro, values, "outro-ol"));

  // 5. Podpis - w treści, w prawej części strony (wyśrodkowany w niej).
  if (c.signature.trim()) {
    body.push(new Paragraph({ spacing: { before: 480 }, keepNext: true, children: [] }));
    const sig = fill(c.signature, values).split(/\r?\n/);
    sig.forEach((l, i) => body.push(new Paragraph({
      indent: { left: Math.round(W / 2) }, alignment: AlignmentType.CENTER, keepNext: i < sig.length - 1,
      spacing: { after: i === 0 && sig.length > 1 ? 240 : 0 }, children: [run(l)],
    })));
  }

  const footerChildren: Paragraph[] = [
    ...lines(c.footer, values, { align: "center", size: 16 }),
    ...(c.footerPageNumbers ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Strona ", PageNumber.CURRENT, " z ", PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: "000000" })] })] : []),
  ];
  // Papier firmowy: obraz całej strony za tekstem (zakotwiczony w nagłówku - na każdej stronie).
  const headerChildren: Paragraph[] = [
    ...(paper ? [new Paragraph({ children: [new ImageRun({
      type: paper.kind, data: paper.data, transformation: { width: 794, height: 1123 },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE },
      },
    })] })] : []),
    ...lines(c.letterhead, values, { align: "center", size: 18 }),
  ];

  const doc = new Document({
    creator: "iOBRADY",
    title: fill(c.title, values) || "Zawiadomienie",
    styles: { default: { document: { run: { font: FONT, size: SIZE, color: "000000" } } } },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "-", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] },
        ...["intro-ol", "outro-ol"].map((reference) => ({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 360 } } } }] })),
      ],
    },
    sections: [{
      properties: { page: { size: { width: A4_W, height: A4_H }, margin: { top, bottom, left, right, header: Math.min(567, Math.round(top / 2)), footer: paper ? Math.max(200, bottom - 340 - footerChildren.length * 200) : Math.min(567, Math.round(bottom / 2)) } } },
      headers: headerChildren.length ? { default: new Header({ children: headerChildren }) } : undefined,
      footers: footerChildren.length ? { default: new Footer({ children: footerChildren }) } : undefined,
      children: body,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** Ścieżka pliku logo z ustawień (tylko wgrane pliki w public/uploads). */
export const logoFilePath = uploadedFilePath;
