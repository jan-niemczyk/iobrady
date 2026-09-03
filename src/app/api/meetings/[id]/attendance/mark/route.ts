import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  participantId: z.string(),
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

  // Uczestnik sam może oznaczyć tylko obecność, i tylko gdy attendanceOpen
  if (!isOperator && (status !== "PRESENT" || !mp.meeting.attendanceOpen)) {
    return new NextResponse("Lista obecności nie jest otwarta", { status: 400 });
  }

  await prisma.attendance.upsert({
    where: { participantId: mp.id },
    create: {
      participantId: mp.id,
      status,
      source: isOperator ? "OPERATOR" : "PARTICIPANT",
      confirmedByUserId: isOperator ? session.user.id : null,
    },
    update: {
      status,
      confirmedAt: new Date(),
      source: isOperator ? "OPERATOR" : "PARTICIPANT",
      confirmedByUserId: isOperator ? session.user.id : null,
    },
  });

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
