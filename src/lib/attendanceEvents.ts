import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient | typeof prisma;

/** Źródło zdarzenia obecności (historia do raportów). */
export type AttendanceEventSource = "SELF" | "OPERATOR" | "CHECK" | "QUORUM" | "CORRECTION";

/**
 * Ustawia bieżącą obecność formalną uczestnika (Attendance) i dopisuje zdarzenie do historii
 * (AttendanceEvent), jeśli stan się zmienił albo był nieustalony. Zdarzenie ma faktyczny moment
 * czynności (np. moment potwierdzenia w sprawdzeniu), źródło i osobę, która je wprowadziła.
 * Stan połączenia technicznego nie jest tu zapisywany - to nie jest obecność formalna.
 */
export async function applyAttendance(tx: Tx, p: {
  meetingId: string;
  participantId: string;
  userId: string;
  present: boolean;
  source: AttendanceEventSource;
  byUserId?: string | null;
  at?: Date;
  reason?: string | null;
}): Promise<boolean> {
  const at = p.at ?? new Date();
  const cur = await tx.attendance.findUnique({ where: { participantId: p.participantId }, select: { status: true } });
  const status = p.present ? "PRESENT" : "ABSENT";
  const attSource = p.source === "SELF" ? "PARTICIPANT" : "OPERATOR";
  await tx.attendance.upsert({
    where: { participantId: p.participantId },
    create: { participantId: p.participantId, status, source: attSource, confirmedAt: at, confirmedByUserId: p.source === "SELF" ? null : (p.byUserId ?? null) },
    update: { status, confirmedAt: at, source: attSource, confirmedByUserId: p.source === "SELF" ? null : (p.byUserId ?? null) },
  });
  if (cur?.status === status) return false;
  await tx.attendanceEvent.create({
    data: { meetingId: p.meetingId, userId: p.userId, present: p.present, at, source: p.source, recordedById: p.byUserId ?? null, reason: p.reason ?? null },
  });
  return true;
}
