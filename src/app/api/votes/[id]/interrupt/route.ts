import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { VoteStatus } from "@prisma/client";
import { lockVoteRow } from "@/lib/booth";
import { purgeSecretResetPayloads } from "@/lib/secretReset";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const vote = await prisma.vote.findUnique({ where: { id } });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (vote.status !== VoteStatus.OPEN)
    return new NextResponse("Można przerwać tylko otwarte głosowanie", { status: 400 });

  // Przerwanie unieważnia też niewykorzystane udostępnienie karty (tryb kotarkowy) i usuwa
  // zaszyfrowane treści głosów tajnych (zerowanie możliwe tylko w trakcie). Pod blokadą wiersza,
  // tak jak przyjmowanie głosów i zamknięcie.
  const count = await prisma.$transaction(async (tx) => {
    await lockVoteRow(tx, id);
    const upd = await tx.vote.updateMany({
      where: { id, status: VoteStatus.OPEN },
      data: { status: VoteStatus.INTERRUPTED, boothUserId: null, boothGrantedAt: null },
    });
    if (upd.count > 0) await purgeSecretResetPayloads(tx, id);
    return upd.count;
  });
  if (count === 0) return new NextResponse("Można przerwać tylko otwarte głosowanie", { status: 400 });

  await audit({
    action: "VOTE_INTERRUPTED",
    description: `Przerwano głosowanie: ${vote.title}`,
    meetingId: vote.meetingId,
    userId: session.user.id,
    metadata: { voteId: vote.id },
  });

  await prisma.meeting.updateMany({ where: { id: vote.meetingId, displayPinVoteId: vote.id }, data: { displayPinVoteId: null } });
  publishToMeeting(vote.meetingId, { type: "vote.closed", voteId: vote.id });
  return NextResponse.json({ ok: true });
}
