import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const addSchema = z.object({
  userIds: z.array(z.string()).min(1),
  hasVotingRight: z.boolean().optional().default(true),
  isInvitedGuest: z.boolean().optional().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  let added = 0;
  for (const userId of parsed.data.userIds) {
    const existing = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    });
    if (existing) continue;
    await prisma.meetingParticipant.create({
      data: {
        meetingId, userId,
        hasVotingRight: parsed.data.hasVotingRight ?? true,
        isInvitedGuest: parsed.data.isInvitedGuest ?? false,
      },
    });
    added++;
  }

  await audit({
    action: "MEETING_CREATED",
    description: `Dodano ${added} uczestników do posiedzenia`,
    meetingId, userId: session.user.id,
    metadata: { kind: "participants_added", count: added },
  });

  publishToMeeting(meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true, added });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });
  const { id: meetingId } = await ctx.params;

  const participants = await prisma.meetingParticipant.findMany({
    where: { meetingId },
    include: { user: { include: { group: true } } },
    orderBy: { user: { lastName: "asc" } },
  });
  return NextResponse.json(participants);
}
