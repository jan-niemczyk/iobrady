import { withDateText } from "@/lib/meetingName";

interface SpeechRow {
  name: string; type: string;
  start: string | null; end: string | null;
  durationSec: number | null; limitSec: number | null;
}
interface SpeechPoint { number: string; title: string; rows: SpeechRow[] }
type Block = { kind: "point"; point: SpeechPoint } | { kind: "out"; rows: SpeechRow[] };
export interface SpeechesReportData {
  organization: string; meetingName: string; meetingNumber: string; dateText: string;
  blocks: Block[];
}

async function loadPdfMake() {
  const mod = await import("pdfmake/build/pdfmake");
  const pdfMake = mod.default;
  pdfMake.fonts = {
    Lato: {
      normal: `${location.origin}/fonts/Lato-Regular.ttf`,
      bold: `${location.origin}/fonts/Lato-Bold.ttf`,
      italics: `${location.origin}/fonts/Lato-Italic.ttf`,
      bolditalics: `${location.origin}/fonts/Lato-BoldItalic.ttf`,
    },
  };
  return pdfMake;
}

const FS = 10;

function fmtDuration(sec: number | null): string {
  if (sec == null) return "-";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const COLS = ["Lp.", "Nazwisko i imię", "Typ", "Początek", "Koniec", "Czas", "Limit"];

function pdfTable(rows: SpeechRow[]): Record<string, unknown> {
  const body = [
    COLS.map((t) => ({ text: t, bold: true, fontSize: FS - 1 })),
    ...rows.map((r, i) => [
      { text: String(i + 1), fontSize: FS - 1, alignment: "center" },
      { text: r.name, fontSize: FS - 1 },
      { text: r.type, fontSize: FS - 1 },
      { text: r.start ?? "-", fontSize: FS - 1, alignment: "center" },
      { text: r.end ?? "-", fontSize: FS - 1, alignment: "center" },
      { text: fmtDuration(r.durationSec), fontSize: FS - 1, alignment: "center" },
      { text: r.limitSec != null ? fmtDuration(r.limitSec) : "-", fontSize: FS - 1, alignment: "center" },
    ]),
  ];
  return {
    table: { headerRows: 1, widths: ["auto", "*", "auto", "auto", "auto", "auto", "auto"], body },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i === 1 ? 1 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => "#000000",
      paddingTop: () => 3, paddingBottom: () => 3,
    },
    margin: [0, 4, 0, 10],
  };
}

function pdfContent(data: SpeechesReportData): Record<string, unknown>[] {
  const c: Record<string, unknown>[] = [
    { text: data.organization, fontSize: FS + 1, bold: true, alignment: "center" },
    { text: "Raport wystąpień", fontSize: FS + 5, bold: true, alignment: "center", margin: [0, 2, 0, 2] },
    { text: withDateText(`Posiedzenie nr ${data.meetingNumber} - ${data.meetingName}`, data.dateText), fontSize: FS, alignment: "center", margin: [0, 0, 0, 4] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: "#000000" }], margin: [0, 0, 0, 14] },
  ];
  for (const block of data.blocks) {
    if (block.kind === "point") {
      if (block.point.rows.length === 0) continue;
      c.push({ text: `${block.point.number}. ${block.point.title}`, bold: true, fontSize: FS + 1, margin: [0, 8, 0, 0] });
      c.push(pdfTable(block.point.rows));
    } else {
      c.push({ text: "Poza porządkiem obrad", bold: true, fontSize: FS + 1, margin: [0, 8, 0, 0] });
      c.push(pdfTable(block.rows));
    }
  }
  return c;
}

export async function downloadSpeechesReportPdf(data: SpeechesReportData, fileName: string) {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf({
    content: pdfContent(data),
    defaultStyle: { font: "Lato", fontSize: FS },
    pageMargins: [40, 48, 40, 40] as [number, number, number, number],
    pageOrientation: "landscape" as const,
    header: (cp: number, pc: number) => ({
      margin: [40, 20, 40, 0],
      columns: [
        { text: `Posiedzenie nr ${data.meetingNumber} - raport wystąpień`, fontSize: 8 },
        { text: `Strona ${cp} z ${pc}`, fontSize: 8, alignment: "right" },
      ],
    }),
    info: { title: fileName },
  }).download(`${fileName}.pdf`);
}

const DOCX_FONT = "Arial";

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadSpeechesReportDocx(data: SpeechesReportData, fileName: string) {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle } = docx;
  const run = (text: string, opts: Record<string, unknown> = {}) => new TextRun({ text, font: DOCX_FONT, ...opts });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(data.organization, { bold: true })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 20 }, children: [run("Raport wystąpień", { bold: true, size: 30 })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(withDateText(`Posiedzenie nr ${data.meetingNumber} - ${data.meetingName}`, data.dateText))] }));

  const cell = (text: string, bold = false) => new TableCell({
    children: [new Paragraph({ children: [run(text, { bold, size: 16 })] })],
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
  });
  const table = (rows: SpeechRow[]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
    },
    rows: [
      new TableRow({ children: COLS.map((t) => cell(t, true)) }),
      ...rows.map((r, i) => new TableRow({ children: [
        cell(String(i + 1)), cell(r.name), cell(r.type), cell(r.start ?? "-"), cell(r.end ?? "-"),
        cell(fmtDuration(r.durationSec)), cell(r.limitSec != null ? fmtDuration(r.limitSec) : "-"),
      ] })),
    ],
  });

  for (const block of data.blocks) {
    if (block.kind === "point") {
      if (block.point.rows.length === 0) continue;
      children.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [run(`${block.point.number}. ${block.point.title}`, { bold: true, size: 22 })] }));
    } else {
      children.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [run("Poza porządkiem obrad", { bold: true, size: 22 })] }));
    }
    children.push(table(block.kind === "point" ? block.point.rows : block.rows));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: DOCX_FONT, size: 18 } } } },
    sections: [{ children }],
  });
  saveBlob(await Packer.toBlob(doc), `${fileName}.docx`);
}
