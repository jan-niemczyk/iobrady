import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { comparePl } from "@/lib/sortPl";

/**
 * Dane do:
 *  - technicznego raportu obecności (dziennik migawek: kto/kiedy/co),
 *  - scalonej listy obecności (bieżący stan: kto był / kogo nie było).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const [meeting, settings, checks] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id },
      include: {
        participants: {
          where: { hasVotingRight: true, excludedFromMeeting: false },
          include: { user: { include: { group: true } }, attendance: true },
        },
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.attendanceCheck.findMany({
      where: { meetingId: id },
      orderBy: { startedAt: "asc" },
      include: { entries: true },
    }),
  ]);
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  const groupsEnabled = settings?.groupsEnabled === true;
  const dateText = new Date(meeting.scheduledAt).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

  // B2: scalona lista - bieżący stan obecności (kto jest obecny / nieobecny).
  const mergedList = meeting.participants
    .map((p) => ({
      lastName: p.user.lastName,
      firstName: p.user.firstName,
      groupShort: groupsEnabled ? (p.user.group?.shortName ?? null) : null,
      present: p.attendance?.status === "PRESENT",
    }))
    .sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  const kindLabel = (k: string) =>
    k === "QUORUM_VOTE" ? "Głosowanie kworum" : k === "INCREMENTAL" ? "Korekta obecności" : "Sprawdzenie obecności";

  // Kolumny = kolejne sprawdzenia (migawki). Wiersze = radni. Komórka: obecny/nieobecny.
  const columns = checks.map((c) => {
    const ts = c.closedAt ?? c.startedAt;
    return {
      id: c.id,
      kind: kindLabel(c.kind),
      time: new Date(ts).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }),
      presentCount: c.presentCount ?? c.entries.filter((e) => e.present).length,
      eligibleCount: c.eligibleCount ?? c.entries.length,
    };
  });

  // Zbiór wszystkich osób (po userId) z ostatnią znaną tożsamością.
  const peopleMap = new Map<string, { lastName: string; firstName: string; clubShort: string | null }>();
  for (const c of checks) for (const e of c.entries) {
    if (e.userId) peopleMap.set(e.userId, { lastName: e.lastName, firstName: e.firstName, clubShort: e.clubShort });
  }
  const presenceByCheck = new Map<string, Map<string, boolean>>();
  for (const c of checks) {
    const m = new Map<string, boolean>();
    for (const e of c.entries) if (e.userId) m.set(e.userId, e.present);
    presenceByCheck.set(c.id, m);
  }
  const matrix = Array.from(peopleMap.entries())
    .map(([userId, info]) => ({
      lastName: info.lastName,
      firstName: info.firstName,
      groupShort: groupsEnabled ? info.clubShort : null,
      cells: checks.map((c) => presenceByCheck.get(c.id)?.get(userId) ?? null),
    }))
    .sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  return NextResponse.json({
    organization: settings?.organizationName ?? "",
    meetingName: meeting.name,
    meetingNumber: meeting.number,
    dateText,
    groupsEnabled,
    mergedList,
    columns,
    matrix,
  });
}
