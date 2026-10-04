import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { MeetingStatus } from "@prisma/client";
import { ParticipantSessionClient } from "@/components/participant/ParticipantSessionClient";
import { SessionAutoRefresh } from "@/components/participant/SessionAutoRefresh";
import { formatDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ParticipantSession({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = session.user.id;
  const sp = await searchParams;

  // Wszystkie otwarte posiedzenia, w których radny uczestniczy (widoczne w przełączniku).
  const openParticipations = await prisma.meetingParticipant.findMany({
    where: {
      userId,
      excludedFromMeeting: false,
      meeting: { status: { in: [MeetingStatus.OPEN, MeetingStatus.IN_PROGRESS, MeetingStatus.PAUSED] } },
    },
    include: {
      meeting: { include: { currentAgendaItem: true } },
      attendance: true,
    },
    orderBy: { meeting: { scheduledAt: "asc" } },
  });

  // Wybrane posiedzenie: z parametru ?m= (jeśli należy do listy) albo pierwsze otwarte.
  const active = (sp.m ? openParticipations.find((p) => p.meetingId === sp.m) : null) ?? openParticipations[0] ?? null;

  // Lista otwartych do przełącznika (naraz widoczne jedno).
  const openMeetings = openParticipations.map((p) => ({
    meetingId: p.meetingId,
    name: p.meeting.name,
    number: p.meeting.number,
    hasVotingRight: p.hasVotingRight,
  }));

  // Lista nadchodzących, jeśli nie ma aktywnego
  const upcoming = !active
    ? await prisma.meetingParticipant.findMany({
        where: { userId, meeting: { status: { in: [MeetingStatus.PREPARED] } } },
        include: { meeting: true },
        orderBy: { meeting: { scheduledAt: "asc" } },
      })
    : [];

  if (!active) {
    return (
      <div className="pt-page">
        <SessionAutoRefresh hasMeeting={false} />
        <header className="pt-page-header">
          <div className="pt-kicker">Sesja uczestnika</div>
          <h1 className="pt-h1">Brak aktywnych posiedzeń</h1>
          <p className="pt-text-sm" style={{ margin: "4px 0 0", color: "var(--color-ink-2)" }}>
            Gdy operator otworzy zaplanowane posiedzenie, ten ekran odświeży się automatycznie.
          </p>
        </header>

        <div className="pt-btn-group">
          <a href="/account" className="pt-btn pt-btn-sm">Zmień hasło</a>
          <a href="/api/auth/signout" className="pt-btn pt-btn-sm">Wyloguj</a>
        </div>

        {upcoming.length > 0 && (
          <section className="pt-panel">
            <div className="pt-panel-head">
              <h2 className="pt-panel-title">Nadchodzące posiedzenia</h2>
            </div>
            <ul className="pt-list">
              {upcoming.map((mp) => (
                <li key={mp.id}>
                  <div className="pt-grow">
                    <div style={{ fontWeight: 500 }}>{mp.meeting.name}</div>
                    <div className="pt-label">
                      Nr {mp.meeting.number} - {formatDateTime(mp.meeting.scheduledAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const initial = {
    participantId: active.id,
    meetingId: active.meetingId,
    allowFormalMotions: active.meeting.allowFormalMotionsAnytime,
    meetingName: active.meeting.name,
    meetingNumber: active.meeting.number,
    userName: `${session.user.firstName} ${session.user.lastName}`,
    userId: session.user.id,
    hasVotingRight: active.hasVotingRight,
    isChairperson: active.isChairperson,
    canUseMiniDisplay: active.canUseMiniDisplay,
    excludedFromMeeting: active.excludedFromMeeting,
    isInvitedGuest: active.isInvitedGuest,
    attendance: active.attendance?.status ?? null,
    attendanceOpen: active.meeting.attendanceOpen,
    currentAgendaItem: active.meeting.currentAgendaItem
      ? {
          number: active.meeting.currentAgendaItem.number,
          title: active.meeting.currentAgendaItem.title,
        }
      : null,
    openMeetings,
  };

  return <ParticipantSessionClient initial={initial} />;
}
