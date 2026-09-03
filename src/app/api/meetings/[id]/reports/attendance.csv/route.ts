import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";
import { ATTENDANCE_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { NextResponse } from "next/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      participants: {
        include: { user: { include: { group: true } }, attendance: true },
        orderBy: { user: { lastName: "asc" } },
      },
    },
  });
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  const rows: (string | number | null | undefined | boolean)[][] = [
    ["Posiedzenie", meeting.number, meeting.name],
    ["Termin", formatDateTime(meeting.scheduledAt)],
    [],
    ["Lp.", "Nazwisko", "Imię", "E-mail", "Klub/Koło", "Prawo głosu", "Gość", "Obecność", "Czas potwierdzenia", "Źródło"],
  ];

  meeting.participants.forEach((p, i) => {
    rows.push([
      i + 1,
      p.user.lastName,
      p.user.firstName,
      p.user.email,
      p.user.group?.name ?? "",
      p.hasVotingRight,
      p.isInvitedGuest,
      p.attendance ? ATTENDANCE_STATUS_LABEL[p.attendance.status] : "-",
      p.attendance ? formatDateTime(p.attendance.confirmedAt) : "",
      p.attendance?.source ?? "",
    ]);
  });

  return csvResponse(`obecnosc_${meeting.number.replace(/[/\\]/g, "-")}.csv`, toCsv(rows));
}
