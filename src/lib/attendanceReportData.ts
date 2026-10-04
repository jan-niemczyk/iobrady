import { prisma } from "@/lib/db";
import type { ReportData, ReportGroup, ReportPerson } from "@/lib/reportTypes";
import { comparePl } from "@/lib/sortPl";

/**
 * Buduje dane raportu obecności na podstawie migawki (AttendanceCheck),
 * w układzie zbliżonym do raportów głosowań (kluby, lista imienna, podsuma).
 */
export async function buildAttendanceReportData(checkId: string): Promise<ReportData | null> {
  const check = await prisma.attendanceCheck.findUnique({
    where: { id: checkId },
    include: { entries: true, meeting: true },
  });
  if (!check) return null;

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const groupsEnabled = settings?.groupsEnabled === true;

  // Grupowanie po klubie (snapshot clubShort z migawki).
  const groupMap = new Map<string, ReportPerson[]>();
  for (const e of check.entries) {
    const key = groupsEnabled ? (e.clubShort ?? "niez.") : "";
    const arr = groupMap.get(key) ?? [];
    arr.push({ lastName: e.lastName, firstName: e.firstName, mark: e.present ? "ob." : "nb." });
    groupMap.set(key, arr);
  }

  const groups: ReportGroup[] = Array.from(groupMap.entries()).map(([shortName, people]) => {
    const present = people.filter((p) => p.mark === "ob.").length;
    const absent = people.length - present;
    // sortowanie: obecni najpierw, potem alfabetycznie
    people.sort((a, b) => {
      const ra = a.mark === "ob." ? 0 : 1, rb = b.mark === "ob." ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return comparePl(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`);
    });
    return { shortName, membersCount: people.length, participated: present, notVoted: 0, absent, people };
  }).sort((a, b) => b.membersCount - a.membersCount);

  const presentTotal = check.presentCount ?? check.entries.filter((e) => e.present).length;
  const eligibleTotal = check.eligibleCount ?? check.entries.length;
  const absentTotal = eligibleTotal - presentTotal;

  const summaryParts = [
    `OBECNYCH - ${presentTotal}`,
    `NIEOBECNI - ${absentTotal}`,
    `UPRAWNIONYCH - ${eligibleTotal}`,
  ];
  if (check.quorumRequired != null) summaryParts.push(`WYMAGANE KWORUM - ${check.quorumRequired}`);

  const ts = check.closedAt ?? check.startedAt;
  const timestamp = new Date(ts).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Europe/Warsaw",
  });

  const kindLabel = check.kind === "QUORUM_VOTE" ? "Głosowanie kworum" : "Potwierdzenie obecności";
  const quorumNote = check.quorumMet == null ? "" : check.quorumMet ? " - kworum jest" : " - brak kworum";

  return {
    organizationName: settings?.organizationName ?? undefined,
    meetingTitle: check.meeting.name,
    meetingNumber: check.meeting.number,
    voteNumber: "-",
    timestamp,
    contextLabel: `${kindLabel}${quorumNote}`,
    voteTitle: "Sprawdzenie obecności",
    summaryLine: summaryParts.join("   "),
    summaryParts,
    isList: false,
    isQuorum: true,
    isSecret: false,
    groups,
    groupsEnabled,
  };
}
