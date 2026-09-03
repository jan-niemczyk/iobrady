import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { finishActiveSpeaker } from "@/lib/finishActiveSpeaker";
import { NextResponse } from "next/server";

/**
 * Zawiesza aktualnie rozpatrywany punkt agendy.
 * Punkt zmienia status z CURRENT na PAUSED. `Meeting.currentAgendaItemId` zostaje wyzerowany,
 * dzięki czemu operator może rozpocząć inny punkt - lub wrócić do tego klikając "Rozpocznij".
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("Not found", { status: 404 });
  if (item.status !== "CURRENT")
    return new NextResponse("Punkt nie jest aktualnie rozpatrywany", { status: 400 });

  await prisma.$transaction(async (tx) => {
    // H1: zawieszenie punktu kończy trwające przemówienie i nalicza jego czas (netto).
    await finishActiveSpeaker(tx, item.meetingId);
    await tx.agendaItem.update({
      where: { id: item.id },
      data: { status: "PAUSED" },
    });
    await tx.meeting.update({
      where: { id: item.meetingId },
      data: { currentAgendaItemId: null },
    });
  });

  await audit({
    action: "AGENDA_ITEM_STARTED",
    description: `Zawieszono punkt ${item.number}: ${item.title}`,
    meetingId: item.meetingId,
    userId: session.user.id,
    metadata: { paused: true },
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
