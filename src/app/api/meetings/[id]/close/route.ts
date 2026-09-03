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

  // Blokada: nie można zakończyć posiedzenia, gdy trwa głosowanie (jest otwarte).
  const openVote = await prisma.vote.findFirst({ where: { meetingId: id, status: "OPEN" }, select: { id: true } });
  if (openVote) {
    return new NextResponse("Nie można zakończyć posiedzenia w trakcie trwającego głosowania. Najpierw zamknij głosowanie.", { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    // Zakończ aktualnie otwarte (bieżące) punkty porządku obrad.
    await tx.agendaItem.updateMany({ where: { meetingId: id, status: "CURRENT" }, data: { status: "COMPLETED" } });
    await tx.meeting.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date(), currentAgendaItemId: null },
    });
  });

  await audit({
    action: "MEETING_CLOSED",
    description: `Zamknięto posiedzenie ${meeting.number}`,
    meetingId: id,
    userId: session.user.id,
  });

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
