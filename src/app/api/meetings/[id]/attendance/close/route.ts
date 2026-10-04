import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  // Zamknięcie listy obecności chowa ją z ekranu - wracamy do trybu automatycznego.
  const m = await prisma.meeting.update({
    where: { id },
    data: { attendanceOpen: false, displayMode: "AUTO", displayUpdatedAt: new Date() },
  });
  await audit({ action: "ATTENDANCE_CLOSED", description: `Zamknięto listę obecności (${m.number})`, meetingId: id, userId: session.user.id });
  publishToMeeting(id, { type: "attendance.updated" });
  publishToMeeting(id, { type: "display.changed" });
  return NextResponse.json({ ok: true });
}
