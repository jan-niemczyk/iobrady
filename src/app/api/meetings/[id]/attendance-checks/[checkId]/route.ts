import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

// DELETE /api/meetings/[id]/attendance-checks/[checkId] - usuń migawkę obecności.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; checkId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });

  const { id, checkId } = await ctx.params;
  const check = await prisma.attendanceCheck.findUnique({ where: { id: checkId } });
  if (!check || check.meetingId !== id) return new NextResponse("Not found", { status: 404 });

  // Nie pozwalamy usuwać otwartej migawki (najpierw zamknij/przerwij).
  if (check.status === "OPEN") return new NextResponse("Nie można usunąć otwartego sprawdzenia. Najpierw je zamknij lub przerwij.", { status: 400 });

  await prisma.attendanceCheckEntry.deleteMany({ where: { checkId } });
  await prisma.attendanceCheck.delete({ where: { id: checkId } });

  await audit({
    action: "ATTENDANCE_REVOKED",
    description: `Usunięto migawkę obecności z ${check.closedAt ? new Date(check.closedAt).toLocaleString("pl-PL") : "-"}`,
    meetingId: id,
    userId: session.user.id,
    metadata: { checkId },
  });

  return NextResponse.json({ ok: true });
}
