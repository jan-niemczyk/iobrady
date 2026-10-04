import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { comparePl } from "@/lib/sortPl";
import { formatPlDate } from "@/lib/meetingName";

// GET /api/meetings/[id]/attendance-report?check=xxx → dane raportu jednego sprawdzenia obecności
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  let checkId = url.searchParams.get("check");

  if (!checkId) {
    const last = await prisma.attendanceCheck.findFirst({
      where: { meetingId: id, status: "CLOSED" },
      orderBy: { closedAt: "desc" },
      select: { id: true },
    });
    if (!last) return NextResponse.json({ report: null });
    checkId = last.id;
  }

  const [check, meeting, settings] = await Promise.all([
    prisma.attendanceCheck.findUnique({ where: { id: checkId }, include: { entries: true } }),
    prisma.meeting.findUnique({ where: { id }, select: { name: true, number: true, scheduledAt: true } }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!check || !meeting) return new NextResponse("Not found", { status: 404 });

  const groupsEnabled = settings?.groupsEnabled === true;
  const kindLabel = check.kind === "QUORUM_VOTE" ? "Głosowanie kworum" : check.kind === "INCREMENTAL" ? "Korekta obecności" : "Sprawdzenie obecności";
  const present = check.entries.filter((e) => e.present)
    .map((e) => ({ lastName: e.lastName, firstName: e.firstName, groupShort: groupsEnabled ? e.clubShort : null, markedAt: e.markedAt }))
    .sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));
  const absent = check.entries.filter((e) => !e.present)
    .map((e) => ({ lastName: e.lastName, firstName: e.firstName, groupShort: groupsEnabled ? e.clubShort : null }))
    .sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  const when = check.closedAt ?? check.startedAt;
  return NextResponse.json({
    report: {
      organization: settings?.organizationName ?? "",
      meetingName: meeting.name,
      meetingNumber: meeting.number,
      dateText: formatPlDate(meeting.scheduledAt) ?? "",
      kindLabel,
      timeText: new Date(when).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      presentCount: present.length,
      absentCount: absent.length,
      eligibleCount: check.entries.length,
      groupsEnabled,
      present,
      absent: absent.map((a) => ({ lastName: a.lastName, firstName: a.firstName, groupShort: a.groupShort })),
    },
  });
}
