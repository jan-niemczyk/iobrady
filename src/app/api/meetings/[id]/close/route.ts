import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { lockMeetingRow, VOTING_MEETING_STATUSES } from "@/lib/meetingLock";
import { revokeUserSessions } from "@/lib/sessions";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  // Blokada: nie można zakończyć posiedzenia, gdy trwa głosowanie. Sprawdzenie i zmiana statusu
  // pod blokadą wiersza posiedzenia - równoległe otwarcie głosowania czeka albo widzi CLOSED.
  const blocked = await prisma.$transaction(async (tx) => {
    await lockMeetingRow(tx, id);
    const openVote = await tx.vote.findFirst({ where: { meetingId: id, status: "OPEN" }, select: { id: true } });
    if (openVote) return true;
    // Zakończ aktualnie otwarte (bieżące) punkty porządku obrad.
    await tx.agendaItem.updateMany({ where: { meetingId: id, status: "CURRENT" }, data: { status: "COMPLETED" } });
    await tx.meeting.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date(), currentAgendaItemId: null },
    });
    return false;
  });
  if (blocked) {
    return new NextResponse("Nie można zakończyć posiedzenia w trakcie trwającego głosowania. Najpierw zamknij głosowanie.", { status: 409 });
  }

  await audit({
    action: "MEETING_CLOSED",
    description: `Zamknięto posiedzenie ${meeting.number}`,
    meetingId: id,
    userId: session.user.id,
  });

  // Opcjonalnie (Ustawienia): wylogowanie radnych tego posiedzenia - z wyjątkiem osób, które
  // uczestniczą w innym trwającym posiedzeniu (ich sesja zostaje).
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { logoutParticipantsOnMeetingClose: true } });
  let loggedOut = 0;
  if (settings?.logoutParticipantsOnMeetingClose) {
    const parts = await prisma.meetingParticipant.findMany({
      where: { meetingId: id, user: { role: "PARTICIPANT" } },
      select: { userId: true },
    });
    for (const p of parts) {
      const elsewhere = await prisma.meetingParticipant.count({
        where: { userId: p.userId, meetingId: { not: id }, meeting: { status: { in: [...VOTING_MEETING_STATUSES] } } },
      });
      if (elsewhere === 0) loggedOut += await revokeUserSessions(p.userId, "meeting_closed");
    }
    if (loggedOut > 0) {
      await audit({
        action: "SESSION_REVOKED",
        description: `Wylogowano radnych po zamknięciu posiedzenia ${meeting.number} (sesji: ${loggedOut})`,
        meetingId: id, userId: session.user.id,
        metadata: { sessionsRevoked: loggedOut },
      });
    }
  }

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true, loggedOut });
}
