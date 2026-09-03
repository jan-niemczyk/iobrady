import { withDateText } from "@/lib/meetingName";
interface VoteBlock {
  voteId: string; number: number | null; title: string; type: string; closeTime: string | null;
  za?: string[]; przeciw?: string[]; wstrzym?: string[]; brak?: string[]; nieob?: string[];
  list?: { label: string; yes: number }[];
  pkg?: { label: string; yes: number; no: number; abstain: number }[];
  quorum?: { present: string[]; absent: string[] };
}
interface Point {
  number: string; title: string; isSubItem: boolean;
  presenter: string | null; committee: string | null;
  discussion: string[]; votes: VoteBlock[];
}
export interface ProtocolData {
  organization: string; meetingName: string; meetingNumber: string; dateText: string;
  points: Point[]; adHoc: VoteBlock[];
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

function summaryLine(v: VoteBlock): string {
  return `Za ${v.za?.length ?? 0}, przeciw ${v.przeciw?.length ?? 0}, wstrzymało się ${v.wstrzym?.length ?? 0}, nie głosowało ${v.brak?.length ?? 0}, nieobecni ${v.nieob?.length ?? 0}`;
}

function pdfVoteBlock(v: VoteBlock): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [{ text: v.title, bold: true, fontSize: FS, margin: [0, 0, 0, 2] }];

  if (v.list) {
    parts.push({ text: "Głosowanie na liście - liczba głosów:", fontSize: FS - 1, margin: [0, 0, 0, 2] });
    parts.push({
      ul: v.list.map((o) => ({ text: `${o.label}: ${o.yes}`, fontSize: FS - 1 })),
      margin: [0, 0, 0, 2],
    });
  } else if (v.pkg) {
    parts.push({ text: "Głosowanie pakietowe - wyniki pozycji:", fontSize: FS - 1, margin: [0, 0, 0, 2] });
    parts.push({
      ul: v.pkg.map((o) => ({ text: `${o.label}: za ${o.yes}, przeciw ${o.no}, wstrzymało się ${o.abstain}`, fontSize: FS - 1 })),
      margin: [0, 0, 0, 2],
    });
  } else if (v.quorum) {
    parts.push({ text: `Sprawdzenie kworum - obecni ${v.quorum.present.length}, nieobecni ${v.quorum.absent.length}`, fontSize: FS - 1, margin: [0, 0, 0, 2] });
    if (v.quorum.present.length) parts.push({ text: [{ text: "Obecni: ", bold: true }, { text: v.quorum.present.join(", ") }], fontSize: FS - 1, margin: [0, 1, 0, 1] });
    if (v.quorum.absent.length) parts.push({ text: [{ text: "Nieobecni: ", bold: true }, { text: v.quorum.absent.join(", ") }], fontSize: FS - 1, margin: [0, 1, 0, 1] });
  } else {
    parts.push({ text: summaryLine(v), fontSize: FS - 1, margin: [0, 0, 0, 3] });
    parts.push({ text: "Lista imienna", italics: true, fontSize: FS - 1, margin: [0, 0, 0, 2] });
    const cat = (label: string, arr?: string[]) => {
      if (!arr || arr.length === 0) return;
      parts.push({ text: [{ text: `${label} (${arr.length}): `, bold: true }, { text: arr.join(", ") }], fontSize: FS - 1, margin: [0, 1, 0, 1] });
    };
    cat("Za", v.za); cat("Przeciw", v.przeciw); cat("Wstrzymało się", v.wstrzym); cat("Nie głosowało", v.brak); cat("Nieobecni", v.nieob);
  }

  const foot = `${v.number != null ? `głosowanie nr ${v.number}` : "głosowanie ad hoc"}${v.closeTime ? `, zakończono ${v.closeTime}` : ""}`;
  parts.push({ text: foot, fontSize: FS - 3, margin: [0, 3, 0, 0] });
  return { unbreakable: true, margin: [30, 6, 0, 8], stack: parts };
}

