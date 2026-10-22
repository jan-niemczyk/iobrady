import { fillPlaceholders, parseBlocks, type Block, type NoticeAgendaItem, type NoticeContent, type NoticeRecipient, type Run } from "@/lib/noticeText";
import { placeholderValues } from "@/lib/noticeDocx";
import { loadRaster, uploadedFilePath } from "@/lib/rasterImage";
import { renderPdf } from "@/lib/serverPdf";

/**
 * PDF zawiadomienia - ten sam układ co DOCX (logo i dane organu, znak sprawy i data w jednym
 * wierszu, adresat po prawej, treść, porządek, podpis po prawej, stopka z numeracją). Papier
 * firmowy jako tło każdej strony; treść w marginesach z ustawień, więc nie nachodzi na jego
 * nagłówek i stopkę. Czcionka Lato, wyłącznie czerń.
 */

const PT_PER_MM = 72 / 25.4;
const A4 = { w: 595.28, h: 841.89 };
const fill = (t: string, v: Record<string, string>) => fillPlaceholders(t, v).text;
const runs = (rs: Run[], bold = false) => rs.map((r) => ({ text: r.text, bold: r.bold || bold || undefined, italics: r.italic || undefined }));

function rich(src: string): unknown[] {
  const blocks = parseBlocks(src);
  const out: unknown[] = [];
  for (let i = 0; i < blocks.length; ) {
    const b = blocks[i];
    if (b.type === "p") {
      out.push(b.runs.some((r) => r.text.trim()) ? { text: runs(b.runs), alignment: b.align, margin: [0, 0, 0, 5] } : { text: " ", margin: [0, 0, 0, 2] });
      i++;
      continue;
    }
    const group: Block[] = [];
    let j = i;
    while (j < blocks.length && blocks[j].type === b.type) group.push(blocks[j++]);
    const items = group.map((g) => ({ text: runs(g.runs), margin: [0, 0, 0, 2] }));
    out.push(b.type === "ol" ? { ol: items, start: group[0].number ?? 1, margin: [0, 0, 0, 5] } : { ul: items, margin: [0, 0, 0, 5] });
    i = j;
  }
  return out;
}

const nonEmpty = (t: string) => t.split(/\r?\n/).filter((l) => l.trim());

export async function buildNoticePdf(input: { content: NoticeContent; agenda: NoticeAgendaItem[]; recipient: NoticeRecipient | null; values: Record<string, string>; logoPath: string | null }): Promise<Buffer> {
  const { content: c, agenda, recipient } = input;
  const v = placeholderValues(input.values, recipient);
  const m = { l: c.marginLeftMm * PT_PER_MM, r: c.marginRightMm * PT_PER_MM, t: c.marginTopMm * PT_PER_MM, b: c.marginBottomMm * PT_PER_MM };
  const W = A4.w - m.l - m.r;
  const logo = c.useLogo ? await loadRaster(input.logoPath, 800) : null;
  const paper = c.letterheadImage ? await loadRaster(uploadedFilePath(c.letterheadImage), 2480) : null;
  const dataUrl = (img: { data: Buffer; kind: string }) => `data:image/${img.kind === "jpg" ? "jpeg" : "png"};base64,${img.data.toString("base64")}`;

  const content: unknown[] = [];
  const unit = [
    ...nonEmpty(fill(c.unitName, v)).map((l) => ({ text: l, bold: true })),
    ...nonEmpty(fill(c.unitDetails, v)).map((l) => ({ text: l })),
  ];
  if (logo) content.push({ columns: [{ image: dataUrl(logo), fit: [96, 56], width: 110 }, { stack: unit, width: "*", margin: [0, Math.max(0, (56 - unit.length * 13) / 2), 0, 0] }], columnGap: 0 });
  else if (unit.length) content.push({ stack: unit });

  const placeDate = [fill(c.place, v), c.letterDate ? v.data_pisma : ""].filter(Boolean).join(", ");
  const ref = fill(c.caseRef, v).trim();
  if (placeDate || ref) content.push({ columns: [{ text: ref, width: "*" }, { text: placeDate, alignment: "right", width: "auto" }], margin: [0, 16, 0, 0] });

  if (recipient) {
    const addr = [recipient.name, recipient.functionTitle, recipient.institution, ...recipient.address.split(/\r?\n/)].map((x) => x.trim()).filter(Boolean);
    content.push({ stack: addr.map((l, i) => ({ text: l, bold: i === 0 })), margin: [W * 0.55, 16, 0, 0] });
  }
  content.push({ text: " ", margin: [0, 0, 0, 14] });

  if (c.title.trim()) content.push({ text: runs(parseBlocks(fill(c.title, v))[0]?.runs ?? [], true), alignment: "center", fontSize: 13, margin: [0, 0, 0, 12] });
  if (recipient?.salutation.trim()) content.push({ text: recipient.salutation.trim(), margin: [0, 0, 0, 6] });
  content.push(...rich(fill(c.intro, v)));

  if (c.agendaPosition !== "none" && agenda.length) {
    if (c.agendaLabel.trim()) content.push({ text: runs(parseBlocks(fill(c.agendaLabel, v))[0]?.runs ?? [], true), margin: [0, 8, 0, 6] });
    for (const a of agenda) {
      const num = a.unnumbered || !a.number.trim() ? "" : `${a.number.replace(/\.$/, "")}.`;
      content.push({
        columns: [{ text: num, width: 28 }, { text: runs(parseBlocks(fill(a.title, v))[0]?.runs ?? []), width: "*" }],
        columnGap: 0, margin: [a.level === 1 ? 28 : 0, 0, 0, 3],
      });
    }
  }
  content.push(...rich(fill(c.outro, v)));

  if (c.signature.trim()) {
    const sig = fill(c.signature, v).split(/\r?\n/);
    content.push({ stack: sig.map((l, i) => ({ text: l || " ", alignment: "center", margin: [0, 0, 0, i === 0 && sig.length > 1 ? 14 : 0] })), margin: [W / 2, 30, 0, 0], unbreakable: true });
  }

  const footerLines = nonEmpty(fill(c.footer, v));
  const header = nonEmpty(fill(c.letterhead, v));
  // Z papierem firmowym margines dolny to wysokość stopki papieru (strefa wolna, różna dla papierów):
  // stopka dokumentu stoi tuż nad nią, a treść kończy się nad stopką dokumentu.
  const footerH = footerLines.length * 10 + (c.footerPageNumbers ? 10 : 0);
  const bottom = paper && footerH ? m.b + footerH + 6 : m.b;
  return renderPdf({
    info: { title: fill(c.title, v) || "Zawiadomienie" },
    pageSize: "A4",
    pageMargins: [m.l, m.t, m.r, bottom],
    defaultStyle: { font: "Lato", fontSize: 11, lineHeight: 1.2, color: "#000000" },
    ...(paper ? { background: () => ({ image: dataUrl(paper), width: A4.w, height: A4.h }) } : {}),
    ...(header.length ? { header: () => ({ stack: header.map((l) => ({ text: l, alignment: "center", fontSize: 9 })), margin: [m.l, Math.max(8, m.t / 2 - 10), m.r, 0] }) } : {}),
    footer: (cp: number, pc: number) => ({
      stack: [
        ...footerLines.map((l) => ({ text: l, alignment: "center", fontSize: 8 })),
        ...(c.footerPageNumbers ? [{ text: `Strona ${cp} z ${pc}`, alignment: "right", fontSize: 8 }] : []),
      ],
      margin: [m.l, paper ? 4 : Math.max(6, m.b - 14 - footerLines.length * 10 - 10), m.r, 0],
    }),
    content,
  });
}
