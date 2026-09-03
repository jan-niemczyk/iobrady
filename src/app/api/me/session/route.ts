import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { MeetingStatus } from "@prisma/client";
import { meetingNameWithDate } from "@/lib/meetingName";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const preferredMeetingId = url.searchParams.get("m");

  const active = await prisma.meetingParticipant.findFirst({
    where: {
      userId: session.user.id,
      excludedFromMeeting: false,
      // Jeśli podano wybrane posiedzenie (?m=) i jest otwarte - trzymaj się go, nie przeskakuj na pierwsze.
      ...(preferredMeetingId ? { meetingId: preferredMeetingId } : {}),
      meeting: { status: { in: [MeetingStatus.OPEN, MeetingStatus.IN_PROGRESS, MeetingStatus.PAUSED] } },
    },
    include: {
      meeting: {
        include: {
          currentAgendaItem: {
            include: {
              speakerList: {
                include: {
                  entries: {
                    include: { user: true },
                    orderBy: { order: "asc" },
                  },
                },
              },
            },
          },
          votes: { where: { status: "OPEN" }, take: 1, include: { options: { orderBy: { order: "asc" } }, agendaItem: true } },
          messages: { where: { hiddenAt: null }, orderBy: { publishedAt: "desc" }, take: 5 },
        },
      },
      attendance: true,
      user: true,
    },
  });

  if (!active) return NextResponse.json({ activeVote: null, attendance: null });

  const appSettings = await prisma.settings.findUnique({ where: { id: "singleton" } });

  // czy bieżący użytkownik już oddał głos w aktywnym głosowaniu
  const open = active.meeting.votes[0] ?? null;
  let alreadyVoted = false;
  let myChoice: "YES" | "NO" | "ABSTAIN" | null = null;
  let mySelectedOptionIds: string[] = [];
  let myPackageChoices: { optionId: string; choice: "YES" | "NO" | "ABSTAIN" }[] = [];
  let pinAuthorized = false;
  if (open) {
    if (open.pinRequired) {
      const pa = await prisma.votePinAuth.findUnique({
        where: { voteId_userId: { voteId: open.id, userId: session.user.id } },
      });
      pinAuthorized = !!pa;
    }
    if (open.visibility === "SECRET") {
      // Tajne: nie ma ballota z wyborem. Sprawdzamy tylko anonimowy marker (fakt oddania).
      const marker = await prisma.secretBallotMarker.findUnique({
        where: { voteId_userId: { voteId: open.id, userId: session.user.id } },
      });
      if (marker) alreadyVoted = true;
      // myChoice celowo pozostaje null - radny nie widzi co oddał
    } else {
      const ballot = await prisma.ballot.findUnique({
        where: { voteId_userId: { voteId: open.id, userId: session.user.id } },
        include: { selections: true },
      });
      if (ballot) {
        alreadyVoted = true;
        myChoice = ballot.choice ?? null;
        mySelectedOptionIds = ballot.selections.map((s) => s.optionId);
        myPackageChoices = ballot.selections
          .filter((s) => s.choice != null)
          .map((s) => ({ optionId: s.optionId, choice: s.choice as "YES" | "NO" | "ABSTAIN" }));
      }
    }
  }

  // ostatnio zamknięte głosowanie - do pokazania wyników po zamknięciu
  const lastClosed = await prisma.vote.findFirst({
    where: { meetingId: active.meetingId, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    include: { options: { orderBy: { order: "asc" } } },
  });
  let lastMyChoice: "YES" | "NO" | "ABSTAIN" | null = null;
  if (lastClosed) {
    // Tylko dla jawnych - dla tajnych userId jest wyzerowane, więc nie odczytamy
    if (lastClosed.visibility === "OPEN") {
      const b = await prisma.ballot.findUnique({
        where: { voteId_userId: { voteId: lastClosed.id, userId: session.user.id } },
      });
      lastMyChoice = b?.choice ?? null;
    }
  }

  // Aktywne sprawdzenie obecności (migawka) - dla samodzielnego potwierdzania przez radnego.
  let attendanceCheck: { active: boolean; selfEnabled: boolean; myPresent: boolean } | null = null;
  if (active.meeting.activeAttendanceCheckId) {
    const myEntry = await prisma.attendanceCheckEntry.findUnique({
      where: { checkId_userId: { checkId: active.meeting.activeAttendanceCheckId, userId: session.user.id } },
      select: { present: true },
    }).catch(() => null);
    attendanceCheck = {
      active: true,
      selfEnabled: active.meeting.attendanceSelfCheckEnabled,
      myPresent: myEntry?.present ?? false,
    };
  }

  // Kolejka wniosków formalnych (osobna lista FORMAL_MOTIONS) - widoczna dla WSZYSTKICH radnych.
  const formalQueue = await prisma.speakerList.findFirst({
    where: { meetingId: active.meetingId, kind: "FORMAL_MOTIONS" },
    include: { entries: { where: { status: { in: ["WAITING", "SPEAKING"] } }, orderBy: { order: "asc" }, include: { user: true } } },
  });
  const formalMotions = formalQueue
    ? {
        listId: formalQueue.id,
        entries: formalQueue.entries.map((e) => ({
          id: e.id,
          userName: e.speakerName ?? (e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"),
          isMe: e.userId === session.user.id,
          order: e.order,
          status: e.status,
          groupShort: e.speakerClubShort ?? null,
          timeLimitSec: e.timeLimitSec,
          timeAdjustmentSec: e.timeAdjustmentSec,
          startedAt: e.startedAt?.toISOString() ?? null,
        })),
      }
    : null;

  return NextResponse.json({
    participantId: active.id,
    meetingId: active.meetingId,
    attendanceCheck,
    formalMotions,
    meetingName: meetingNameWithDate(active.meeting.name, active.meeting.scheduledAt),
    meetingNumber: active.meeting.number,
    hasVotingRight: active.hasVotingRight,
    isChairperson: active.isChairperson,    hasPriorityRight: active.hasPriorityRight,
    canUseMiniDisplay: active.canUseMiniDisplay,
    myFirstName: active.user?.firstName ?? "",
    myLastName: active.user?.lastName ?? "",
    isInvitedGuest: active.isInvitedGuest,
    attendance: active.attendance?.status ?? null,
    attendanceOpen: active.meeting.attendanceOpen,
    currentAgendaItem: active.meeting.currentAgendaItem
      ? { number: active.meeting.currentAgendaItem.number, title: active.meeting.currentAgendaItem.title }
      : null,
    speakerList: active.meeting.currentAgendaItem?.speakerList
      ? {
          id: active.meeting.currentAgendaItem.speakerList.id,
          selfSignupEnabled: active.meeting.currentAgendaItem.speakerList.selfSignupEnabled,
          allowRegular: active.meeting.currentAgendaItem.speakerList.allowRegular,
          allowAdVocem: active.meeting.currentAgendaItem.speakerList.allowAdVocem,
          allowFormalMotion: active.meeting.currentAgendaItem.speakerList.allowFormalMotion,
          visibleToParticipants: active.meeting.currentAgendaItem.speakerList.visibleToParticipants,
          defaultTimeLimitSec: active.meeting.currentAgendaItem.speakerList.defaultTimeLimitSec,
          mySignedUp: active.meeting.currentAgendaItem.speakerList.entries.some(
            (e) => e.userId === session.user.id && (e.status === "WAITING" || e.status === "SPEAKING"),
          ),
          entries: active.meeting.currentAgendaItem.speakerList.entries.map((e) => ({
            id: e.id,
            userName: e.speakerName ?? (e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"),
            isMe: e.userId === session.user.id,
            order: e.order,
            status: e.status,
            entryType: e.entryType,
            timeLimitSec: e.timeLimitSec,
            timeAdjustmentSec: e.timeAdjustmentSec,
            startedAt: e.startedAt?.toISOString() ?? null,
          })),
        }
      : null,
    activeVote: open
      ? {
          id: open.id,
          title: open.title,
          agendaItemTitle: open.agendaItem?.title ?? null,
          agendaItemNumber: open.agendaItem ? (open.agendaItem.unnumbered ? null : open.agendaItem.number) : null,
          description: open.description,
          type: open.type,
          visibility: open.visibility,
          majority: open.majority,
          majorityKind: open.majorityKind,
          majorityBase: open.majorityBase,
          minSelections: open.minSelections,
          maxSelections: open.maxSelections,
          options: open.options.map((o) => ({ id: o.id, order: o.order, label: o.label, positionNumber: o.positionNumber, description: o.description })),
          alreadyVoted,
          myChoice,
          mySelectedOptionIds,
          myPackageChoices,
          pinRequired: open.pinRequired,
          pinAuthorized,
          requireAllPositions: open.requireAllPositions,
          voteIsFinal: open.visibility === "SECRET" ? (open.firstVoteFinal ?? true) : (open.firstVoteFinal ?? !!appSettings?.firstVoteFinalOpen),
        }
      : null,
    lastClosedVote: lastClosed
      ? {
          id: lastClosed.id,
          title: lastClosed.title,
          type: lastClosed.type,
          visibility: lastClosed.visibility,
          number: lastClosed.number,
          closedAt: lastClosed.closedAt?.toISOString() ?? null,
          resultYes: lastClosed.resultYes ?? 0,
          resultNo: lastClosed.resultNo ?? 0,
          resultAbstain: lastClosed.resultAbstain ?? 0,
          resultCastCount: lastClosed.resultCastCount ?? 0,
          resultPresentCount: lastClosed.resultPresentCount ?? 0,
          resultPassed: lastClosed.resultPassed,
          myChoice: lastMyChoice,
          requireAllPositions: lastClosed.requireAllPositions,
          options: lastClosed.options.map((o) => ({
            id: o.id, order: o.order, label: o.label, resultCount: o.resultCount ?? 0,
            positionNumber: o.positionNumber,
            resultYes: o.resultYes ?? o.secretYes ?? 0,
            resultNo: o.resultNo ?? o.secretNo ?? 0,
            resultAbstain: o.resultAbstain ?? o.secretAbstain ?? 0,
          })),
        }
      : null,
    messages: active.meeting.messages.map((m) => ({
      id: m.id, content: m.content, publishedAt: m.publishedAt.toISOString(),
    })),
  });
}