function pdfContent(data: ProtocolData, withVotes: boolean): Record<string, unknown>[] {
  const c: Record<string, unknown>[] = [
    { text: data.organization, fontSize: FS + 1, bold: true, alignment: "center" },
    { text: withVotes ? "Protokół z posiedzenia" : "Porządek obrad", fontSize: FS + 6, bold: true, alignment: "center", margin: [0, 2, 0, 2] },
    { text: `${withDateText(`Posiedzenie nr ${data.meetingNumber} - ${data.meetingName}`, data.dateText)}`, fontSize: FS, alignment: "center", margin: [0, 0, 0, 4] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: "#000000" }], margin: [0, 0, 0, 14] },
  ];

  for (const p of data.points) {
    const meta: string[] = [];
    if (p.presenter) meta.push(`referuje: ${p.presenter}`);
    if (p.committee) meta.push(`opinia: ${p.committee}`);
    const indent = p.isSubItem ? 28 : 0;
    c.push({
      columns: [
        { width: 30 + indent, text: `${p.number}.`, fontSize: FS + 1, margin: [indent, 0, 0, 0] },
        { width: "*", stack: [
          { text: p.title, fontSize: FS + 1 },
          ...(meta.length ? [{ text: meta.join(",   "), fontSize: FS - 1, margin: [0, 2, 0, 0] }] : []),
        ] },
      ],
      margin: [0, 8, 0, 2],
    });
    if (withVotes) {
      if (p.discussion.length > 0)
        c.push({ text: [{ text: "W dyskusji głos zabrali: ", bold: true }, { text: p.discussion.join(", ") }], fontSize: FS - 1, margin: [30, 2, 0, 2] });
      for (const v of p.votes) c.push(pdfVoteBlock(v));
    }
  }

  if (withVotes && data.adHoc.length > 0) {
    c.push({ text: "Głosowania poza porządkiem obrad", bold: true, fontSize: FS + 2, margin: [0, 16, 0, 2] });
    c.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: "#000000" }], margin: [0, 0, 0, 6] });
    for (const v of data.adHoc) c.push(pdfVoteBlock(v));
  }

  return c;
}

function pdfDoc(data: ProtocolData, withVotes: boolean, fileName: string) {
  return {
    content: pdfContent(data, withVotes),
    defaultStyle: { font: "Lato", fontSize: FS },
    pageMargins: [50, 48, 50, 44] as [number, number, number, number],
    header: (cp: number, pc: number) => ({
      margin: [50, 20, 50, 0],
      columns: [
        { text: `Posiedzenie nr ${data.meetingNumber} - ${withVotes ? "protokół" : "porządek obrad"}`, fontSize: 8 },
        { text: `Strona ${cp} z ${pc}`, fontSize: 8, alignment: "right" },
      ],
    }),
    info: { title: fileName },
  };
}

export async function downloadAgendaPdf(data: ProtocolData, fileName: string) {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(pdfDoc(data, false, fileName)).download(`${fileName}.pdf`);
}

export async function downloadProtocolPdf(data: ProtocolData, fileName: string) {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(pdfDoc(data, true, fileName)).download(`${fileName}.pdf`);
}

const DOCX_FONT = "Arial";

