import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { evaluateQuorum } from "@/lib/quorum";
import { MEETING_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { MeetingStatus } from "@prisma/client";
import { MeetingPanelClient } from "@/components/operator/MeetingPanelClient";

export const dynamic = "force-dynamic";

export default async function MeetingPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      agenda: { orderBy: { order: "asc" } },
      participants: {
        include: { user: { include: { group: true } }, attendance: true },
        orderBy: { user: { lastName: "asc" } },
      },
      votes: { orderBy: { openedAt: "desc" }, take: 10, include: { options: { orderBy: { order: "asc" } }, _count: { select: { ballots: true, secretMarkers: true } } } },
      speakerLists: { include: { entries: { include: { user: { include: { group: true } } }, orderBy: { order: "asc" } } } },
      messages: { orderBy: { publishedAt: "desc" }, take: 10 },
      currentAgendaItem: true,
    },
  });

  if (!meeting) notFound();

  const eligible = meeting.participants.filter((p) => p.hasVotingRight);
  const presentEligible = eligible.filter((p) => p.attendance?.status === "PRESENT");
  const quorum = evaluateQuorum(meeting, eligible.length, presentEligible.length);

  // Plik serializowany do klienta - zawiera tylko bezpieczne pola
  const initialState = {
    id: meeting.id,
    number: meeting.number,
    name: meeting.name,
    status: meeting.status,
    scheduledAt: meeting.scheduledAt.toISOString(),
    openedAt: meeting.openedAt?.toISOString() ?? null,
    attendanceMode: meeting.attendanceMode,
    attendanceOpen: meeting.attendanceOpen,
    allowFormalMotionsAnytime: meeting.allowFormalMotionsAnytime,
    activeAttendanceCheckId: meeting.activeAttendanceCheckId,
    attendanceSelfCheckEnabled: meeting.attendanceSelfCheckEnabled,
    currentAgendaItemId: meeting.currentAgendaItemId,
    settings: {
      quorumRule: meeting.quorumRule,
      quorumValue: meeting.quorumValue,
      autoOpenSpeakerList: meeting.autoOpenSpeakerList,
      displaySummaryAfterClose: meeting.displaySummaryAfterClose,
      agendaAutoDisplayMode: meeting.agendaAutoDisplayMode,
      holdResults: meeting.holdResults,
      publishResultsAutomatically: meeting.publishResultsAutomatically,
    },
    display: {
      mode: meeting.displayMode,
      customMessage: meeting.displayCustomMessage,
      messageOnOverlay: meeting.displayMessageOnOverlay,
      pinnedVoteId: meeting.displayPinnedVoteId,
      pinVoteId: meeting.displayPinVoteId,
      breakUntil: meeting.breakUntil?.toISOString() ?? null,
      pinnedAgendaItemId: meeting.displayPinnedAgendaItemId,
      showCastCount: meeting.displayShowCastCount,
      showByName: meeting.displayShowByName,
      showIndividualVotes: meeting.displayShowIndividualVotes,
      candidatePage: meeting.displayCandidatePage,
      candidateSort: meeting.displayCandidateSort,
    },
    agenda: meeting.agenda.map((a) => ({
      id: a.id, order: a.order, number: a.number, title: a.title, status: a.status,
    })),
    counts: {
      total: meeting.participants.length,
      eligible: eligible.length,
      nonVoting: meeting.participants.length - eligible.length,
      present: meeting.participants.filter((p) => p.attendance?.status === "PRESENT").length,
      presentEligible: presentEligible.length,
    },
    quorum,
    participants: meeting.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: `${p.user.firstName} ${p.user.lastName}`,
      hasVotingRight: p.hasVotingRight,
      isInvitedGuest: p.isInvitedGuest,
      groupName: p.user.group?.name ?? null,
      groupShort: p.user.group?.shortName ?? null,
      groupColor: p.user.group?.color ?? null,
      attendance: p.attendance?.status ?? null,
    })),
    votes: meeting.votes.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description,
      number: v.number,
      adHoc: v.adHoc, contextLabel: v.contextLabel,
      agendaItemId: v.agendaItemId,
      type: v.type,
      visibility: v.visibility,
      status: v.status,
      pinRequired: v.pinRequired,
      pinCode: v.pinCode,
      majority: v.majority,
      majorityKind: v.majorityKind,
      majorityBase: v.majorityBase,
      minSelections: v.minSelections,
      maxSelections: v.maxSelections,
      openedAt: v.openedAt?.toISOString() ?? null,
      closedAt: v.closedAt?.toISOString() ?? null,
      resultEligibleCount: v.resultEligibleCount,
      resultPresentCount: v.resultPresentCount,
      resultCastCount: v.resultCastCount,
      liveCastCount: v.visibility === "SECRET" ? v._count.secretMarkers : v._count.ballots,
      resultPassed: v.resultPassed,
      resultYes: v.resultYes,
      resultNo: v.resultNo,
      resultAbstain: v.resultAbstain,
      resultPublishedAt: v.resultPublishedAt?.toISOString() ?? null,
      options: v.options.map((o) => ({ id: o.id, order: o.order, label: o.label, resultCount: o.resultCount, positionNumber: o.positionNumber })),
    })),
    messages: meeting.messages.map((m) => ({
      id: m.id, content: m.content, publishedAt: m.publishedAt.toISOString(),
      hidden: !!m.hiddenAt,
    })),
    speakerLists: meeting.speakerLists.map((sl) => ({
      id: sl.id,
      agendaItemId: sl.agendaItemId,
      selfSignupEnabled: sl.selfSignupEnabled,
      allowRegular: sl.allowRegular,
      allowAdVocem: sl.allowAdVocem,
      allowFormalMotion: sl.allowFormalMotion,
      visibleToParticipants: sl.visibleToParticipants,
      defaultTimeLimitSec: sl.defaultTimeLimitSec,
      entries: sl.entries.map((e) => ({
        id: e.id,
        userId: e.userId,
        userName: e.speakerName ?? (e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"),
        groupShort: e.speakerClubShort ?? e.user?.group?.shortName ?? null,
        isGuest: e.guestId != null,
        order: e.order,
        entryType: e.entryType,
        priority: e.priority,
        status: e.status,
        timeLimitSec: e.timeLimitSec,
        timeAdjustmentSec: e.timeAdjustmentSec,
        startedAt: e.startedAt?.toISOString() ?? null,
        endedAt: e.endedAt?.toISOString() ?? null,
        consumedSec: e.consumedSec,
      })),
    })),
  };

  return <MeetingPanelClient initial={initialState} />;
}
