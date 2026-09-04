import { withDateText } from "@/lib/meetingName";

interface VoteBlock {
  voteId: string; number: number | null; title: string; type: string; closeTime: string | null;
  za?: string[]; przeciw?: string[]; wstrzym?: string[]; brak?: string[]; nieob?: string[];
  list?: { label: string; za: string[]; przeciw: string[] }[];
  pkg?: { label: string; za: string[]; przeciw: string[]; wstrzym: string[] }[];
  quorum?: { present: string[]; absent: string[] };
}
type PointEntry =
  | { kind: "vote"; vote: VoteBlock }
  | { kind: "motion"; name: string; time: string | null };
interface Point {
  number: string; title: string; isSubItem: boolean;
  presenter: string | null; committee: string | null;
  openTime: string | null; closeTime: string | null;
  discussion: string[]; entries: PointEntry[];
}
type Block =
  | { kind: "point"; point: Point }
  | { kind: "adhoc"; entries: PointEntry[] };
export interface ProtocolData {
  organization: string; meetingName: string; meetingNumber: string; dateText: string;
  meetingOpenTime: string | null; meetingCloseTime: string | null;
  attendance: { present: { name: string; club: string | null }[]; absent: { name: string; club: string | null }[] };
  points: Point[]; blocks: Block[];
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

  const catList = (label: string, arr: string[]) => {
    if (arr.length === 0) return;
    parts.push({ text: [{ text: `${label} (${arr.length}): `, bold: true }, { text: arr.join(", ") }], fontSize: FS - 1, margin: [0, 1, 0, 1] });
  };

  if (v.list) {
    parts.push({ text: "Głosowanie na liście - wyniki imienne:", fontSize: FS - 1, margin: [0, 0, 0, 2] });
    for (const o of v.list) {
      parts.push({ text: o.label, italics: true, fontSize: FS - 1, margin: [4, 2, 0, 0] });
      catList("Za", o.za); catList("Przeciw", o.przeciw);
    }
  } else if (v.pkg) {
    parts.push({ text: "Głosowanie pakietowe - wyniki imienne pozycji:", fontSize: FS - 1, margin: [0, 0, 0, 2] });
    for (const o of v.pkg) {
      parts.push({ text: o.label, italics: true, fontSize: FS - 1, margin: [4, 2, 0, 0] });
      catList("Za", o.za); catList("Przeciw", o.przeciw); catList("Wstrzymało się", o.wstrzym);
    }
  } else if (v.quorum) {
    parts.push({ text: `Sprawdzenie kworum - obecni ${v.quorum.present.length}, nieobecni ${v.quorum.absent.length}`, fontSize: FS - 1, margin: [0, 0, 0, 2] });
    if (v.quorum.present.length) parts.push({ text: [{ text: "Obecni: ", bold: true }, { text: v.quorum.present.join(", ") }], fontSize: FS - 1, margin: [0, 1, 0, 1] });
    if (v.quorum.absent.length) parts.push({ text: [{ text: "Nieobecni: ", bold: true }, { text: v.quorum.absent.join(", ") }], fontSize: FS - 1, margin: [0, 1, 0, 1] });
  } else {
    parts.push({ text: summaryLine(v), fontSize: FS - 1, margin: [0, 0, 0, 3] });
    parts.push({ text: "Wyniki imienne", italics: true, fontSize: FS - 1, margin: [0, 0, 0, 2] });
    catList("Za", v.za ?? []); catList("Przeciw", v.przeciw ?? []); catList("Wstrzymało się", v.wstrzym ?? []); catList("Nie głosowało", v.brak ?? []); catList("Nieobecni", v.nieob ?? []);
  }

  const foot = `${v.number != null ? `głosowanie nr ${v.number}` : "głosowanie ad hoc"}${v.closeTime ? `, zakończono ${v.closeTime}` : ""}`;
  parts.push({ text: foot, fontSize: FS - 3, margin: [0, 3, 0, 0] });
  return { unbreakable: true, margin: [30, 6, 0, 8], stack: parts };
}

function pdfMotionLine(m: { name: string; time: string | null }): Record<string, unknown> {
  return {
    text: [{ text: "Wniosek formalny: ", bold: true }, { text: m.name }, ...(m.time ? [{ text: ` (${m.time})`, color: "#555555" }] : [])],
    fontSize: FS - 1, margin: [30, 2, 0, 2],
  };
}

function pdfEntry(e: PointEntry): Record<string, unknown> {
  return e.kind === "vote" ? pdfVoteBlock(e.vote) : pdfMotionLine(e);
}

