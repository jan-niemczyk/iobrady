import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { MeetingProtocolView } from "@/components/operator/MeetingProtocolView";
import { evaluateQuorum } from "@/lib/quorum";

export const dynamic = "force-dynamic";

export default async function MeetingProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [meeting, settings] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id },
      include: {
        agenda: { orderBy: { order: "asc" } },
        participants: {
          include: { user: { include: { group: true } }, attendance: true },
          orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
        },
        votes: {
          include: { agendaItem: true, options: { orderBy: { order: "asc" } } },
          orderBy: { openedAt: "asc" },
        },
        speakerLists: {
          include: {
            agendaItem: true,
            entries: { include: { user: true }, orderBy: { order: "asc" } },
          },
        },
        messages: { where: { hiddenAt: null }, orderBy: { publishedAt: "asc" } },
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!meeting) notFound();

  const eligible = meeting.participants.filter((p) => p.hasVotingRight);
  const presentEligible = eligible.filter((p) => p.attendance?.status === "PRESENT");
  const quorum = evaluateQuorum(meeting, eligible.length, presentEligible.length);

  return (
    <MeetingProtocolView
      organizationName={settings?.organizationName ?? "Organizacja"}
      meeting={{
        id: meeting.id,
        number: meeting.number,
        name: meeting.name,
        description: meeting.description,
        meetingType: meeting.meetingType,
        scheduledAt: meeting.scheduledAt.toISOString(),
        openedAt: meeting.openedAt?.toISOString() ?? null,
        closedAt: meeting.closedAt?.toISOString() ?? null,
        status: meeting.status,
      }}
      quorum={quorum}
      participants={meeting.participants.map((p) => ({
        id: p.id,
        lastName: p.user.lastName,
        firstName: p.user.firstName,
        groupShort: p.user.group?.shortName ?? p.user.group?.name ?? null,
        hasVotingRight: p.hasVotingRight,
        isInvitedGuest: p.isInvitedGuest,
        attendance: p.attendance?.status ?? null,
      }))}
      agenda={meeting.agenda.map((a) => ({
        id: a.id, order: a.order, number: a.number, title: a.title,
        description: a.description, presenter: a.presenter, status: a.status,
        startedAt: a.startedAt?.toISOString() ?? null,
        completedAt: a.completedAt?.toISOString() ?? null,
      }))}
      votes={meeting.votes.map((v) => ({
        id: v.id, title: v.title, type: v.type, visibility: v.visibility,
        agendaItemNumber: v.agendaItem?.number ?? null,
        majority: v.majority, majorityKind: v.majorityKind, majorityBase: v.majorityBase, status: v.status,
        openedAt: v.openedAt?.toISOString() ?? null,
        closedAt: v.closedAt?.toISOString() ?? null,
        resultPassed: v.resultPassed,
        resultYes: v.resultYes, resultNo: v.resultNo, resultAbstain: v.resultAbstain,
        resultCastCount: v.resultCastCount,
        resultEligibleCount: v.resultEligibleCount,
        options: v.options.map((o) => ({ label: o.label, resultCount: o.resultCount })),
      }))}
      speakerLists={meeting.speakerLists.map((sl) => ({
        id: sl.id,
        agendaItemNumber: sl.agendaItem?.number ?? null,
        agendaItemTitle: sl.agendaItem?.title ?? null,
        entries: sl.entries.map((e) => ({
          name: e.speakerName ?? (e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"),
          groupShort: e.speakerClubShort ?? null,
          entryType: e.entryType,
          status: e.status,
          consumedSec: e.consumedSec,
          timeLimitSec: e.timeLimitSec,
        })),
      }))}
      messages={meeting.messages.map((m) => ({
        id: m.id,
        content: m.content,
        publishedAt: m.publishedAt.toISOString(),
      }))}
    />
  );
}
