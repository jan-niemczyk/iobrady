import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { comparePl } from "@/lib/sortPl";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDateTime } from "@/lib/labels";
import { NextResponse } from "next/server";

const CHOICE_LABEL: Record<string, string> = {
  YES: "za", NO: "przeciw", ABSTAIN: "wstrzymał się",
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const vote = await prisma.vote.findUnique({
    where: { id },
    include: {
      meeting: {
        include: {
          participants: {
            include: { user: { include: { group: true } }, attendance: true },
            orderBy: { user: { lastName: "asc" } },
          },
        },
      },
      options: { orderBy: { order: "asc" } },
      ballots: { include: { selections: true } },
      roster: true,
    },
  });
  if (!vote) return new NextResponse("Not found", { status: 404 });

  const isList = vote.type === "LIST";
  const isQuorum = vote.type === "QUORUM";
  const isPackage = vote.type === "PACKAGE";
  const isSecret = vote.visibility === "SECRET";

  // mapa ballotów po userId (dla zamkniętych SECRET userId są wyzerowane → mapa pusta)
  const ballotByUser = new Map<string, typeof vote.ballots[number]>();
  for (const b of vote.ballots) if (b.userId) ballotByUser.set(b.userId, b);

  // Migawka obecności i klubu z chwili głosowania (VoteRoster) - spójnie z wydrukiem PDF.
  const hasRoster = vote.roster.length > 0;
  const presentSnap = new Map<string, boolean>();
  const clubSnap = new Map<string, string | null>();
  for (const r of vote.roster) if (r.userId) { presentSnap.set(r.userId, r.present); clubSnap.set(r.userId, r.clubShort ?? null); }
  const rosterHasAnyPresent = vote.roster.some((r) => r.present);
  const useRosterPresence = hasRoster && rosterHasAnyPresent;
  const wasPresent = (p: { userId: string; attendance?: { status: string } | null }) =>
    isQuorum ? ballotByUser.has(p.userId)
    : useRosterPresence ? (presentSnap.get(p.userId) ?? (p.attendance?.status === "PRESENT"))
    : (p.attendance?.status === "PRESENT");

  const rows: (string | number | null | undefined | boolean)[][] = [
    ["Posiedzenie", vote.meeting.number, vote.meeting.name],
    ["Głosowanie", vote.title],
    ["Otwarte", vote.openedAt ? formatDateTime(vote.openedAt) : ""],
    ["Zamknięte", vote.closedAt ? formatDateTime(vote.closedAt) : ""],
    ["Typ", vote.type, "Widoczność", isSecret ? "Tajne" : "Jawne"],
    [],
  ];

  if (isSecret) {
    // Dla tajnych nie publikujemy listy imiennej - tylko agregaty.
    rows.push(["UWAGA", "Głosowanie tajne - głosów nie wiążemy z uczestnikami"]);
    rows.push([]);
    if (isList) {
      rows.push(["Kandydat / opcja", "Głosów ZA"]);
      vote.options.forEach((o) => rows.push([o.label, o.resultCount ?? 0]));
    } else {
      rows.push(["Za", "Przeciw", "Wstrzymało się", "Oddanych", "Uprawnieni", "Obecni"]);
      rows.push([vote.resultYes ?? 0, vote.resultNo ?? 0, vote.resultAbstain ?? 0, vote.resultCastCount ?? 0, vote.resultEligibleCount ?? 0, vote.resultPresentCount ?? 0]);
    }
    return csvResponse(`posiedzenie_${vote.meeting.number.replace(/[/\\]/g,"-")}_glosowanie_${vote.number ?? vote.id.slice(-6)}_tajne.csv`, toCsv(rows));
  }


  // Uczestnicy z prawem głosu, posortowani po polsku (Ł/Ó/Ż na właściwym miejscu).
  const voters = vote.meeting.participants
    .filter((p) => p.hasVotingRight)
    .sort((a, b) =>
      comparePl(a.user.lastName, b.user.lastName) || comparePl(a.user.firstName, b.user.firstName),
    );

  /** Klub zamrożony w chwili oddania głosu; dla niegłosujących - aktualny. */
  const clubOf = (p: (typeof voters)[number]) => {
    // Klub z migawki (roster) z chwili głosowania; potem z ballotu; na końcu bieżący.
    if (hasRoster && clubSnap.has(p.userId)) return clubSnap.get(p.userId) ?? "";
    const b = ballotByUser.get(p.userId);
    return b?.voterClubShort ?? p.user.group?.shortName ?? p.user.group?.name ?? "";
  };
  /** Status uczestnika bez oddanego głosu: obecny -> "ng.", nieobecny -> "nb." */
  const noVoteStatus = (p: (typeof voters)[number]) =>
    wasPresent(p) ? "ng." : "nb.";

  const absentCount = voters.filter((p) => !wasPresent(p)).length;

  // Imienne - układ jak w wydrukach Sejmu RP
  if (isList) {
    // kolumny: Lp. | Nazwisko | Imię | Klub | Kandydat 1 | Kandydat 2 | ... | Status
    const header = ["Lp.", "Nazwisko", "Imię", "Klub", ...vote.options.map((o) => o.label), "Status"];
    rows.push(header);

    voters.forEach((p, i) => {
      const ballot = ballotByUser.get(p.userId);
      const perCandidate = vote.options.map((o) =>
        ballot ? (ballot.selections.some((s) => s.optionId === o.id) ? "za" : "pr.") : "",
      );
      const status = ballot ? "głosował" : noVoteStatus(p);
      rows.push([i + 1, p.user.lastName, p.user.firstName, clubOf(p), ...perCandidate, status]);
    });
  } else if (isPackage) {
    // Pakiet: Lp | Nazwisko | Imię | Klub | Pozycja 1 | Pozycja 2 | ... | Status
    const header = ["Lp.", "Nazwisko", "Imię", "Klub", ...vote.options.map((o) => `${o.positionNumber ?? ""} ${o.label}`.trim()), "Status"];
    rows.push(header);
    const choiceShort = (c: string | null | undefined) => c === "YES" ? "za" : c === "NO" ? "pr." : c === "ABSTAIN" ? "ws." : "";
    voters.forEach((p, i) => {
      const ballot = ballotByUser.get(p.userId);
      const perPos = vote.options.map((o) => {
        const sel = ballot?.selections.find((s) => s.optionId === o.id);
        return choiceShort(sel?.choice);
      });
      const status = ballot ? "głosował" : noVoteStatus(p);
      rows.push([i + 1, p.user.lastName, p.user.firstName, clubOf(p), ...perPos, status]);
    });
  } else if (isQuorum) {
    rows.push(["Lp.", "Nazwisko", "Imię", "Klub", "Obecność"]);
    voters.forEach((p, i) => {
      rows.push([i + 1, p.user.lastName, p.user.firstName, clubOf(p),
        wasPresent(p) ? "ob." : "nb."]);
    });
  } else {
    // STANDARD
    rows.push(["Lp.", "Nazwisko", "Imię", "Klub", "Głos"]);
    voters.forEach((p, i) => {
      const ballot = ballotByUser.get(p.userId);
      const choice = ballot?.choice ? CHOICE_LABEL[ballot.choice] : noVoteStatus(p);
      rows.push([i + 1, p.user.lastName, p.user.firstName, clubOf(p), choice]);
    });
  }

  // Podsumowanie zbiorcze
  rows.push([]);
  rows.push(["PODSUMOWANIE"]);
  rows.push(["Uprawnionych", vote.resultEligibleCount ?? voters.length]);
  rows.push(["Obecnych", vote.resultPresentCount ?? (voters.length - absentCount)]);
  rows.push(["Nieobecnych", absentCount]);
  rows.push(["Głosujących", vote.resultCastCount ?? 0]);
  if (!isList && !isQuorum && !isPackage) {
    rows.push(["Za", vote.resultYes ?? 0]);
    rows.push(["Przeciw", vote.resultNo ?? 0]);
    rows.push(["Wstrzymało się", vote.resultAbstain ?? 0]);
  }
  if (isPackage) {
    rows.push([]);
    rows.push(["WYNIKI POZYCJI"]);
    rows.push(["Nr", "Pozycja", "Za", "Przeciw", "Wstrzymało się"]);
    vote.options.forEach((o) => {
      rows.push([o.positionNumber ?? "", o.label, o.resultYes ?? o.secretYes ?? 0, o.resultNo ?? o.secretNo ?? 0, o.resultAbstain ?? o.secretAbstain ?? 0]);
    });
  }
  rows.push([]);
  rows.push(["Legenda", "ng. - obecny, nie oddał głosu", "nb. - nieobecny"]);

  return csvResponse(`posiedzenie_${vote.meeting.number.replace(/[/\\]/g,"-")}_glosowanie_${vote.number ?? vote.id.slice(-6)}.csv`, toCsv(rows));
}
