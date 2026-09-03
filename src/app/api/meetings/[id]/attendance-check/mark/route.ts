import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  userId: z.string(),
  present: z.boolean(),
});

/** Oznacza/odznacza obecność osoby w bieżącym (otwartym) sprawdzeniu. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { activeAttendanceCheckId: true, attendanceSelfCheckEnabled: true } });
  if (!meeting?.activeAttendanceCheckId)
    return new NextResponse("Brak otwartego sprawdzenia obecności", { status: 400 });

  // Uczestnik może oznaczyć tylko siebie; operator - dowolną osobę.
  if (session.user.role !== "OPERATOR" && session.user.id !== parsed.data.userId)
    return new NextResponse("Forbidden", { status: 403 });
  // Samodzielne potwierdzanie może być wyłączone przez operatora - wtedy tylko operator.
  if (session.user.role !== "OPERATOR" && !meeting.attendanceSelfCheckEnabled)
    return new NextResponse("Samodzielne potwierdzanie obecności jest wyłączone", { status: 403 });

  await prisma.attendanceCheckEntry.update({
    where: { checkId_userId: { checkId: meeting.activeAttendanceCheckId, userId: parsed.data.userId } },
    data: { present: parsed.data.present, markedAt: parsed.data.present ? new Date() : null },
  }).catch(() => {});

  publishToMeeting(id, { type: "attendance.updated" });
  return NextResponse.json({ ok: true });
}
