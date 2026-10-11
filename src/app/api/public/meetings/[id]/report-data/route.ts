import { prisma } from "@/lib/db";
import { buildVoteReportData } from "@/lib/voteReportData";
import { NextResponse } from "next/server";

// Dane raportów PDF dla widoku publicznego (bez logowania), generowanych w przeglądarce
// tym samym szablonem co raporty operatora. Tylko posiedzenia z Meeting.publicEnabled
// i tylko głosowania ZAKOŃCZONE (wynik ostateczny). Głosowania tajne: raport zawiera
// wyłącznie udział („ob.”), bez treści głosu osób - tak jak wydruk operatora.
// GET /api/public/meetings/[id]/report-data           -> wszystkie zakończone głosowania
// GET /api/public/meetings/[id]/report-data?vote=xxx  -> jedno głosowanie
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { publicEnabled: true } });
  // Brak rozróżnienia „nie istnieje” / „nie udostępnione”.
  if (!meeting?.publicEnabled) return new NextResponse("Not found", { status: 404 });

  const voteId = new URL(req.url).searchParams.get("vote");
  const votes = await prisma.vote.findMany({
    where: { meetingId: id, status: "CLOSED", ...(voteId ? { id: voteId } : {}) },
    orderBy: { number: "asc" },
    select: { id: true },
  });
  if (voteId && votes.length === 0) return new NextResponse("Not found", { status: 404 });

  const reports = [];
  for (const v of votes) {
    const d = await buildVoteReportData(v.id);
    if (d) reports.push(d);
  }
  return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
}
