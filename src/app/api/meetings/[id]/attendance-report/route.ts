import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { meetingAttendance } from "@/lib/attendanceReport";

/** Lista obecności posiedzenia z historią (operator - także usprawiedliwienia i uwagi). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const r = await meetingAttendance(id, { withNotes: true });
  if (!r) return new NextResponse("Nie znaleziono posiedzenia", { status: 404 });
  return NextResponse.json(r);
}
