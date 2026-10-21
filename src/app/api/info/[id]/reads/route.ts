import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { infoReadReport } from "@/lib/infoReads";
import { buildXlsx } from "@/lib/xlsx";
import { fileResponse, MIME } from "@/lib/serverPdf";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "");

/** GET - zestawienie otwarć (operator); ?format=xlsx - eksport. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const rep = await infoReadReport(id);
  if (!rep) return new NextResponse("Nie znaleziono", { status: 404 });
  if (new URL(req.url).searchParams.get("format") !== "xlsx") return NextResponse.json(rep);
  const rows = [
    [`Otwarcia informacji: ${rep.post.title}`],
    [`Bieżąca wersja: ${rep.post.version}. Otwarcie treści w aplikacji nie jest dowodem zapoznania się ani doręczenia.`],
    [],
    ["Osoba", "Klub", "Odbiorca obecnie", "Bieżąca wersja otwarta", "Pierwsze otwarcie", "Ostatnie otwarcie", "Liczba otwarć", "Otwarte wcześniejsze wersje"],
    ...rep.rows.map((r) => [r.name, r.club ?? "", r.current ? "tak" : "nie (poza odbiorcami)", r.readCurrent ? "tak" : "nie", dt(r.firstOpenedAt), dt(r.lastOpenedAt), r.openCount, r.earlierVersions.join(", ")]),
  ];
  const buf = await buildXlsx([{ name: "Otwarcia", rows, headerRows: [0, 3], colWidths: [30, 10, 20, 18, 20, 20, 12, 18] }]);
  return fileResponse(buf, `otwarcia-informacji-${id}.xlsx`, MIME.xlsx);
}
