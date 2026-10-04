import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { evaluateQuorum } from "@/lib/quorum";
import { comparePl } from "@/lib/sortPl";

/**
 * Zapisuje BIEŻĄCY stan obecności jako migawkę (kind = INCREMENTAL) i domyka ją od razu.
 * Nie zeruje niczego - migawka odzwierciedla aktualny stan Attendance po korektach operatora.
 * Używane po ręcznych zmianach obecności ("Zapisz"), grupuje je w jeden wpis historii.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      quorumRule: true, quorumValue: true,
      participants: {
        where: { hasVotingRight: true, excludedFromMeeting: false },
        include: { user: { include: { group: true } }, attendance: true },
      },
    },
  });
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  const sorted = [...meeting.participants].sort((a, b) =>
    comparePl(`${a.user.lastName} ${a.user.firstName}`, `${b.user.lastName} ${b.user.firstName}`));

  const now = new Date();
  const presentCount = sorted.filter((mp) => mp.attendance?.status === "PRESENT").length;
  const eligibleCount = sorted.length;
  const q = evaluateQuorum({ quorumRule: meeting.quorumRule, quorumValue: meeting.quorumValue }, eligibleCount, presentCount);

  const check = await prisma.attendanceCheck.create({
    data: {
      meetingId: id,
      kind: "INCREMENTAL",
      status: "CLOSED",
      closedAt: now,
      presentCount, eligibleCount,
      quorumRequired: q.requiredCount, quorumMet: q.met,
      entries: {
        create: sorted.map((mp) => ({
          userId: mp.userId,
          lastName: mp.user.lastName,
          firstName: mp.user.firstName,
          clubShort: mp.user.group?.shortName ?? null,
          present: mp.attendance?.status === "PRESENT",
          markedAt: mp.attendance?.status === "PRESENT" ? (mp.attendance?.confirmedAt ?? now) : null,
        })),
      },
    },
  });

  await audit({
    action: "ATTENDANCE_CLOSED",
    description: `Zapisano stan obecności (migawka): ${presentCount}/${eligibleCount}`,
    meetingId: id, userId: session.user.id, metadata: { checkId: check.id, kind: "INCREMENTAL" },
  });

  publishToMeeting(id, { type: "attendance.updated" });
  return NextResponse.json({ ok: true, checkId: check.id });
}
