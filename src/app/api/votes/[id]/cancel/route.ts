import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { VoteStatus } from "@prisma/client";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const vote = await prisma.vote.findUnique({ where: { id } });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (vote.status === VoteStatus.CLOSED || vote.status === VoteStatus.CANCELLED)
    return new NextResponse("Głosowanie już zakończone", { status: 400 });

  // Anulowane głosowanie TRACI numer - numeracja nie ma dziur, a kolejne
  // głosowanie dostanie ten sam numer (licznik cofa się o jeden).
  await prisma.vote.update({
    where: { id },
    data: { status: VoteStatus.CANCELLED, closedAt: new Date(), number: null },
  });

  await audit({
    action: "VOTE_CANCELLED",
    description: `Anulowano głosowanie${vote.number != null ? ` nr ${vote.number}` : ""}: ${vote.title}`,
    meetingId: vote.meetingId,
    userId: session.user.id,
    metadata: { voteId: vote.id },
  });

  await prisma.meeting.updateMany({ where: { id: vote.meetingId, displayPinVoteId: vote.id }, data: { displayPinVoteId: null } });
  publishToMeeting(vote.meetingId, { type: "vote.cancelled", voteId: vote.id });
  return NextResponse.json({ ok: true });
}
