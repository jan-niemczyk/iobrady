import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  hasVotingRight: z.boolean().optional(),
  isInvitedGuest: z.boolean().optional(),
  isChairperson: z.boolean().optional(),
  hasPriorityRight: z.boolean().optional(),
  canUseMiniDisplay: z.boolean().optional(),
  excludedFromMeeting: z.boolean().optional(),
  // null = priorytet globalny; wartość = tylko w tym punkcie porządku
  priorityAgendaItemId: z.string().nullable().optional(),
  priorityAgendaItemIds: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ mpId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { mpId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const mp = await prisma.meetingParticipant.findUnique({ where: { id: mpId } });
  if (!mp) return new NextResponse("Not found", { status: 404 });

  await prisma.meetingParticipant.update({ where: { id: mpId }, data: parsed.data });

  await audit({
    action: "PARTICIPANT_RIGHT_CHANGED",
    description: `Zmieniono uprawnienia uczestnika`,
    meetingId: mp.meetingId, userId: session.user.id,
    metadata: { mpId, changes: parsed.data },
  });

  publishToMeeting(mp.meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ mpId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { mpId } = await ctx.params;
  const mp = await prisma.meetingParticipant.findUnique({ where: { id: mpId } });
  if (!mp) return new NextResponse("Not found", { status: 404 });

  await prisma.meetingParticipant.delete({ where: { id: mpId } });
  publishToMeeting(mp.meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
