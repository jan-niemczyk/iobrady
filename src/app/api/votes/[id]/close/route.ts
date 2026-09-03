import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { canManageByVote } from "@/lib/canManage";
import { NextResponse } from "next/server";
import { VoteStatus, VoteType, VoteVisibility } from "@prisma/client";
import { evaluateMajority } from "@/lib/majority";
import { computeListVoteResult } from "@/lib/listVote";
import { evaluateQuorum } from "@/lib/quorum";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canManageByVote(session, id)))
    return new NextResponse("Forbidden", { status: 403 });

  const vote = await prisma.vote.findUnique({
    where: { id },
    include: {
      meeting: true,
      options: { orderBy: { order: "asc" } },
      ballots: { include: { selections: true } },
      _count: { select: { secretMarkers: true } },
    },
  });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (vote.status !== VoteStatus.OPEN)
    return new NextResponse(`Nie można zamknąć - głosowanie w statusie ${vote.status}`, { status: 400 });

  const isSecret = vote.visibility === VoteVisibility.SECRET;

  // policz sumy w zależności od typu
  let resultYes = 0, resultNo = 0, resultAbstain = 0, resultInvalid = 0;
  let resultPassed: boolean | null = null;
  const optionSnapshots: { id: string; count: number }[] = [];
  const packageSnapshots: { id: string; yes: number; no: number; abstain: number; passed: boolean }[] = [];

  if (vote.type === VoteType.STANDARD) {
    if (isSecret) {
      // Tajne: bierzemy zbiorcze liczniki (nie ma pojedynczych głosów).
      resultYes = vote.secretYes;
      resultNo = vote.secretNo;
      resultAbstain = vote.secretAbstain;
      resultInvalid = vote.secretInvalid;
    } else {
      for (const b of vote.ballots) {
        if (b.choice === "YES") resultYes++;
        else if (b.choice === "NO") resultNo++;
        else if (b.choice === "ABSTAIN") resultAbstain++;
      }
    }
    const m = evaluateMajority(vote.majorityKind, vote.majorityBase, {
      yes: resultYes, no: resultNo, abstain: resultAbstain,
      presentCount: vote.resultPresentCount ?? 0,
      eligibleCount: vote.resultEligibleCount ?? 0,
    });
    resultPassed = m.passed;
  } else if (vote.type === VoteType.LIST) {
    if (isSecret) {
      // Tajna lista: wyniki to anonimowe liczniki per opcja (secretCount).
      // castCount (głosujących) = liczba markerów (oddane karty).
      for (const o of vote.options) {
        optionSnapshots.push({ id: o.id, count: o.secretCount });
      }
      // "passed" dla listy: czy którykolwiek kandydat przekroczył próg większości
      const base = vote.majorityBase === "OF_FULL_BODY" ? (vote.resultEligibleCount ?? 0)
        : vote.majorityBase === "OF_PRESENT" ? (vote.resultPresentCount ?? 0)
        : vote._count.secretMarkers; // OF_VOTERS
      const threshold = vote.majorityKind === "ABSOLUTE" ? Math.floor(base / 2) + 1
        : vote.majorityKind === "QUALIFIED_TWO_THIRDS" ? Math.ceil((2 * base) / 3)
        : vote.majorityKind === "QUALIFIED_THREE_FIFTHS" ? Math.ceil((3 * base) / 5)
        : 0;
      resultPassed = vote.options.some((o) => o.secretCount >= threshold && threshold > 0);
    } else {
      const r = computeListVoteResult({
        options: vote.options.map((o) => ({ id: o.id, order: o.order, label: o.label })),
        ballots: vote.ballots.map((b) => ({
          id: b.id, userId: b.userId,
          selectedOptionIds: b.selections.map((s) => s.optionId),
        })),
        majorityKind: vote.majorityKind,
        majorityBase: vote.majorityBase,
        eligibleCount: vote.resultEligibleCount ?? 0,
        presentCount: vote.resultPresentCount ?? 0,
      });
      for (const opt of r.options) optionSnapshots.push({ id: opt.optionId, count: opt.yesCount });
      resultPassed = r.options.some((o) => o.passed);
    }
  } else if (vote.type === VoteType.PACKAGE) {
    // Pakiet: każda pozycja liczona niezależnie (za/przeciw/wstrzym), własna większość.
    const base = vote.majorityBase === "OF_FULL_BODY" ? (vote.resultEligibleCount ?? 0)
      : vote.majorityBase === "OF_PRESENT" ? (vote.resultPresentCount ?? 0)
      : (isSecret ? vote._count.secretMarkers : vote.ballots.length); // OF_VOTERS
    const threshold = vote.majorityKind === "ABSOLUTE" ? Math.floor(base / 2) + 1
      : vote.majorityKind === "QUALIFIED_TWO_THIRDS" ? Math.ceil((2 * base) / 3)
      : vote.majorityKind === "QUALIFIED_THREE_FIFTHS" ? Math.ceil((3 * base) / 5)
      : 0; // SIMPLE liczymy poniżej (yes>no)

    let anyPassed = false;
    for (const o of vote.options) {
      let y = 0, n = 0, a = 0;
      if (isSecret) {
        y = o.secretYes; n = o.secretNo; a = o.secretAbstain;
      } else {
        for (const b of vote.ballots) {
          const sel = b.selections.find((s) => s.optionId === o.id);
          if (!sel || !sel.choice) continue;
          if (sel.choice === "YES") y++;
          else if (sel.choice === "NO") n++;
          else a++;
        }
      }
      const passed = vote.majorityKind === "SIMPLE" ? y > n : (threshold > 0 && y >= threshold);
      if (passed) anyPassed = true;
      packageSnapshots.push({ id: o.id, yes: y, no: n, abstain: a, passed });
    }
    resultPassed = anyPassed;
  } else if (vote.type === VoteType.QUORUM) {
    const presentNow = vote.ballots.length;
    const q = evaluateQuorum(vote.meeting, vote.resultEligibleCount ?? 0, presentNow);
    resultPassed = q.met;
  }

  // liczba GŁOSUJĄCYCH (do wyniku): tajne standardowe → tylko ważne głosy (bez nieważnych);
  // tajna lista → liczba markerów (oddane karty); jawne/lista → liczba ballotów; kworum → ballots.
  const secretValidCount = resultYes + resultNo + resultAbstain;
  const castCount = isSecret && vote.type === VoteType.STANDARD
    ? secretValidCount
    : isSecret && vote.type === VoteType.LIST
    ? vote._count.secretMarkers
    : vote.ballots.length;
  // Frekwencja tajnego (kto oddał kartę) = liczba markerów.
  const secretTurnout = isSecret && (vote.type === VoteType.STANDARD || vote.type === VoteType.LIST)
    ? vote._count.secretMarkers
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.vote.update({
      where: { id: vote.id },
      data: {
        status: VoteStatus.CLOSED,
        closedAt: new Date(),
        resultCastCount: castCount,
        resultPresentCount: vote.type === VoteType.QUORUM
          ? castCount
          : (secretTurnout ?? vote.resultPresentCount),
        resultYes: vote.type === VoteType.LIST || vote.type === VoteType.QUORUM ? null : resultYes,
        resultNo: vote.type === VoteType.LIST || vote.type === VoteType.QUORUM ? null : resultNo,
        resultAbstain: vote.type === VoteType.LIST || vote.type === VoteType.QUORUM ? null : resultAbstain,
        resultInvalid: vote.type === VoteType.STANDARD ? resultInvalid : null,
        resultPassed,
        resultQuorumMet: (vote.resultPresentCount ?? 0) > 0,
        resultPublishedAt: vote.meeting.publishResultsAutomatically && !vote.meeting.holdResults ? new Date() : null,
      },
    });

    for (const s of optionSnapshots) {
      await tx.voteOption.update({ where: { id: s.id }, data: { resultCount: s.count } });
    }
    for (const s of packageSnapshots) {
      await tx.voteOption.update({ where: { id: s.id }, data: { resultYes: s.yes, resultNo: s.no, resultAbstain: s.abstain, resultPassed: s.passed } });
    }

    // Tajne markery możemy usunąć po zamknięciu - liczniki już są w Vote,
    // a markery nie niosą treści. Zostawiamy je jednak dla audytu frekwencji
    // (kto był obecny przy głosowaniu). Nie zawierają wyboru, więc to bezpieczne.
  });

  // A10: głosowanie kworum tworzy migawkę obecności (kto oddał głos = obecny).
  if (vote.type === VoteType.QUORUM) {
    const parts = await prisma.meetingParticipant.findMany({
      where: { meetingId: vote.meetingId, hasVotingRight: true, excludedFromMeeting: false },
      include: { user: { include: { group: true } } },
    });
    const votedUsers = new Set(vote.ballots.map((b) => b.userId).filter(Boolean) as string[]);
    const presentCount = parts.filter((mp) => votedUsers.has(mp.userId)).length;
    const now = new Date();
    await prisma.attendanceCheck.create({
      data: {
        meetingId: vote.meetingId,
        kind: "QUORUM_VOTE",
        status: "CLOSED",
        closedAt: now,
        presentCount,
        eligibleCount: parts.length,
        quorumRequired: vote.resultEligibleCount ?? null,
        quorumMet: resultPassed,
        entries: {
          create: parts.map((mp) => ({
            userId: mp.userId,
            lastName: mp.user.lastName,
            firstName: mp.user.firstName,
            clubShort: mp.user.group?.shortName ?? null,
            present: votedUsers.has(mp.userId),
            markedAt: votedUsers.has(mp.userId) ? now : null,
          })),
        },
      },
    });
    // #3: kworum nadpisuje bieżący stan obecności tak samo jak potwierdzenie obecności.
    // Kto oddał głos = obecny, pozostali uprawnieni = nieobecni.
    for (const mp of parts) {
      const present = votedUsers.has(mp.userId);
      await prisma.attendance.upsert({
        where: { participantId: mp.id },
        create: { participantId: mp.id, status: present ? "PRESENT" : "ABSENT", source: "OPERATOR", confirmedByUserId: session.user.id },
        update: { status: present ? "PRESENT" : "ABSENT", confirmedAt: now, source: "OPERATOR", confirmedByUserId: session.user.id },
      });
    }
  }

  await audit({
    action: "VOTE_CLOSED",
    description: `Zamknięto głosowanie: ${vote.title} (${vote.visibility === "SECRET" ? "tajne" : "jawne"})`,
    meetingId: vote.meetingId,
    userId: session.user.id,
    metadata: {
      voteId: vote.id,
      cast: castCount,
      yes: resultYes, no: resultNo, abstain: resultAbstain,
      passed: resultPassed,
      anonymized: vote.visibility === VoteVisibility.SECRET,
    },
  });

  // PIN sam się chowa z chwilą zakończenia głosowania.
  await prisma.meeting.updateMany({
    where: { id: vote.meetingId, displayPinVoteId: vote.id },
    data: { displayPinVoteId: null },
  });

  // Zamknięcie głosowania = publikacja wyników: automatycznie pokazujemy je na prezentacji
  // (operator nic nie klika). Ukrycie następuje przez "Zamknij" w oknie wyników (odpięcie).
  await prisma.meeting.update({
    where: { id: vote.meetingId },
    data: { displayPinnedVoteId: vote.id },
  });

  publishToMeeting(vote.meetingId, { type: "vote.closed", voteId: vote.id });
  publishToMeeting(vote.meetingId, { type: "display.changed" });
  return NextResponse.json({ ok: true, passed: resultPassed });
}
