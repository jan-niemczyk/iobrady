import { prisma } from "@/lib/db";

/** Dane edytora składu posiedzenia (strona uczestników posiedzenia i planer w panelu). */
export async function loadMeetingParticipantsData(meetingId: string) {
  const [meeting, allUsers, orgUnits] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        orgUnits: { select: { orgUnitId: true } },
        participants: { include: { user: { include: { group: true } } }, orderBy: { user: { lastName: "asc" } } },
        agenda: { where: { hiddenFromDisplay: false }, orderBy: { order: "asc" } },
      },
    }),
    prisma.user.findMany({
      where: { role: "PARTICIPANT", active: true },
      include: { group: true },
      orderBy: { lastName: "asc" },
    }),
    prisma.orgUnit.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { members: true } } },
    }),
  ]);
  if (!meeting) return null;
  const assignedUserIds = new Set(meeting.participants.map((p) => p.userId));
  return {
    meetingId: meeting.id,
    meetingName: meeting.name,
    meetingNumber: meeting.number,
    assigned: meeting.participants.map((p) => ({
      id: p.id, userId: p.userId,
      name: `${p.user.firstName} ${p.user.lastName}`,
      groupShort: p.user.group?.shortName ?? null,
      groupColor: p.user.group?.color ?? null,
      hasVotingRight: p.hasVotingRight,
      hasPriorityRight: p.hasPriorityRight,
      priorityAgendaItemId: p.priorityAgendaItemId,
      priorityAgendaItemIds: (p as { priorityAgendaItemIds?: string[] }).priorityAgendaItemIds ?? [],
      excludedFromMeeting: p.excludedFromMeeting,
      isInvitedGuest: p.isInvitedGuest,
      isChairperson: p.isChairperson,
      canUseMiniDisplay: (p as { canUseMiniDisplay?: boolean }).canUseMiniDisplay ?? false,
    })),
    agenda: meeting.agenda.map((a) => ({ id: a.id, number: a.number, title: a.title })),
    meetingStatus: meeting.status,
    orgUnits: orgUnits.map((t) => ({ id: t.id, name: t.name, memberCount: t._count.members, linked: meeting.orgUnits.some((o) => o.orgUnitId === t.id) })),
    available: allUsers
      .filter((u) => !assignedUserIds.has(u.id))
      .map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        groupShort: u.group?.shortName ?? null,
        groupColor: u.group?.color ?? null,
      })),
  };
}

export type MeetingParticipantsData = NonNullable<Awaited<ReturnType<typeof loadMeetingParticipantsData>>>;
