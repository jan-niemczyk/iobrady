import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { VoteType, VoteVisibility } from "@prisma/client";

/**
 * GET /api/votes/[id]/counter
 *
 * Zwraca tylko AGREGATY - liczbę oddanych kart i ich rozkład.
 * Nie ujawnia, kto jak głosował. Dla głosowań jawnych szczegóły imienne
 * pojawiają się dopiero w raporcie po zamknięciu (/votes/[id]/report).
 *
 * Operator widzi liczbę kart pozostałą do oddania.
 * Uczestnik widzi tylko sumy oddanych głosów.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const vote = await prisma.vote.findUnique({
    where: { id },
    include: {
      options: { orderBy: { order: "asc" } },
      _count: { select: { ballots: true, secretMarkers: true } },
    },
  });
  if (!vote) return new NextResponse("Not found", { status: 404 });

  if (session.user.role !== "OPERATOR") {
    const mp = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: vote.meetingId, userId: session.user.id } },
    });
    if (!mp) return new NextResponse("Forbidden", { status: 403 });
  }

  const isSecret = vote.visibility === VoteVisibility.SECRET;
  // Dla tajnych (STANDARD i LISTA) liczba oddanych = markery; dla jawnych = ballots.
  const castCount = isSecret
    ? vote._count.secretMarkers
    : vote._count.ballots;

  let yes = 0, no = 0, abstain = 0, invalid = 0;
  let perOption: { id: string; label: string; count: number }[] = [];
  let packageOptions: { id: string; label: string; yes: number; no: number; abstain: number }[] = [];

  if (vote.type === VoteType.STANDARD) {
    if (isSecret) {
      // Tajne: bierzemy zbiorcze liczniki (nie ma indywidualnych ballotów).
      yes = vote.secretYes; no = vote.secretNo; abstain = vote.secretAbstain; invalid = vote.secretInvalid;
    } else {
      const grouped = await prisma.ballot.groupBy({
        by: ["choice"],
        where: { voteId: id, choice: { not: null } },
        _count: { _all: true },
      });
      for (const g of grouped) {
        if (g.choice === "YES") yes = g._count._all;
        else if (g.choice === "NO") no = g._count._all;
        else if (g.choice === "ABSTAIN") abstain = g._count._all;
      }
    }
  } else if (vote.type === VoteType.LIST) {
    if (isSecret) {
      // Tajna lista: głosy na kandydatów są w agregacie secretCount na opcji (bez powiązania kto).
      perOption = vote.options.map((o) => ({ id: o.id, label: o.label, count: o.secretCount }));
    } else {
      const grouped = await prisma.ballotSelection.groupBy({
        by: ["optionId"],
        where: { ballot: { voteId: id } },
        _count: { _all: true },
      });
      perOption = vote.options.map((o) => ({
        id: o.id,
        label: o.label,
        count: grouped.find((g) => g.optionId === o.id)?._count._all ?? 0,
      }));
    }
  } else if (vote.type === VoteType.PACKAGE) {
    // Pakiet: podgląd operatora - yes/no/abstain per pozycja (na żywo).
    if (isSecret) {
      packageOptions = vote.options.map((o) => ({ id: o.id, label: o.label, yes: o.secretYes, no: o.secretNo, abstain: o.secretAbstain }));
    } else {
      const grouped = await prisma.ballotSelection.groupBy({
        by: ["optionId", "choice"],
        where: { ballot: { voteId: id }, choice: { not: null } },
        _count: { _all: true },
      });
      packageOptions = vote.options.map((o) => {
        const rows = grouped.filter((g) => g.optionId === o.id);
        const get = (ch: string) => rows.find((r) => r.choice === ch)?._count._all ?? 0;
        return { id: o.id, label: o.label, yes: get("YES"), no: get("NO"), abstain: get("ABSTAIN") };
      });
    }
  }

  // C4: dla jawnych - mapa userId → bieżący głos (do podglądu i zerowania przez operatora).
  let castByUser: Record<string, { choice: string | null; optionIds: string[]; package: { optionId: string; choice: string | null }[] }> = {};
  if (!isSecret) {
    const ballots = await prisma.ballot.findMany({
      where: { voteId: id, userId: { not: null } },
      include: { selections: true },
    });
    castByUser = Object.fromEntries(ballots.map((b) => [b.userId!, {
      choice: b.choice ?? null,
      optionIds: b.selections.map((s) => s.optionId),
      package: b.selections.filter((s) => s.choice != null).map((s) => ({ optionId: s.optionId, choice: s.choice })),
    }]));
  }

  return NextResponse.json({
    voteId: vote.id,
    type: vote.type,
    visibility: vote.visibility,
    castByUser,
    eligibleCount: vote.resultEligibleCount ?? 0,
    presentCount: vote.resultPresentCount ?? 0,
    castCount,
    pendingCount: Math.max(0, (vote.resultPresentCount ?? 0) - castCount),
    yes, no, abstain, invalid,
    perOption,
    packageOptions,
  });
}