async function buildDocx(data: ProtocolData, withVotes: boolean) {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = docx;

  const children: InstanceType<typeof Paragraph>[] = [];
  const run = (text: string, opts: Record<string, unknown> = {}) => new TextRun({ text, font: DOCX_FONT, ...opts });

  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(data.organization, { bold: true })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 20 }, children: [run(withVotes ? "Protokół z posiedzenia" : "Porządek obrad", { bold: true, size: 32 })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [run(`${withDateText(`Posiedzenie nr ${data.meetingNumber} - ${data.meetingName}`, data.dateText)}`)] }));
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } }, spacing: { after: 200 }, children: [] }));

  for (const p of data.points) {
    const indent = p.isSubItem ? 720 : 0;
    children.push(new Paragraph({
      indent: { left: indent, hanging: 360 },
      spacing: { before: 160, after: 40 },
      children: [run(`${p.number}.  ${p.title}`)],
    }));
    const meta: string[] = [];
    if (p.presenter) meta.push(`referuje: ${p.presenter}`);
    if (p.committee) meta.push(`opinia: ${p.committee}`);
    if (meta.length) children.push(new Paragraph({ indent: { left: 720 + indent }, children: [run(meta.join(",   "), { italics: true, size: 18 })] }));

    if (withVotes) {
      if (p.discussion.length > 0)
        children.push(new Paragraph({ indent: { left: 720 }, children: [run("W dyskusji głos zabrali: ", { bold: true }), run(p.discussion.join(", "))] }));
      for (const v of p.votes) docxVoteBlock(children, v, docx, run);
    }
  }

  if (withVotes && data.adHoc.length > 0) {
    children.push(new Paragraph({ spacing: { before: 240, after: 60 }, children: [run("Głosowania poza porządkiem obrad", { bold: true, size: 26 })] }));
    for (const v of data.adHoc) docxVoteBlock(children, v, docx, run);
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: DOCX_FONT, size: 20 } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

function docxVoteBlock(
  children: unknown[], v: VoteBlock, docx: typeof import("docx"),
  run: (text: string, opts?: Record<string, unknown>) => InstanceType<typeof import("docx").TextRun>,
) {
  const { Paragraph } = docx;
  const push = (p: unknown) => (children as InstanceType<typeof Paragraph>[]).push(p as InstanceType<typeof Paragraph>);
  const line = (runs: InstanceType<typeof docx.TextRun>[]) => push(new Paragraph({ indent: { left: 720 }, children: runs }));

  push(new Paragraph({ indent: { left: 720 }, spacing: { before: 120 }, children: [run(v.title, { bold: true })] }));

  if (v.list) {
    line([run("Głosowanie na liście - liczba głosów:", { size: 18 })]);
    for (const o of v.list) line([run(`${o.label}: ${o.yes}`, { size: 18 })]);
  } else if (v.pkg) {
    line([run("Głosowanie pakietowe - wyniki pozycji:", { size: 18 })]);
    for (const o of v.pkg) line([run(`${o.label}: za ${o.yes}, przeciw ${o.no}, wstrzymało się ${o.abstain}`, { size: 18 })]);
  } else if (v.quorum) {
    line([run(`Sprawdzenie kworum - obecni ${v.quorum.present.length}, nieobecni ${v.quorum.absent.length}`, { size: 18 })]);
    if (v.quorum.present.length) line([run("Obecni: ", { bold: true, size: 18 }), run(v.quorum.present.join(", "), { size: 18 })]);
    if (v.quorum.absent.length) line([run("Nieobecni: ", { bold: true, size: 18 }), run(v.quorum.absent.join(", "), { size: 18 })]);
  } else {
    line([run(summaryLine(v), { size: 18 })]);
    const cat = (label: string, arr?: string[]) => {
      if (!arr || arr.length === 0) return;
      line([run(`${label} (${arr.length}): `, { bold: true, size: 18 }), run(arr.join(", "), { size: 18 })]);
    };
    cat("Za", v.za); cat("Przeciw", v.przeciw); cat("Wstrzymało się", v.wstrzym); cat("Nie głosowało", v.brak); cat("Nieobecni", v.nieob);
  }

  push(new Paragraph({ indent: { left: 720 }, spacing: { after: 120 }, children: [run(
    `${v.number != null ? `głosowanie nr ${v.number}` : "głosowanie ad hoc"}${v.closeTime ? `, zakończono ${v.closeTime}` : ""}`,
    { size: 14 },
  )] }));
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadAgendaDocx(data: ProtocolData, fileName: string) {
  saveBlob(await buildDocx(data, false), `${fileName}.docx`);
}

export async function downloadProtocolDocx(data: ProtocolData, fileName: string) {
  saveBlob(await buildDocx(data, true), `${fileName}.docx`);
}
