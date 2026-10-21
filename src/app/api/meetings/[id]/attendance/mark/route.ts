import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyAttendance } from "@/lib/attendanceEvents";

const schema = z.object({
  participantId: z.string().max(64),
  status: z.enum(["PRESENT", "ABSENT"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const { participantId, status } = parsed.data;

  // Sprawdź czy operator albo uczestnik oznacza siebie
  const mp = await prisma.meetingParticipant.findUnique({ where: { id: participantId }, include: { meeting: true } });
  if (!mp || mp.meetingId !== id) return new NextResponse("Not found", { status: 404 });

  const isOperator = session.user.role === "OPERATOR";
  const isSelf = mp.userId === session.user.id;
  if (!isOperator && !isSelf) return new NextResponse("Forbidden", { status: 403 });

  // Uczestnik sam może oznaczyć tylko własną obecność: w trybie samodzielnego potwierdzania (IA-03),
  // przy otwartej liście i gdy nie jest wykluczony. W trybie MANUAL obecność ustala wyłącznie operator.
  if (!isOperator) {
    if (mp.meeting.attendanceMode !== "SELF_CONFIRMATION")
      return new NextResponse("Obecność w tym posiedzeniu potwierdza operator.", { status: 403 });
    if (status !== "PRESENT" || !mp.meeting.attendanceOpen)
      return new NextResponse("Lista obecności nie jest otwarta", { status: 400 });
    if (mp.excludedFromMeeting)
      return new NextResponse("Uczestnik został wykluczony z posiedzenia", { status: 403 });
  }

  await prisma.$transaction((tx) => applyAttendance(tx, {
    meetingId: id, participantId: mp.id, userId: mp.userId, present: status === "PRESENT",
    source: isOperator ? "OPERATOR" : "SELF", byUserId: session.user.id,
  }));

  await audit({
    action: "ATTENDANCE_MARKED",
    description: `Oznaczono ${status === "PRESENT" ? "obecność" : "nieobecność"} dla uczestnika ${mp.userId}`,
    meetingId: id,
    userId: session.user.id,
    metadata: { participantId: mp.id, status, source: isOperator ? "OPERATOR" : "PARTICIPANT" },
  });

  publishToMeeting(id, { type: "attendance.updated" });
  return NextResponse.json({ ok: true });
}
