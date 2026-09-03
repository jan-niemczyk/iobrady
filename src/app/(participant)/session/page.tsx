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
      <div className="px-6 py-16 max-w-[640px] mx-auto">
        <SessionAutoRefresh hasMeeting={false} />
        <div className="eyebrow mb-3">Sesja uczestnika</div>
        <h1 style={{ fontSize: 32, lineHeight: 1.1, marginBottom: 8 }}>
          Brak aktywnych posiedzeń.
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--color-ink-2)" }}>
          Gdy operator otworzy zaplanowane posiedzenie, ten ekran odświeży się automatycznie.
        </p>

        <div className="mb-8 flex items-center gap-2">
          <a href="/account" className="btn" style={{ padding: "6px 14px", fontSize: 13 }}>Zmień hasło</a>
          <a href="/api/auth/signout" className="btn" style={{ padding: "6px 14px", fontSize: 13 }}>Wyloguj</a>
        </div>

        {upcoming.length > 0 && (
          <section className="card">
            <div className="px-5 py-3 border-b border-[var(--color-rule)]">
              <h2 className="eyebrow">Nadchodzące posiedzenia</h2>
            </div>
            <ul className="divide-y divide-[var(--color-rule-soft)]">
              {upcoming.map((mp) => (
                <li key={mp.id} className="px-5 py-3">
                  <div className="font-medium">{mp.meeting.name}</div>
                  <div className="text-xs mt-1 mono" style={{ color: "var(--color-ink-3)" }}>
                    Nr {mp.meeting.number} - {formatDateTime(mp.meeting.scheduledAt)}
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
