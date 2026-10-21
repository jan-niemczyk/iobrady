import {
  AlignmentType, Document, Footer, Header, ImageRun, LevelFormat, Packer, PageNumber, Paragraph, TabStopType, TextRun,
} from "docx";
import { readFile } from "fs/promises";
import path from "path";
import { fillPlaceholders, parseBlocks, type Align, type NoticeAgendaItem, type NoticeContent, type NoticeRecipient } from "@/lib/noticeText";
import { sniffImage } from "@/lib/imageSniff";

/**
 * Generator DOCX zawiadomienia: edytowalny dokument Word ze stylami, prawdziwą stopką strony
 * (dane kontaktowe i numeracja stron na każdej stronie), opcjonalnym nagłówkiem papieru firmowego
 * (osobno od wstępu z podstawą prawną, który jest treścią dokumentu), porządkiem obrad
 * z numeracją i wcięciami podpunktów oraz blokiem podpisu w treści. Czcionka Arial.
 */

const FONT = "Arial";
const SIZE = 22; // 11 pt
const ALIGN: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED,
};

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

function runsFor(text: string, values: Record<string, string>, base: { bold?: boolean; size?: number } = {}): TextRun[] {
  const filled = fillPlaceholders(text, values).text;
  return parseBlocks(filled)[0]?.runs.map((r) => new TextRun({ text: r.text, bold: r.bold || base.bold, italics: r.italic, font: FONT, size: base.size ?? SIZE })) ?? [];
}

function richParagraphs(text: string, values: Record<string, string>, ref: string): Paragraph[] {
  const filled = fillPlaceholders(text, values).text;
  if (!filled.trim()) return [];
  return parseBlocks(filled).map((b) => new Paragraph({
    alignment: ALIGN[b.align],
    spacing: { after: 100, line: 300 },
    ...(b.type === "ul" ? { numbering: { reference: "bullets", level: 0 } } : {}),
    ...(b.type === "ol" ? { numbering: { reference: ref, level: 0 } } : {}),
    children: b.runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, font: FONT, size: SIZE })),
  }));
}

function lines(text: string, values: Record<string, string>, opts: { align?: Align; size?: number; bold?: boolean } = {}): Paragraph[] {
  const filled = fillPlaceholders(text, values).text;
  return filled.split(/\r?\n/).filter((l, i, arr) => l.trim() || (i > 0 && i < arr.length - 1)).map((l) => new Paragraph({
    alignment: ALIGN[opts.align ?? "left"],
    spacing: { after: 0 },
    children: [new TextRun({ text: l, font: FONT, size: opts.size ?? SIZE, bold: opts.bold })],
  }));
}

export async function buildNoticeDocx(input: NoticeRenderInput): Promise<Buffer> {
  const { content: c, agenda, recipient } = input;
  const values = placeholderValues(input.values, recipient);
  const body: Paragraph[] = [];

  // Nagłówek treści: logo/herb, dane jednostki (lewa), miejscowość i data (prawa).
  if (c.useLogo && input.logoPath) {
    try {
      const data = await readFile(input.logoPath);
      const kind = sniffImage(data, false);
      if (kind === "png" || kind === "jpg") {
        const dim = imageSize(data) ?? { w: 1, h: 1 };
        const h = 64, w = Math.max(16, Math.min(240, Math.round((dim.w / dim.h) * h)));
        body.push(new Paragraph({ spacing: { after: 120 }, children: [new ImageRun({ type: kind, data, transformation: { width: w, height: h } })] }));
      }
    } catch { /* brak pliku logo - dokument bez logo */ }
  }
  if (c.unitName.trim()) body.push(...lines(c.unitName, values, { bold: true }));
  if (c.unitDetails.trim()) body.push(...lines(c.unitDetails, values, { size: 20 }));
  const placeDate = [fillPlaceholders(c.place, values).text, c.letterDate ? values.data_pisma : ""].filter(Boolean).join(", ");
  if (placeDate) body.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 120, after: 120 }, children: [new TextRun({ text: placeDate, font: FONT, size: SIZE })] }));
  if (c.caseRef.trim()) body.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Znak sprawy: ${fillPlaceholders(c.caseRef, values).text}`, font: FONT, size: 20 })] }));

  // Adresat - wyłącznie w dokumencie spersonalizowanym (bez danych innych odbiorców).
  if (recipient) {
    const addr = [recipient.name, recipient.functionTitle, recipient.institution, ...recipient.address.split(/\r?\n/)].map((x) => x.trim()).filter(Boolean);
    body.push(new Paragraph({ spacing: { before: 240 }, children: [] }));
    for (const [i, l] of addr.entries()) body.push(new Paragraph({ indent: { left: 5103 }, spacing: { after: 0 }, children: [new TextRun({ text: l, font: FONT, size: SIZE, bold: i === 0 })] }));
  }

  if (c.title.trim()) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 360, after: 240 }, children: runsFor(c.title, values, { bold: true, size: 26 }) }));
  if (recipient?.salutation.trim()) body.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: recipient.salutation.trim(), font: FONT, size: SIZE })] }));

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
        children: [
          ...(num ? [new TextRun({ text: num, font: FONT, size: SIZE }), new TextRun({ text: "\t", font: FONT, size: SIZE })] : []),
          ...runsFor(a.title, values),
        ],
      }));
    }
  }

  body.push(...richParagraphs(c.outro, values, "outro-ol"));

  // Blok podpisu - w treści dokumentu (nie w stopce), wyrównany do prawej części strony.
  if (c.signature.trim()) {
    body.push(new Paragraph({ spacing: { before: 480 }, keepNext: true, children: [] }));
    for (const l of fillPlaceholders(c.signature, values).text.split(/\r?\n/)) {
      body.push(new Paragraph({ indent: { left: 5103 }, alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 0 }, children: [new TextRun({ text: l, font: FONT, size: SIZE })] }));
    }
  }

  const footerChildren: Paragraph[] = [
    ...lines(c.footer, values, { align: "center", size: 16 }),
    ...(c.footerPageNumbers ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Strona ", PageNumber.CURRENT, " z ", PageNumber.TOTAL_PAGES], font: FONT, size: 16 })] })] : []),
  ];

  const doc = new Document({
    creator: "iOBRADY",
    title: fillPlaceholders(c.title, values).text || "Zawiadomienie",
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "-", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] },
        ...["intro-ol", "outro-ol"].map((reference) => ({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 360 } } } }] })),
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1418, right: 1134, footer: 567, header: 567 } } },
      headers: c.letterhead.trim() ? { default: new Header({ children: lines(c.letterhead, values, { align: "center", size: 18 }) }) } : undefined,
      footers: footerChildren.length ? { default: new Footer({ children: footerChildren }) } : undefined,
      children: body,
    }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** Ścieżka pliku logo z ustawień (tylko wgrane pliki w public/uploads). */
export function logoFilePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^\/(?:api\/)?uploads\/([A-Za-z0-9._-]{1,200})$/.exec(url);
  return m ? path.join(process.cwd(), "public", "uploads", m[1]) : null;
}

/** Wymiary PNG/JPEG z nagłówka pliku (proporcje logo w dokumencie). */
function imageSize(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}
