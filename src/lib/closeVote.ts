import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { VoteStatus, VoteType, VoteVisibility } from "@prisma/client";
import { evaluateMajority } from "@/lib/majority";
import { computeListVoteResult } from "@/lib/listVote";
import { evaluateQuorum } from "@/lib/quorum";
import { HttpError, lockVoteRow } from "@/lib/booth";
import { purgeSecretResetPayloads } from "@/lib/secretReset";

/**
 * Zamknięcie głosowania: liczenie wyniku w jednej transakcji pod blokadą wiersza głosowania,
 * migawka obecności dla kworum, audyt, wynik na prezentacji. Wspólne dla zamknięcia przez
 * prowadzącego (actorUserId) i automatycznego po oddaniu głosów przez wszystkich (actorUserId = null).
 * Błędy: HttpError (np. 400, gdy głosowanie nie jest już otwarte).
 */
export async function closeVoteNow(id: string, actorUserId: string | null): Promise<{ passed: boolean | null }> {
  // Całe liczenie wyniku i zmiana statusu w JEDNEJ transakcji pod blokadą wiersza głosowania:
  // głos przyjmowany równolegle albo wejdzie przed zamknięciem (i zostanie policzony), albo
  // zostanie odrzucony - nie ma stanu "przyjęty, ale poza wynikiem". Zamknięcie unieważnia też
  // niewykorzystane udostępnienie karty (tryb kotarkowy).
  let outcome;
  outcome = await prisma.$transaction(async (tx) => {
  await lockVoteRow(tx, id);
  const vote = await tx.vote.findUnique({
    where: { id },
    include: {
      meeting: true,
      options: { orderBy: { order: "asc" } },
      ballots: { include: { selections: true } },
      _count: { select: { secretMarkers: true } },
    },
  });
  if (!vote) throw new HttpError(404, "Not found");
  if (vote.status !== VoteStatus.OPEN)
    throw new HttpError(400, `Nie można zamknąć - głosowanie w statusie ${vote.status}`);

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

  {
    await tx.vote.update({
      where: { id: vote.id },
      data: {
        status: VoteStatus.CLOSED,
        closedAt: new Date(),
        boothUserId: null,
        boothGrantedAt: null,
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
      },
    });

    for (const s of optionSnapshots) {
      await tx.voteOption.update({ where: { id: s.id }, data: { resultCount: s.count } });
    }
    for (const s of packageSnapshots) {
      await tx.voteOption.update({ where: { id: s.id }, data: { resultYes: s.yes, resultNo: s.no, resultAbstain: s.abstain, resultPassed: s.passed } });
    }

    // Tajne markery zostają (frekwencja: kto oddał kartę), ale tracą zaszyfrowaną treść głosu
    // używaną do zerowania - po zamknięciu powiązanie osoba -> treść głosu nie istnieje.
    if (isSecret) await purgeSecretResetPayloads(tx, vote.id);
  }
  return { vote, castCount, resultYes, resultNo, resultAbstain, resultPassed };
  }, { timeout: 20_000 });
  const { vote, castCount, resultYes, resultNo, resultAbstain, resultPassed } = outcome;

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
        create: { participantId: mp.id, status: present ? "PRESENT" : "ABSENT", source: "OPERATOR", confirmedByUserId: actorUserId },
        update: { status: present ? "PRESENT" : "ABSENT", confirmedAt: now, source: "OPERATOR", confirmedByUserId: actorUserId },
      });
    }
  }

  await audit({
    action: "VOTE_CLOSED",
    description: `${actorUserId ? "Zamknięto" : "Automatycznie zamknięto (głosowali wszyscy obecni uprawnieni)"} głosowanie: ${vote.title} (${vote.visibility === "SECRET" ? "tajne" : "jawne"})`,
    meetingId: vote.meetingId,
    userId: actorUserId ?? undefined,
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
  return { passed: resultPassed };
}

/**
 * Automatyczne zamknięcie (przełącznik posiedzenia `autoCloseVotes`): gdy każdy obecny uczestnik
 * z prawem głosu (bez wyłączonych z tego głosowania) oddał głos. Nie dotyczy głosowania kworum -
 * tam obecność dopiero wynika z oddanych głosów. Zwraca true, gdy głosowanie zostało zamknięte.
 */
export async function autoCloseIfAllVoted(voteId: string): Promise<boolean> {
  const vote = await prisma.vote.findUnique({
    where: { id: voteId },
    select: {
      id: true, status: true, type: true, meetingId: true,
      meeting: { select: { autoCloseVotes: true } },
      ballots: { select: { userId: true } },
      secretMarkers: { select: { userId: true } },
    },
  });
  if (!vote || vote.status !== VoteStatus.OPEN || vote.type === VoteType.QUORUM || !vote.meeting.autoCloseVotes) return false;
  const present = await prisma.meetingParticipant.findMany({
    where: { meetingId: vote.meetingId, hasVotingRight: true, excludedFromMeeting: false, attendance: { status: "PRESENT" } },
    select: { userId: true, excludedFromVoteIds: true },
  });
  const targets = present.filter((p) => !p.excludedFromVoteIds.includes(vote.id));
  if (targets.length === 0) return false;
  const voted = new Set<string>();
  for (const b of vote.ballots) if (b.userId) voted.add(b.userId);
  for (const m of vote.secretMarkers) if (m.userId) voted.add(m.userId);
  if (!targets.every((p) => voted.has(p.userId))) return false;
  try {
    await closeVoteNow(vote.id, null);
    return true;
  } catch (e) {
    if (e instanceof HttpError) return false; // równoległe zamknięcie - już zamknięte
    throw e;
  }
}
