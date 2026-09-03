import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { comparePl } from "@/lib/sortPl";
import { NextResponse } from "next/server";
import { VoteStatus } from "@prisma/client";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const vote = await prisma.vote.findUnique({ where: { id }, include: { meeting: true } });
  if (!vote) return new NextResponse("Not found", { status: 404 });

  if (vote.status !== VoteStatus.READY && vote.status !== VoteStatus.DRAFT)
    return new NextResponse(`Nie można otworzyć - głosowanie w statusie ${vote.status}`, { status: 400 });

  // sprawdź, czy nie ma już otwartego głosowania w tym posiedzeniu
  const otherOpen = await prisma.vote.findFirst({
    where: { meetingId: vote.meetingId, status: VoteStatus.OPEN, NOT: { id: vote.id } },
  });
  if (otherOpen)
    return new NextResponse("Inne głosowanie jest aktywne - zamknij je najpierw", { status: 400 });

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

  // Nadaj numer głosowania, jeśli go jeszcze nie ma (READY → OPEN dla planowanych głosowań).
  let assignedNumber: number | null = vote.number;
  if (assignedNumber == null) {
    const lastNumbered = await prisma.vote.findFirst({
      where: { meetingId: vote.meetingId, number: { not: null } },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    assignedNumber = (lastNumbered?.number ?? 0) + 1;
  }

  await prisma.$transaction(async (tx) => {
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
      },
    });
  });

  await audit({
    action: "VOTE_OPENED",
    description: `Otwarto głosowanie: ${vote.title}`,
    meetingId: vote.meetingId,
    userId: session.user.id,
    metadata: { voteId: vote.id, eligible: eligible.length, present: present.length },
  });

  publishToMeeting(vote.meetingId, { type: "vote.opened", voteId: vote.id });
  return NextResponse.json({ ok: true });
}
