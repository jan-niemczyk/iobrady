import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { publishToMeeting } from "@/lib/events";
import { MEETING_STATUS_LABEL } from "@/lib/labels";
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/booth";
import { lockMeetingRow } from "@/lib/meetingLock";

// Cofnięcie posiedzenia do statusu pierwotnego („przygotowane”, przed otwarciem).
// Zmienia wyłącznie status - głosowania, obecność, listy mówców i pozostałe dane zostają.
const REVERTIBLE = ["OPEN", "IN_PROGRESS", "PAUSED", "CLOSED"] as const;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const m = await prisma.meeting.findUnique({ where: { id }, select: { status: true, activeAttendanceCheckId: true } });
  if (!m) return new NextResponse("Not found", { status: 404 });
  if (!(REVERTIBLE as readonly string[]).includes(m.status))
    return new NextResponse("Posiedzenie jest już w statusie pierwotnym albo nie można go cofnąć.", { status: 400 });
  // H-01: pod blokadą wiersza posiedzenia (jak otwieranie głosowań) - nie cofamy posiedzenia,
  // w którym równolegle otwarto głosowanie albo sprawdzanie obecności.
  try {
    await prisma.$transaction(async (tx) => {
      await lockMeetingRow(tx, id);
      const cur = await tx.meeting.findUnique({ where: { id }, select: { status: true, activeAttendanceCheckId: true } });
      if (!cur || !(REVERTIBLE as readonly string[]).includes(cur.status))
        throw new HttpError(400, "Posiedzenie jest już w statusie pierwotnym albo nie można go cofnąć.");
      if (await tx.vote.count({ where: { meetingId: id, status: "OPEN" } }))
        throw new HttpError(409, "Trwa głosowanie - zamknij je albo anuluj przed cofnięciem posiedzenia.");
      if (cur.activeAttendanceCheckId)
        throw new HttpError(409, "Trwa sprawdzanie obecności - zakończ je przed cofnięciem posiedzenia.");
      await tx.meeting.update({ where: { id }, data: { status: "PREPARED", openedAt: null, closedAt: null } });
    });
  } catch (e) {
    if (e instanceof HttpError) return new NextResponse(e.message, { status: e.status });
    throw e;
  }

  await audit({
    action: "MEETING_REOPENED",
    description: `Cofnięto posiedzenie do statusu „${MEETING_STATUS_LABEL.PREPARED}” (z „${MEETING_STATUS_LABEL[m.status]}”), dane bez zmian`,
    meetingId: id,
    userId: session.user.id,
  });

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
