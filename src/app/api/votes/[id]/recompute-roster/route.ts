import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

// POST /api/votes/[id]/recompute-roster
// Odświeża migawkę obecności głosowania (VoteRoster.present) na podstawie BIEŻĄCEGO stanu obecności.
// Użycie: po korekcie/usunięciu błędnej migawki, aby w wydruku ktoś obecny (a niegłosujący)
// nie był pokazany jako "nb.". Nie dotyczy kworum (tam obecność wynika z oddania głosu).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const vote = await prisma.vote.findUnique({ where: { id }, select: { id: true, meetingId: true, type: true, title: true } });
  if (!vote) return new NextResponse("Not found", { status: 404 });

  if (vote.type === "QUORUM") {
    return new NextResponse("Kworum ustala obecność z oddanych głosów - odświeżanie rostera nie dotyczy.", { status: 400 });
  }

  const parts = await prisma.meetingParticipant.findMany({
    where: { meetingId: vote.meetingId },
    include: { attendance: true },
  });
  const presentByUser = new Map(parts.map((mp) => [mp.userId, mp.attendance?.status === "PRESENT"]));

  const roster = await prisma.voteRoster.findMany({ where: { voteId: id } });
  await prisma.$transaction(
    roster.map((r) =>
      prisma.voteRoster.update({
        where: { id: r.id },
        data: { present: r.userId ? (presentByUser.get(r.userId) ?? false) : r.present },
      }),
    ),
  );

  await audit({
    action: "VOTE_UPDATED",
    description: `Odświeżono obecność w wydruku głosowania: ${vote.title}`,
    meetingId: vote.meetingId, userId: session.user.id,
    metadata: { voteId: id },
  });

  return NextResponse.json({ ok: true, updated: roster.length });
}
