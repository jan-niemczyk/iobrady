import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMeetingParticipant } from "@/lib/participantAccess";
import { buildVoteReportData } from "@/lib/voteReportData";
import { NextResponse } from "next/server";

/**
 * GET /api/votes/[id]/participant-report - wyniki głosowania dla radnego/operatora.
 * buildVoteReportData() już samodzielnie chroni tajność (dla isSecret per-osoba ma tylko
 * "ob."/"nb.", nigdy treść głosu) - zwracamy jej wynik wprost, bez dodatkowego filtrowania.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id: voteId } = await ctx.params;

  const vote = await prisma.vote.findUnique({ where: { id: voteId }, select: { meetingId: true, status: true } });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (vote.status !== "CLOSED") return new NextResponse("Głosowanie nie zostało jeszcze zamknięte", { status: 400 });

  if (session.user.role !== "OPERATOR") {
    const mp = await getMeetingParticipant(session.user.id, vote.meetingId);
    if (!mp) return new NextResponse("Not found", { status: 404 });
  }

  const data = await buildVoteReportData(voteId);
  if (!data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(data);
}