function pdfPointHeader(p: Point): Record<string, unknown> {
  const meta: string[] = [];
  if (p.presenter) meta.push(`referuje: ${p.presenter}`);
  if (p.committee) meta.push(`opinia: ${p.committee}`);
  const times = p.openTime ? `${p.openTime}${p.closeTime ? ` - ${p.closeTime}` : ""}` : null;
  const indent = p.isSubItem ? 28 : 0;
  return {
    columns: [
      { width: 30 + indent, text: `${p.number}.`, fontSize: FS + 1, margin: [indent, 0, 0, 0] },
      { width: "*", stack: [
        { text: p.title, fontSize: FS + 1 },
        ...(meta.length ? [{ text: meta.join(",   "), fontSize: FS - 1, margin: [0, 2, 0, 0] }] : []),
        ...(times ? [{ text: times, fontSize: FS - 2, margin: [0, 1, 0, 0], color: "#555555" }] : []),
      ] },
    ],
    margin: [0, 8, 0, 2],
  };
}

function pdfContent(data: ProtocolData, withVotes: boolean): Record<string, unknown>[] {
  const c: Record<string, unknown>[] = [
    { text: data.organization, fontSize: FS + 1, bold: true, alignment: "center" },
    { text: `${withDateText(`Posiedzenie nr ${data.meetingNumber} - ${data.meetingName}`, data.dateText)}`, fontSize: FS + 4, bold: true, alignment: "center", margin: [0, 4, 0, 4] },
    ...(withVotes && (data.meetingOpenTime || data.meetingCloseTime)
      ? [{ text: `Otwarcie: ${data.meetingOpenTime ?? "-"}    Zamknięcie: ${data.meetingCloseTime ?? "-"}`, fontSize: FS - 1, alignment: "center", margin: [0, 0, 0, 4] } as Record<string, unknown>]
      : []),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: "#000000" }], margin: [0, 0, 0, 14] },
  ];

  if (!withVotes) {
    c.push({ text: "Porządek obrad", fontSize: FS + 4, bold: true, margin: [0, 0, 0, 6] });
    for (const p of data.points) c.push(pdfPointHeader(p));
    return c;
  }

  if (data.attendance.present.length + data.attendance.absent.length > 0) {
    c.push({ text: "Lista obecności", bold: true, fontSize: FS + 2, margin: [0, 0, 0, 6] });
    if (data.attendance.present.length) {
      c.push({ text: `Obecni (${data.attendance.present.length})`, italics: true, fontSize: FS - 1, margin: [0, 2, 0, 1] });
      c.push({ text: data.attendance.present.map((a) => a.club ? `${a.name} (${a.club})` : a.name).join(", "), fontSize: FS - 1, margin: [0, 0, 0, 4] });
    }
    if (data.attendance.absent.length) {
      c.push({ text: `Nieobecni (${data.attendance.absent.length})`, italics: true, fontSize: FS - 1, margin: [0, 2, 0, 1] });
      c.push({ text: data.attendance.absent.map((a) => a.club ? `${a.name} (${a.club})` : a.name).join(", "), fontSize: FS - 1, margin: [0, 0, 0, 4] });
    }
    c.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: "#000000" }], margin: [0, 8, 0, 14] });
  }

  for (const block of data.blocks) {
    if (block.kind === "point") {
      const p = block.point;
      c.push(pdfPointHeader(p));
      if (p.discussion.length > 0)
        c.push({ text: [{ text: "W dyskusji głos zabrali: ", bold: true }, { text: p.discussion.join(", ") }], fontSize: FS - 1, margin: [30, 2, 0, 2] });
      for (const e of p.entries) c.push(pdfEntry(e));
    } else {
      c.push({ text: "Poza porządkiem obrad", bold: true, fontSize: FS + 1, margin: [0, 14, 0, 2] });
      for (const e of block.entries) c.push(pdfEntry(e));
    }
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
        { text: `Posiedzenie nr ${data.meetingNumber}${withVotes ? "" : " - porządek obrad"}`, fontSize: 8 },
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
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 20 }, children: [run(`${withDateText(`Posiedzenie nr ${data.meetingNumber} - ${data.meetingName}`, data.dateText)}`, { bold: true, size: 28 })] }));
  if (withVotes && (data.meetingOpenTime || data.meetingCloseTime)) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [run(`Otwarcie: ${data.meetingOpenTime ?? "-"}    Zamknięcie: ${data.meetingCloseTime ?? "-"}`, { size: 18 })] }));
  }
  if (!withVotes) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [] }));
  }
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } }, spacing: { after: 200 }, children: [] }));

  const pointHeading = (p: Point) => {
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
    if (withVotes && p.openTime) {
      children.push(new Paragraph({ indent: { left: 720 + indent }, children: [run(`${p.openTime}${p.closeTime ? ` - ${p.closeTime}` : ""}`, { size: 16, color: "555555" })] }));
    }
  };

  if (!withVotes) {
    children.push(new Paragraph({ spacing: { after: 60 }, children: [run("Porządek obrad", { bold: true, size: 26 })] }));
    for (const p of data.points) pointHeading(p);
    const doc = new Document({ styles: { default: { document: { run: { font: DOCX_FONT, size: 20 } } } }, sections: [{ children }] });
    return Packer.toBlob(doc);
  }

  if (data.attendance.present.length + data.attendance.absent.length > 0) {
    children.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [run("Lista obecności", { bold: true, size: 24 })] }));
    if (data.attendance.present.length) {
      children.push(new Paragraph({ children: [run(`Obecni (${data.attendance.present.length}): `, { bold: true, size: 18 }), run(data.attendance.present.map((a) => a.club ? `${a.name} (${a.club})` : a.name).join(", "), { size: 18 })] }));
    }
    if (data.attendance.absent.length) {
      children.push(new Paragraph({ spacing: { before: 40 }, children: [run(`Nieobecni (${data.attendance.absent.length}): `, { bold: true, size: 18 }), run(data.attendance.absent.map((a) => a.club ? `${a.name} (${a.club})` : a.name).join(", "), { size: 18 })] }));
    }
    children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } }, spacing: { before: 120, after: 160 }, children: [] }));
  }

  for (const block of data.blocks) {
    if (block.kind === "point") {
      const p = block.point;
      pointHeading(p);
      if (p.discussion.length > 0)
        children.push(new Paragraph({ indent: { left: 720 }, children: [run("W dyskusji głos zabrali: ", { bold: true }), run(p.discussion.join(", "))] }));
      for (const e of p.entries) docxEntry(children, e, docx, run);
    } else {
      children.push(new Paragraph({ spacing: { before: 200, after: 40 }, children: [run("Poza porządkiem obrad", { bold: true, size: 22 })] }));
      for (const e of block.entries) docxEntry(children, e, docx, run);
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: DOCX_FONT, size: 20 } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

function docxEntry(
  children: unknown[], e: PointEntry, docx: typeof import("docx"),
  run: (text: string, opts?: Record<string, unknown>) => InstanceType<typeof import("docx").TextRun>,
) {
  const { Paragraph } = docx;
  if (e.kind === "motion") {
    (children as InstanceType<typeof Paragraph>[]).push(new Paragraph({
      indent: { left: 720 },
      children: [run("Wniosek formalny: ", { bold: true, size: 18 }), run(e.name, { size: 18 }), ...(e.time ? [run(` (${e.time})`, { size: 16, color: "555555" })] : [])],
    }));
    return;
  }
  docxVoteBlock(children, e.vote, docx, run);
}

function docxVoteBlock(
  children: unknown[], v: VoteBlock, docx: typeof import("docx"),
  run: (text: string, opts?: Record<string, unknown>) => InstanceType<typeof import("docx").TextRun>,
) {
  const { Paragraph } = docx;
  const push = (p: unknown) => (children as InstanceType<typeof Paragraph>[]).push(p as InstanceType<typeof Paragraph>);
  const line = (runs: InstanceType<typeof docx.TextRun>[]) => push(new Paragraph({ indent: { left: 720 }, children: runs }));

  push(new Paragraph({ indent: { left: 720 }, spacing: { before: 120 }, children: [run(v.title, { bold: true })] }));

  const catList = (label: string, arr: string[]) => {
    if (arr.length === 0) return;
    line([run(`${label} (${arr.length}): `, { bold: true, size: 18 }), run(arr.join(", "), { size: 18 })]);
  };

  if (v.list) {
    line([run("Głosowanie na liście - wyniki imienne:", { size: 18 })]);
    for (const o of v.list) {
      line([run(o.label, { italics: true, size: 18 })]);
      catList("Za", o.za); catList("Przeciw", o.przeciw);
    }
  } else if (v.pkg) {
    line([run("Głosowanie pakietowe - wyniki imienne pozycji:", { size: 18 })]);
    for (const o of v.pkg) {
      line([run(o.label, { italics: true, size: 18 })]);
      catList("Za", o.za); catList("Przeciw", o.przeciw); catList("Wstrzymało się", o.wstrzym);
    }
  } else if (v.quorum) {
    line([run(`Sprawdzenie kworum - obecni ${v.quorum.present.length}, nieobecni ${v.quorum.absent.length}`, { size: 18 })]);
    if (v.quorum.present.length) line([run("Obecni: ", { bold: true, size: 18 }), run(v.quorum.present.join(", "), { size: 18 })]);
    if (v.quorum.absent.length) line([run("Nieobecni: ", { bold: true, size: 18 }), run(v.quorum.absent.join(", "), { size: 18 })]);
  } else {
    line([run(summaryLine(v), { size: 18 })]);
    line([run("Wyniki imienne", { italics: true, size: 18 })]);
    catList("Za", v.za ?? []); catList("Przeciw", v.przeciw ?? []); catList("Wstrzymało się", v.wstrzym ?? []); catList("Nie głosowało", v.brak ?? []); catList("Nieobecni", v.nieob ?? []);
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
