import { auth } from "@/lib/auth";
import { canManageMeeting } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateQuorum } from "@/lib/quorum";

const schema = z.object({
  action: z.enum(["close", "interrupt"]),
});

/**
 * Zamyka lub przerywa bieżące sprawdzenie obecności.
 * - close: zapisuje nowy stan obecności WYŁĄCZNIE z tej migawki (zeruje poprzedni).
 * - interrupt: pozostawia dotychczasowy stan (migawka oznaczona jako przerwana, nie nadpisuje obecności).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canManageMeeting(session, id)))
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { activeAttendanceCheckId: true, quorumRule: true, quorumValue: true },
  });
  if (!meeting?.activeAttendanceCheckId)
    return new NextResponse("Brak otwartego sprawdzenia obecności", { status: 400 });

  const checkId = meeting.activeAttendanceCheckId;
  const check = await prisma.attendanceCheck.findUnique({
    where: { id: checkId },
    include: { entries: true },
  });
  if (!check) return new NextResponse("Not found", { status: 404 });

  if (parsed.data.action === "interrupt") {
    await prisma.attendanceCheck.update({
      where: { id: checkId },
      data: { status: "INTERRUPTED", closedAt: new Date() },
    });
    await prisma.meeting.update({ where: { id }, data: { activeAttendanceCheckId: null, attendanceOpen: false } });
    await audit({
      action: "ATTENDANCE_CLOSED",
      description: "Przerwano sprawdzenie obecności (stan pozostawiony bez zmian)",
      meetingId: id, userId: session.user.id, metadata: { checkId },
    });
    publishToMeeting(id, { type: "attendance.updated" });
    return NextResponse.json({ ok: true, interrupted: true });
  }

  // close: zapis nowego stanu obecności z tej migawki.
  const presentCount = check.entries.filter((e) => e.present).length;
  const eligibleCount = check.entries.length;
  const q = evaluateQuorum({ quorumRule: meeting.quorumRule, quorumValue: meeting.quorumValue }, eligibleCount, presentCount);

  await prisma.$transaction(async (tx) => {
    // Nadpisz bieżącą obecność (Attendance) wg migawki - zerowanie i zapis od zera.
    const participants = await tx.meetingParticipant.findMany({ where: { meetingId: id } });
    const presentByUser = new Map(check.entries.map((e) => [e.userId, e.present]));
    for (const mp of participants) {
      const present = presentByUser.get(mp.userId) ?? false;
      await tx.attendance.upsert({
        where: { participantId: mp.id },
        create: { participantId: mp.id, status: present ? "PRESENT" : "ABSENT", source: "OPERATOR", confirmedByUserId: session.user.id },
        update: { status: present ? "PRESENT" : "ABSENT", confirmedAt: new Date(), source: "OPERATOR", confirmedByUserId: session.user.id },
      });
    }

    await tx.attendanceCheck.update({
      where: { id: checkId },
      data: { status: "CLOSED", closedAt: new Date(), presentCount, eligibleCount, quorumRequired: q.requiredCount, quorumMet: q.met },
    });
    await tx.meeting.update({ where: { id }, data: { activeAttendanceCheckId: null, attendanceOpen: false } });
  });

  await audit({
    action: "ATTENDANCE_CLOSED",
    description: `Zamknięto sprawdzenie obecności: ${presentCount}/${eligibleCount}${q.met ? " (kworum jest)" : " (brak kworum)"}`,
    meetingId: id, userId: session.user.id,
    metadata: { checkId, presentCount, eligibleCount, quorumMet: q.met },
  });

  publishToMeeting(id, { type: "attendance.updated" });
  return NextResponse.json({ ok: true, presentCount, eligibleCount, quorumMet: q.met });
}
