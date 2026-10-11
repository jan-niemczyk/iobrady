import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { publishToMeeting } from "@/lib/events";
import { MEETING_STATUS_LABEL } from "@/lib/labels";
import { NextResponse } from "next/server";

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
  const openVote = await prisma.vote.count({ where: { meetingId: id, status: "OPEN" } });
  if (openVote > 0)
    return new NextResponse("Trwa głosowanie - zamknij je albo anuluj przed cofnięciem posiedzenia.", { status: 409 });
  if (m.activeAttendanceCheckId)
    return new NextResponse("Trwa sprawdzanie obecności - zakończ je przed cofnięciem posiedzenia.", { status: 409 });

  await prisma.meeting.update({
    where: { id },
    data: { status: "PREPARED", openedAt: null, closedAt: null },
  });

  await audit({
    action: "MEETING_REOPENED",
    description: `Cofnięto posiedzenie do statusu „${MEETING_STATUS_LABEL.PREPARED}” (z „${MEETING_STATUS_LABEL[m.status]}”), dane bez zmian`,
    meetingId: id,
    userId: session.user.id,
  });

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
