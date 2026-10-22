import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { infoReadReport } from "@/lib/infoReads";
import { buildXlsx } from "@/lib/xlsx";
import { fileResponse, MIME, renderPdf } from "@/lib/serverPdf";
import { prisma } from "@/lib/db";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const NOTE = "Zestawienie otwarć treści w aplikacji. Nie jest dowodem zapoznania się ani doręczenia.";

/** GET - lista otwarć informacji (operator); ?format=xlsx|pdf - eksport. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const rep = await infoReadReport(id);
  if (!rep) return new NextResponse("Nie znaleziono", { status: 404 });
  const format = new URL(req.url).searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf") return NextResponse.json(rep);

  const head = ["Lp.", "Nazwisko i imię", "Klub", "Odbiorca", "Otwarta po ostatniej zmianie", "Pierwsze otwarcie", "Ostatnie otwarcie", "Liczba otwarć", "Otwierana przed zmianą"];
  const rows = rep.rows.map((r, i) => [i + 1, r.name, r.club ?? "", r.current ? "tak" : "nie", r.readCurrent ? "tak" : "nie", dt(r.firstOpenedAt), dt(r.lastOpenedAt), r.openCount || "", r.earlierVersions.length ? "tak" : ""]);
  const summary = `Otwarte: ${rep.summary.readCurrent} z ${rep.summary.recipients} odbiorców.`;
  const base = `otwarcia-informacji-${new Date().toISOString().slice(0, 10)}`;

  if (format === "xlsx") {
    const buf = await buildXlsx([{ name: "Otwarcia", rows: [[`Lista otwarć: ${rep.post.title}`], [`${summary} ${NOTE}`], [], head, ...rows], headerRows: [0, 3], colWidths: [5, 30, 10, 10, 14, 18, 18, 10, 12] }]);
    return fileResponse(buf, `${base}.xlsx`, MIME.xlsx);
  }
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { organizationName: true } });
  const buf = await renderPdf({
    info: { title: `Lista otwarć - ${rep.post.title}` },
    pageOrientation: "landscape", pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: "Lato", fontSize: 9, color: "#000000" },
    footer: (cp: number, pc: number) => ({ text: `Strona ${cp} z ${pc}`, alignment: "right", fontSize: 8, margin: [40, 12] }),
    content: [
      s?.organizationName ? { text: s.organizationName, fontSize: 9, margin: [0, 0, 0, 4] } : null,
      { text: "Lista otwarć informacji", fontSize: 14, bold: true },
      { text: rep.post.title, fontSize: 11, margin: [0, 2, 0, 6] },
      { text: `${summary} Stan na ${dt(new Date().toISOString())}. ${NOTE}`, margin: [0, 0, 0, 8] },
      {
        table: { headerRows: 1, widths: [22, "*", 50, 48, 70, 80, 80, 45, 60], body: [head.map((h) => ({ text: h, bold: true })), ...rows.map((r) => r.map((x) => String(x)))] },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#000000", vLineColor: () => "#000000", paddingTop: () => 3, paddingBottom: () => 3 },
      },
    ].filter(Boolean),
  });
  return fileResponse(buf, `${base}.pdf`, MIME.pdf);
}
