import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return new NextResponse("Not found", { status: 404 });
  if (meeting.status !== "PREPARED" && meeting.status !== "DRAFT")
    return new NextResponse("Posiedzenia w tym statusie nie można otworzyć", { status: 400 });

  await prisma.meeting.update({
    where: { id },
    data: { status: "IN_PROGRESS", openedAt: new Date() },
  });

  await audit({
    action: "MEETING_OPENED",
    description: `Otwarto posiedzenie ${meeting.number} - ${meeting.name}`,
    meetingId: id,
    userId: session.user.id,
  });

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
