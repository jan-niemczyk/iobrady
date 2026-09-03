import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * PATCH /api/votes/[id]/exclusions
 *
 * body: { participantId: string, excluded: boolean, reason?: string }
 *
 * Operator może wyłączyć uczestnika z konkretnego głosowania (np. konflikt interesów).
 * Operacja dozwolona tylko gdy głosowanie ma status DRAFT lub READY.
 */
const schema = z.object({
  participantId: z.string(),
  excluded: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: voteId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const vote = await prisma.vote.findUnique({ where: { id: voteId } });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (vote.status !== "DRAFT" && vote.status !== "READY")
    return new NextResponse("Wyłączenia można zmieniać tylko przed otwarciem głosowania", { status: 400 });

  const mp = await prisma.meetingParticipant.findUnique({
    where: { id: parsed.data.participantId },
    include: { user: true },
  });
  if (!mp || mp.meetingId !== vote.meetingId)
    return new NextResponse("Uczestnik spoza posiedzenia", { status: 400 });

  const list = new Set(mp.excludedFromVoteIds);
  if (parsed.data.excluded) list.add(voteId); else list.delete(voteId);

  await prisma.meetingParticipant.update({
    where: { id: mp.id },
    data: { excludedFromVoteIds: Array.from(list) },
  });

  await audit({
    action: "PARTICIPANT_EXCLUDED",
    description: parsed.data.excluded
      ? `Wyłączono ${mp.user.firstName} ${mp.user.lastName} z głosowania „${vote.title}"`
      : `Przywrócono ${mp.user.firstName} ${mp.user.lastName} do głosowania „${vote.title}"`,
    meetingId: vote.meetingId,
    userId: session.user.id,
    metadata: { voteId, participantId: mp.id, excluded: parsed.data.excluded, reason: parsed.data.reason },
  });

  publishToMeeting(vote.meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
