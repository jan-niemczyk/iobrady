import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Grupy organizacyjne (organy, komisje, zespoły) - wspólne funkcje serwera. */

export const ORG_UNIT_KIND_LABEL: Record<string, string> = {
  UNCLASSIFIED: "Bez klasyfikacji",
  BODY: "Organ",
  COMMITTEE: "Komisja",
  TEAM: "Zespół",
  OTHER: "Inna grupa",
};

type Tx = Prisma.TransactionClient | typeof prisma;

/** Czy członkostwo obejmuje dzień `at` (puste granice okresu - bez ograniczenia z tej strony). */
export function memberActiveAt(m: { validFrom: Date | null; validTo: Date | null }, at: Date): boolean {
  if (m.validFrom && m.validFrom.getTime() > at.getTime()) return false;
  if (m.validTo && endOfDay(m.validTo).getTime() < at.getTime()) return false;
  return true;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Wczytuje skład grup do posiedzenia i zapisuje powiązanie posiedzenie-grupa.
 * - osoba należąca do kilku grup trafia do posiedzenia raz (deduplikacja po userId),
 * - prawo głosu nowej osoby: z jej członkostwa (domyślne prawo głosu); przy kilku grupach -
 *   prawo głosu, jeśli ma je domyślnie w którejkolwiek z nich,
 * - osoby już przypisane do posiedzenia zostają bez zmian (nie nadpisujemy ustalonych praw,
 *   gość nie dostaje prawa głosu przez połączenie składów),
 * - uwzględniane są wyłącznie członkostwa obejmujące termin posiedzenia.
 */
export async function applyOrgUnitsToMeeting(tx: Tx, meetingId: string, orgUnitIds: string[], at: Date) {
  const unique = [...new Set(orgUnitIds)];
  if (unique.length === 0) return { added: 0, skipped: 0, linked: 0 };
  const units = await tx.orgUnit.findMany({ where: { id: { in: unique } }, include: { members: { include: { user: { select: { active: true } } } } } });
  const existing = new Set((await tx.meetingParticipant.findMany({ where: { meetingId }, select: { userId: true } })).map((p) => p.userId));

  const voting = new Map<string, boolean>();
  for (const u of units) {
    for (const m of u.members) {
      if (!m.user.active || !memberActiveAt(m, at)) continue;
      voting.set(m.userId, (voting.get(m.userId) ?? false) || m.defaultVotingRight);
    }
  }
  const toAdd = [...voting.entries()].filter(([userId]) => !existing.has(userId));
  if (toAdd.length) {
    await tx.meetingParticipant.createMany({
      data: toAdd.map(([userId, hasVotingRight]) => ({ meetingId, userId, hasVotingRight })),
      skipDuplicates: true,
    });
  }
  let linked = 0;
  for (const u of units) {
    const r = await tx.meetingOrgUnit.createMany({ data: [{ meetingId, orgUnitId: u.id }], skipDuplicates: true });
    linked += r.count;
  }
  return { added: toAdd.length, skipped: voting.size - toAdd.length, linked };
}

/**
 * Różnice między bieżącym składem grup a składem posiedzenia (świadoma aktualizacja przyszłych
 * posiedzeń). Nie zmienia danych.
 */
export async function orgUnitDiff(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      scheduledAt: true, status: true,
      orgUnits: { select: { orgUnit: { select: { id: true, name: true, members: { include: { user: { select: { id: true, firstName: true, lastName: true, active: true } } } } } } } },
      participants: { select: { id: true, userId: true, hasVotingRight: true, isInvitedGuest: true, user: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!meeting) return null;
  const inGroups = new Map<string, { userId: string; name: string; units: string[]; votingRight: boolean }>();
  for (const { orgUnit } of meeting.orgUnits) {
    for (const m of orgUnit.members) {
      if (!m.user.active || !memberActiveAt(m, meeting.scheduledAt)) continue;
      const cur = inGroups.get(m.userId) ?? { userId: m.userId, name: `${m.user.lastName} ${m.user.firstName}`, units: [], votingRight: false };
      cur.units.push(orgUnit.name);
      cur.votingRight = cur.votingRight || m.defaultVotingRight;
      inGroups.set(m.userId, cur);
    }
  }
  const assigned = new Set(meeting.participants.map((p) => p.userId));
  const missing = [...inGroups.values()].filter((g) => !assigned.has(g.userId));
  const extra = meeting.participants
    .filter((p) => !inGroups.has(p.userId) && !p.isInvitedGuest)
    .map((p) => ({ participantId: p.id, userId: p.userId, name: `${p.user.lastName} ${p.user.firstName}` }));
  return { status: meeting.status, units: meeting.orgUnits.map((o) => ({ id: o.orgUnit.id, name: o.orgUnit.name })), missing, extra };
}
