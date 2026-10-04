import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { comparePl } from "@/lib/sortPl";
import { VoteStatus } from "@prisma/client";
import { lockMeetingRow, VOTING_MEETING_STATUSES } from "@/lib/meetingLock";
import { HttpError } from "@/lib/booth";

export type OpenVoteResult = { ok: true; number: number | null } | { ok: false; status: number; message: string };

/**
 * Jedyna ścieżka otwarcia głosowania (także "Utwórz i otwórz"): migawka składu i obecności,
 * numer, wyzerowanie liczników - wszystko pod blokadą wiersza posiedzenia (BR-3).
 */
export async function openVoteNow(id: string, userId: string): Promise<OpenVoteResult> {
  const vote = await prisma.vote.findUnique({ where: { id }, include: { meeting: true } });
  if (!vote) return { ok: false, status: 404, message: "Not found" };

  if (vote.status !== VoteStatus.READY && vote.status !== VoteStatus.DRAFT)
    return { ok: false, status: 400, message: `Nie można otworzyć - głosowanie w statusie ${vote.status}` };
  if (!(VOTING_MEETING_STATUSES as readonly string[]).includes(vote.meeting.status))
    return { ok: false, status: 400, message: "Głosowanie można otworzyć tylko w otwartym lub trwającym posiedzeniu." };

  // snapshot uprawnionych i obecnych
  const participants = await prisma.meetingParticipant.findMany({
    where: { meetingId: vote.meetingId },
    include: { attendance: true, user: { include: { group: true } } },
  });
  const eligible = participants.filter(
    (p) => p.hasVotingRight && !p.excludedFromVoteIds.includes(vote.id) && !p.excludedFromMeeting,
  );
  const present = eligible.filter((p) => p.attendance?.status === "PRESENT");

  // Migawka pełnego składu (do tablicy nazwisk na ekranie historycznych głosowań).
  // Sortujemy po polsku już na etapie zapisu, by ekran nie musiał tego robić.
  const rosterSorted = [...participants]
    .filter((p) => !p.excludedFromMeeting)
    .sort((a, b) => {
      const byLast = comparePl(a.user.lastName, b.user.lastName);
      return byLast !== 0 ? byLast : comparePl(a.user.firstName, b.user.firstName);
    });

  let number: number | null = null;
  try {
  await prisma.$transaction(async (tx) => {
    // BR-3: pod blokadą wiersza POSIEDZENIA ponownie sprawdzamy jego status, brak innego otwartego
    // głosowania W TYM posiedzeniu i status głosowania - dwa równoległe żądania nie otworzą dwóch
    // głosowań naraz. Inne posiedzenia (np. tej samej osoby) nie są blokowane.
    await lockMeetingRow(tx, vote.meetingId);
    const m = await tx.meeting.findUnique({ where: { id: vote.meetingId }, select: { status: true } });
    if (!m || !(VOTING_MEETING_STATUSES as readonly string[]).includes(m.status))
      throw new HttpError(400, "Głosowanie można otworzyć tylko w otwartym lub trwającym posiedzeniu.");
    const other = await tx.vote.findFirst({ where: { meetingId: vote.meetingId, status: VoteStatus.OPEN, NOT: { id: vote.id } }, select: { id: true } });
    if (other) throw new HttpError(400, "Inne głosowanie jest aktywne - zamknij je najpierw");
    const cur = await tx.vote.findUnique({ where: { id }, select: { status: true } });
    if (!cur || (cur.status !== VoteStatus.READY && cur.status !== VoteStatus.DRAFT))
      throw new HttpError(400, `Nie można otworzyć - głosowanie w statusie ${cur?.status ?? "?"}`);
    // Nadaj numer głosowania (READY -> OPEN dla planowanych) - pod blokadą, bez duplikatów.
    let assignedNumber: number | null = vote.number;
    if (assignedNumber == null) {
      const lastNumbered = await tx.vote.findFirst({
        where: { meetingId: vote.meetingId, number: { not: null } },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      assignedNumber = (lastNumbered?.number ?? 0) + 1;
    }
    number = assignedNumber;
    // Czysty start liczników tajnych + usunięcie markerów (gdyby głosowanie było ponownie otwierane)
    await tx.secretBallotMarker.deleteMany({ where: { voteId: id } });
    await tx.voteOption.updateMany({ where: { voteId: id }, data: { secretCount: 0 } });
    // Odśwież migawkę składu (przy ponownym otwarciu bierzemy aktualny stan)
    await tx.voteRoster.deleteMany({ where: { voteId: id } });
    await tx.voteRoster.createMany({
      data: rosterSorted.map((p, i) => ({
        voteId: id,
        userId: p.userId,
        lastName: p.user.lastName,
        firstName: p.user.firstName,
        clubShort: p.user.group?.shortName ?? null,
        hasVotingRight: p.hasVotingRight && !p.excludedFromVoteIds.includes(id),
        // Kworum = sprawdzenie obecności OD ZERA: nikt nie jest z góry obecny (obecność wynika z oddania głosu).
        // Pozostałe głosowania: migawka bieżącej obecności w chwili otwarcia.
        present: vote.type === "QUORUM" ? false : (p.attendance?.status === "PRESENT"),
        order: i,
      })),
    });
    await tx.vote.update({
      where: { id },
      data: {
        status: VoteStatus.OPEN,
        openedAt: new Date(),
        number: assignedNumber,
        resultEligibleCount: eligible.length,
        resultPresentCount: present.length,
        secretYes: 0, secretNo: 0, secretAbstain: 0, secretInvalid: 0,
        boothUserId: null, boothGrantedAt: null,
      },
    });
  });
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, status: e.status, message: e.message };
    throw e;
  }

  await audit({
    action: "VOTE_OPENED",
    description: `Otwarto głosowanie: ${vote.title}`,
    meetingId: vote.meetingId,
    userId,
    metadata: { voteId: vote.id, eligible: eligible.length, present: present.length },
  });

  publishToMeeting(vote.meetingId, { type: "vote.opened", voteId: vote.id });
  return { ok: true, number };
}
