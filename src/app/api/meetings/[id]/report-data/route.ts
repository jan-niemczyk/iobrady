import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildVoteReportData } from "@/lib/voteReportData";
import { secretTallyHidden } from "@/lib/secretTally";
import { NextResponse } from "next/server";

// Zwraca dane raportu(ów) do wygenerowania PDF po stronie klienta (pdfmake + Lato).
// GET /api/meetings/[id]/report-data           → wszystkie zamknięte głosowania posiedzenia
// GET /api/meetings/[id]/report-data?vote=xxx  → pojedyncze głosowanie
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const voteId = url.searchParams.get("vote");

  if (voteId) {
    // Głosowanie tajne: żadnych wyników cząstkowych przed zamknięciem (SA-01), także w raporcie.
    const v = await prisma.vote.findUnique({ where: { id: voteId }, select: { visibility: true, status: true, meetingId: true } });
    if (!v || v.meetingId !== id) return new NextResponse("Not found", { status: 404 });
    if (v.status === "OPEN" && secretTallyHidden(v))
      return new NextResponse("Raport głosowania tajnego jest dostępny po jego zamknięciu.", { status: 409 });
    const data = await buildVoteReportData(voteId);
    if (!data) return new NextResponse("Not found", { status: 404 });
    return NextResponse.json({ reports: [data] });
  }

  // Wszystkie zakończone głosowania posiedzenia (po numerze rosnąco).
  const votes = await prisma.vote.findMany({
    where: { meetingId: id, status: { in: ["CLOSED", "INTERRUPTED"] } },
    orderBy: { number: "asc" },
    select: { id: true },
  });
  const reports = [];
  for (const v of votes) {
    const d = await buildVoteReportData(v.id);
    if (d) reports.push(d);
  }
  return NextResponse.json({ reports });
}
