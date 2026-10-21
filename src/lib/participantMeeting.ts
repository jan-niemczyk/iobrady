import { prisma } from "@/lib/db";

/**
 * Dane strony posiedzenia dla radnego (/session/upcoming/[id], /session/archive/[id]).
 * Wyłącznie materiały widoczne dla uczestników, zakończone głosowania (wyniki) i informacja
 * o trwającym głosowaniu. Notatki prywatne pobiera osobno sama osoba (API notatki).
 */
export async function loadParticipantMeeting(userId: string, meetingId: string) {
  const mp = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    include: { attendance: { select: { status: true } } },
  });
  if (!mp) return null;
  const [meeting, settings] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        agenda: { orderBy: { order: "asc" }, where: { hiddenFromDisplay: false } },
        attachments: { where: { visibleToParticipants: true }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, sizeBytes: true, mimeType: true, agendaItemId: true } },
        votes: { where: { status: { in: ["CLOSED", "OPEN"] } }, orderBy: [{ number: "asc" }, { openedAt: "asc" }], select: { id: true, number: true, title: true, type: true, status: true, visibility: true, agendaItemId: true, closedAt: true, resultPassed: true, contextLabel: true } },
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" }, select: { organizationName: true } }),
  ]);
  if (!meeting) return null;
  const live = meeting.status === "OPEN" || meeting.status === "IN_PROGRESS" || meeting.status === "PAUSED";
  const ended = meeting.status === "CLOSED" || meeting.status === "ARCHIVED";

  const decisionOf = (v: (typeof meeting.votes)[number]) => {
    if (v.status !== "CLOSED") return null;
    if (v.type === "QUORUM") return v.resultPassed == null ? null : (v.resultPassed ? "Kworum potwierdzone" : "Brak kworum");
    if (v.type === "LIST" || v.type === "PACKAGE") return null;
    return v.resultPassed == null ? null : (v.resultPassed ? "Przyjęto" : "Odrzucono");
  };
  const vote = (v: (typeof meeting.votes)[number]) => ({
    id: v.id, number: v.number, title: v.title, type: v.type, status: v.status, secret: v.visibility === "SECRET",
    time: v.closedAt?.toISOString() ?? null, decision: decisionOf(v), contextLabel: v.contextLabel,
  });
  const file = (a: (typeof meeting.attachments)[number]) => ({ id: a.id, fileName: a.fileName, sizeBytes: a.sizeBytes, mimeType: a.mimeType });

  return {
    id: meeting.id,
    organization: settings?.organizationName ?? "",
    name: meeting.name,
    number: meeting.number,
    scheduledAt: meeting.scheduledAt.toISOString(),
    location: meeting.location,
    status: meeting.status,
    live, ended,
    publicEnabled: meeting.publicEnabled,
    currentAgendaItemId: live ? meeting.currentAgendaItemId : null,
    me: {
      hasVotingRight: mp.hasVotingRight && !mp.excludedFromMeeting,
      isGuest: mp.isInvitedGuest,
      excluded: mp.excludedFromMeeting,
      attendance: mp.attendance?.status ?? null,
    },
    meetingAttachments: meeting.attachments.filter((a) => !a.agendaItemId).map(file),
    items: meeting.agenda.map((a) => ({
      id: a.id, number: a.unnumbered ? null : a.number, title: a.title, isSubItem: a.isSubItem,
      presenter: a.presenter, committee: a.committee, status: a.status, manuallyCompleted: a.manuallyCompleted,
      startedAt: a.startedAt?.toISOString() ?? null, completedAt: a.completedAt?.toISOString() ?? null,
      attachments: meeting.attachments.filter((x) => x.agendaItemId === a.id).map(file),
      votes: meeting.votes.filter((v) => v.agendaItemId === a.id).map(vote),
    })),
    looseVotes: meeting.votes.filter((v) => !v.agendaItemId || !meeting.agenda.some((a) => a.id === v.agendaItemId)).map(vote),
  };
}

export type ParticipantMeeting = NonNullable<Awaited<ReturnType<typeof loadParticipantMeeting>>>;
