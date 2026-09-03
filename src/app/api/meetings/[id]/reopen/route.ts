import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const m = await prisma.meeting.findUnique({ where: { id } });
  if (!m) return new NextResponse("Not found", { status: 404 });
  if (m.status !== "CLOSED")
    return new NextResponse("Posiedzenie nie jest zamknięte - nie ma czego cofać", { status: 400 });

  await prisma.meeting.update({
    where: { id },
    data: {
      status: "IN_PROGRESS",
      closedAt: null,
    },
  });

  await audit({
    action: "MEETING_REOPENED",
    description: "Cofnięto zakończenie posiedzenia",
    meetingId: id,
    userId: session.user.id,
  });

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
