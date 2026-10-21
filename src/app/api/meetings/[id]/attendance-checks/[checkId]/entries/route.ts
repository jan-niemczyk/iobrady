import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { NextResponse } from "next/server";
import { applyAttendance } from "@/lib/attendanceEvents";

const schema = z.object({
  entries: z.array(z.object({ userId: z.string().max(64), present: z.boolean() })).min(1).max(5000),
  // Gdy true, po zapisie nadpisujemy też bieżący stan obecności (Attendance) tą migawką.
  applyToCurrent: z.boolean().optional(),
});

// PATCH /api/meetings/[id]/attendance-checks/[checkId]/entries
// Edycja historycznej migawki: kto był obecny "w danej godzinie".
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; checkId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });

  const { id, checkId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Nieprawidłowe dane", { status: 400 });

  const check = await prisma.attendanceCheck.findUnique({
    where: { id: checkId },
    include: { entries: true },
  });
  if (!check || check.meetingId !== id) return new NextResponse("Not found", { status: 404 });

  const presentByUser = new Map(parsed.data.entries.map((e) => [e.userId, e.present]));

  // Zaktualizuj wpisy migawki.
  await prisma.$transaction(
    check.entries
      .filter((e) => e.userId && presentByUser.has(e.userId))
      .map((e) =>
        prisma.attendanceCheckEntry.update({
          where: { id: e.id },
          data: { present: presentByUser.get(e.userId!)!, markedAt: presentByUser.get(e.userId!) ? new Date() : null },
        }),
      ),
  );

  // Przelicz podsumowanie migawki.
  const updated = await prisma.attendanceCheckEntry.findMany({ where: { checkId } });
  const presentCount = updated.filter((e) => e.present).length;
  await prisma.attendanceCheck.update({
    where: { id: checkId },
    data: { presentCount, eligibleCount: updated.length },
  });

  // Opcjonalnie: nadpisz bieżący stan obecności tą migawką.
  if (parsed.data.applyToCurrent) {
    const parts = await prisma.meetingParticipant.findMany({ where: { meetingId: id } });
    const byUser = new Map(parts.map((mp) => [mp.userId, mp.id]));
    await prisma.$transaction(async (tx) => {
      for (const e of updated.filter((x) => x.userId && byUser.has(x.userId))) {
        await applyAttendance(tx, { meetingId: id, participantId: byUser.get(e.userId!)!, userId: e.userId!, present: e.present, source: "OPERATOR", byUserId: session.user.id, reason: "Zastosowano poprawioną migawkę obecności" });
      }
    });
  }

  await audit({
    action: "ATTENDANCE_MARKED",
    description: `Edytowano migawkę obecności (obecnych: ${presentCount}/${updated.length})`,
    meetingId: id, userId: session.user.id,
    metadata: { checkId, applyToCurrent: !!parsed.data.applyToCurrent },
  });

  return NextResponse.json({ ok: true, presentCount, eligibleCount: updated.length });
}
