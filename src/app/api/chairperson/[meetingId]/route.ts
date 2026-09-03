import { auth } from "@/lib/auth";
import { canManageMeeting } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { evaluateQuorum } from "@/lib/quorum";
import { comparePl } from "@/lib/sortPl";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Endpoint danych dla widoku przewodniczącego (`/chairperson/[meetingId]`).
 * Dostęp: OPERATOR i CHAIRPERSON.
 *
 * Widok read-only - pokazuje stan posiedzenia w czytelnej formie:
 *  - aktualny punkt + kolejne punkty agendy,
 *  - listę mówców z licznikiem aktualnego wystąpienia,
 *  - aktywne i ostatnie głosowania (wraz z wynikami w czasie rzeczywistym),
 *  - kworum i obecność,
 *  - komunikaty operatora.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ meetingId: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { meetingId } = await ctx.params;
  if (!(await canManageMeeting(session, meetingId)))
    return new NextResponse("Forbidden", { status: 403 });

  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      agenda: { orderBy: { order: "asc" } },
      participants: { include: { user: { include: { group: true } }, attendance: true } },
      votes: {
        orderBy: { openedAt: "desc" },
        take: 10,
        include: {
          options: { orderBy: { order: "asc" } },
          ballots: { select: { userId: true, choice: true, selections: { select: { optionId: true } } } },
        },
      },
      speakerLists: {
        include: {
          entries: {
            include: { user: { include: { group: true } } },
            orderBy: { order: "asc" },
          },
          agendaItem: true,
        },
      },
      messages: { where: { hiddenAt: null }, orderBy: { publishedAt: "desc" }, take: 5 },
      currentAgendaItem: true,
      clubClocks: true,
    },
  });
  if (!m) return new NextResponse("Not found", { status: 404 });

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });

  const eligible = m.participants.filter((p) => p.hasVotingRight);
  const presentEligible = eligible.filter((p) => p.attendance?.status === "PRESENT");
  const nameByUserId = new Map(m.participants.map((p) => [p.userId, `${p.user.lastName} ${p.user.firstName}`]));
  const nameOf = (uid: string | null) => (uid ? nameByUserId.get(uid) ?? null : null);
  const quorum = evaluateQuorum(m, eligible.length, presentEligible.length);

  const activeVote = m.votes.find((v) => v.status === "OPEN") ?? null;
  const lastClosedVote = m.votes.find((v) => v.status === "CLOSED") ?? null;

  // Lista mówców dla aktualnego punktu
  const activeSpeakerList = m.currentAgendaItemId
    ? m.speakerLists.find((sl) => sl.agendaItemId === m.currentAgendaItemId)
    : null;

  // Wszystkie głosowania przypisane do aktualnego punktu
  const votesForCurrentItem = m.currentAgendaItemId
    ? m.votes.filter((v) => (v as { agendaItemId: string | null }).agendaItemId === m.currentAgendaItemId)
    : [];

  // Payload aktywnego głosowania (z listą niegłosujących) - budowany async przed odpowiedzią
  let activeVotePayload: {
    id: string; number: number | null; title: string; type: string; visibility: string;
    eligibleCount: number; presentCount: number;
    liveYes: number | null; liveNo: number | null; liveAbstain: number | null;
    liveCastCount: number; liveOptions: { label: string; count: number }[];
    notVoted: { name: string; groupShort: string | null }[];
  } | null = null;

  if (activeVote) {
    const yes = activeVote.ballots.filter((b) => b.choice === "YES").length;
    const no = activeVote.ballots.filter((b) => b.choice === "NO").length;
    const abstain = activeVote.ballots.filter((b) => b.choice === "ABSTAIN").length;
    const isSecret = activeVote.visibility === "SECRET";
    const markerCount = isSecret
      ? await prisma.secretBallotMarker.count({ where: { voteId: activeVote.id } })
      : 0;
    const cast = isSecret ? markerCount : activeVote.ballots.length;
    const perOption = activeVote.options.map((o) => ({
      label: o.label,
      count: activeVote.ballots.reduce((acc, b) =>
        acc + b.selections.filter((s) => s.optionId === o.id).length, 0),
    }));

    const eligiblePresent = await prisma.meetingParticipant.findMany({
      where: {
        meetingId: m.id,
        hasVotingRight: true,
        excludedFromMeeting: false,
        NOT: { excludedFromVoteIds: { has: activeVote.id } },
        attendance: { status: "PRESENT" },
      },
      include: { user: { include: { group: true } } },
    });
    let votedUserIds: Set<string>;
    if (isSecret) {
      const markers = await prisma.secretBallotMarker.findMany({
        where: { voteId: activeVote.id }, select: { userId: true },
      });
      votedUserIds = new Set(markers.map((mk) => mk.userId));
    } else {
      votedUserIds = new Set(activeVote.ballots.map((b) => b.userId).filter(Boolean) as string[]);
    }
    const notVoted = eligiblePresent
      .filter((p) => !votedUserIds.has(p.userId))
      .map((p) => ({
        name: `${p.user.lastName} ${p.user.firstName}`,
        groupShort: p.user.group?.shortName ?? null,
      }))
      .sort((a, b) => comparePl(a.name, b.name));

    activeVotePayload = {
      id: activeVote.id,
      number: activeVote.number,
      title: activeVote.title,
      type: activeVote.type,
      visibility: activeVote.visibility,
      eligibleCount: activeVote.resultEligibleCount ?? 0,
      presentCount: activeVote.resultPresentCount ?? 0,
      liveYes: activeVote.visibility === "OPEN" ? yes : null,
      liveNo: activeVote.visibility === "OPEN" ? no : null,
      liveAbstain: activeVote.visibility === "OPEN" ? abstain : null,
      liveCastCount: cast,
      liveOptions: activeVote.visibility === "OPEN" ? perOption : [],
      notVoted,
    };
  }

  // Kolejka wniosków formalnych (osobna lista na poziomie posiedzenia).
  const formalQueue = m.speakerLists.find((sl) => sl.kind === "FORMAL_MOTIONS");
  const formalMotions = formalQueue
    ? formalQueue.entries
        .filter((e) => e.status === "WAITING" || e.status === "SPEAKING")
        .map((e) => ({
          id: e.id,
          userName: e.speakerName ?? (e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"),
          groupShort: e.speakerClubShort ?? e.user?.group?.shortName ?? null,
          status: e.status,
          startedAt: e.startedAt?.toISOString() ?? null,
          timeLimitSec: e.timeLimitSec,
          timeAdjustmentSec: e.timeAdjustmentSec ?? 0,
        }))
    : [];

  // Indeks bieżącego punktu (np. 5 / 12).
  const orderedAgenda = m.agenda.filter((a) => !a.hiddenFromDisplay);
  const currentIdx = m.currentAgendaItemId
    ? orderedAgenda.findIndex((a) => a.id === m.currentAgendaItemId)
    : -1;

  // Licznik netto dyskusji (na żywo: elapsed + czas trwającej wypowiedzi).
  const runningExtra = m.discussionRunningSince
    ? Math.floor((Date.now() - m.discussionRunningSince.getTime()) / 1000)
    : 0;
  const discussionClock = m.discussionClockEnabled
    ? {
        mode: m.discussionClockMode,
        scope: m.discussionClockScope,
        budgetSec: m.discussionBudgetSec,
        elapsedSec: m.discussionElapsedSec + runningExtra,
        running: m.discussionRunningSince != null,
      }
    : null;

  const isBreak = m.displayMode === "BREAK" || m.status === "PAUSED";

  return NextResponse.json({
    organization: {
      name: settings?.organizationName ?? null,
      logoUrl: settings?.presentationLogoUrl ?? null,
    },
    formalMotions,
    formalMotionsEnabled: m.allowFormalMotionsAnytime,
    discussionClock,
    isBreak,
    breakUntil: m.breakUntil?.toISOString() ?? null,
    breakMessage: m.displayCustomMessage && isBreak ? m.displayCustomMessage : null,
    agendaProgress: { current: currentIdx >= 0 ? currentIdx + 1 : null, total: orderedAgenda.length },
    meeting: {
      id: m.id,
      number: m.number,
      name: m.name,
      status: m.status,
      scheduledAt: m.scheduledAt.toISOString(),
    },
    counts: {
      eligible: eligible.length,
      present: presentEligible.length,
      absent: eligible.length - presentEligible.length,
    },
    quorum: {
      met: quorum.met,
      need: quorum.requiredCount,
    },
    currentItem: m.currentAgendaItem
      ? { number: m.currentAgendaItem.number, title: m.currentAgendaItem.title, status: m.currentAgendaItem.status }
      : null,
    upcomingItems: m.agenda
      .filter((a) => a.status === "PENDING" || a.status === "PAUSED")
      .slice(0, 6)
      .map((a) => ({ number: a.number, title: a.title, status: a.status })),
    speakerList: activeSpeakerList
      ? {
          entries: activeSpeakerList.entries.map((e) => ({
            id: e.id,
            userName: e.speakerName ?? (e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"),
            groupShort: e.speakerClubShort ?? e.user?.group?.shortName ?? null,
            functionTitle: e.speakerRole ?? e.user?.functionTitle ?? null,
            isGuest: e.guestId != null,
            entryType: e.entryType,
            priority: e.priority,
            status: e.status,
            startedAt: e.startedAt?.toISOString() ?? null,
            timeLimitSec: e.timeLimitSec,
            timeAdjustmentSec: e.timeAdjustmentSec,
          })),
        }
      : null,
    activeVote: activeVotePayload,
    lastClosedVote: lastClosedVote
      ? {
          id: lastClosedVote.id,
          number: lastClosedVote.number,
          title: lastClosedVote.title,
          type: lastClosedVote.type,
          visibility: lastClosedVote.visibility,
          resultYes: lastClosedVote.resultYes ?? 0,
          resultNo: lastClosedVote.resultNo ?? 0,
          resultAbstain: lastClosedVote.resultAbstain ?? 0,
          resultCastCount: lastClosedVote.resultCastCount ?? 0,
          resultPassed: lastClosedVote.resultPassed,
          closedAt: lastClosedVote.closedAt?.toISOString() ?? null,
          options: lastClosedVote.options.map((o) => ({
            label: o.label, count: o.resultCount ?? 0,
            positionNumber: o.positionNumber ?? null,
            yes: o.resultYes ?? 0, no: o.resultNo ?? 0, abstain: o.resultAbstain ?? 0,
          })),
          named: lastClosedVote.visibility === "OPEN" ? {
            yes: lastClosedVote.ballots.filter((b) => b.choice === "YES").map((b) => nameOf(b.userId)).filter(Boolean).sort((a, b) => comparePl(a!, b!)),
            no: lastClosedVote.ballots.filter((b) => b.choice === "NO").map((b) => nameOf(b.userId)).filter(Boolean).sort((a, b) => comparePl(a!, b!)),
            abstain: lastClosedVote.ballots.filter((b) => b.choice === "ABSTAIN").map((b) => nameOf(b.userId)).filter(Boolean).sort((a, b) => comparePl(a!, b!)),
          } : null,
        }
      : null,
    votesForCurrentItem: votesForCurrentItem.map((v) => {
      // dla OPEN liczymy ballots na żywo; dla CLOSED bierzemy snapshot
      const yes = v.status === "OPEN" ? v.ballots.filter((b) => b.choice === "YES").length : (v.resultYes ?? 0);
      const no = v.status === "OPEN" ? v.ballots.filter((b) => b.choice === "NO").length : (v.resultNo ?? 0);
      const abstain = v.status === "OPEN" ? v.ballots.filter((b) => b.choice === "ABSTAIN").length : (v.resultAbstain ?? 0);
      const cast = v.status === "OPEN" ? v.ballots.length : (v.resultCastCount ?? 0);
      return {
        id: v.id,
        number: v.number,
        title: v.title,
        status: v.status,
        type: v.type,
        visibility: v.visibility,
        resultYes: yes,
        resultNo: no,
        resultAbstain: abstain,
        resultCastCount: cast,
        resultPassed: v.resultPassed,
      };
    }),
    messages: m.messages.map((msg) => ({ id: msg.id, content: msg.content, publishedAt: msg.publishedAt.toISOString() })),
  });
}
