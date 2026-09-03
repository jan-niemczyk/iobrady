import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { VoteReport, type VoteMark } from "@/components/operator/VoteReport";
import { RecomputeMajority } from "@/components/operator/RecomputeMajority";
import { formatDateTime } from "@/lib/labels";
import { meetingNameWithDate } from "@/lib/meetingName";

export const dynamic = "force-dynamic";

interface PersonRow {
  lastName: string;
  firstName: string;
  mark?: VoteMark;
  perCandidate?: VoteMark[];
}

export default async function VoteReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const vote = await prisma.vote.findUnique({
    where: { id },
    include: {
      meeting: {
        include: {
          participants: {
            include: { user: { include: { group: true } }, attendance: true },
          },
        },
      },
      agendaItem: true,
      options: { orderBy: { order: "asc" } },
      ballots: { include: { selections: true } },
    },
  });
  if (!vote) notFound();

  const isList = vote.type === "LIST";
  const isQuorum = vote.type === "QUORUM";
  const isSecret = vote.visibility === "SECRET";

  // Mapa ballotów po userId - dla głosowań tajnych userId=null po anonimizacji,
  // więc mapa będzie pusta. Lista imienna nie zostanie pokazana (przekazujemy `secret`).
  const ballotByUser = new Map<string, typeof vote.ballots[number]>();
  for (const b of vote.ballots) {
    if (b.userId) ballotByUser.set(b.userId, b);
  }

  // Pogrupuj uczestników po klubach
  const groupMap = new Map<string, {
    name: string; shortName: string;
    members: typeof vote.meeting.participants;
  }>();
  const NO_GROUP_KEY = "__noGroup";
  for (const mp of vote.meeting.participants) {
    if (!mp.hasVotingRight) continue;
    const key = mp.user.group?.id ?? NO_GROUP_KEY;
    const sn = mp.user.group?.shortName ?? mp.user.group?.name ?? "niez.";
    const name = mp.user.group?.name ?? "Niezrzeszeni";
    const g = groupMap.get(key) ?? { name, shortName: sn, members: [] };
    g.members.push(mp);
    groupMap.set(key, g);
  }

  // Per-grupa sekcja
  const groups = Array.from(groupMap.values()).map((g) => {
    const people: PersonRow[] = [];
    let yes = 0, no = 0, abstain = 0, participated = 0, notVoted = 0;

    for (const mp of g.members.sort((a, b) => a.user.lastName.localeCompare(b.user.lastName, "pl"))) {
      const ballot = ballotByUser.get(mp.userId);
      let row: PersonRow = { lastName: mp.user.lastName, firstName: mp.user.firstName };

      if (isQuorum) {
        const present = mp.attendance?.status === "PRESENT";
        row.mark = present ? "present" : "absent";
        if (present) participated++; else notVoted++;
      } else if (isList) {
        if (!ballot) { row.mark = "absent"; notVoted++; }
        else {
          // dla każdej opcji: yes jeśli wybrana, no jeśli nie
          row.perCandidate = vote.options.map((o) =>
            ballot.selections.some((s) => s.optionId === o.id) ? "yes" : "no",
          );
          participated++;
        }
      } else {
        if (!ballot || !ballot.choice) { row.mark = "absent"; notVoted++; }
        else {
          if (ballot.choice === "YES") { row.mark = "yes"; yes++; participated++; }
          else if (ballot.choice === "NO") { row.mark = "no"; no++; participated++; }
          else { row.mark = "abstain"; abstain++; participated++; }
        }
      }
      people.push(row);
    }

    return {
      name: g.name,
      shortName: g.shortName,
      membersCount: g.members.length,
      participated,
      yes: isList || isQuorum ? undefined : yes,
      no: isList || isQuorum ? undefined : no,
      abstain: isList || isQuorum ? undefined : abstain,
      notVoted,
      people,
    };
  }).sort((a, b) => b.membersCount - a.membersCount);

  // Sumy globalne - dla SECRET bierzemy ze snapshotu z bazy (anonimizacja zerowała userId
  // więc mapowanie grupowe da same "nie głosowali", co byłoby mylące).
  const totals = isSecret
    ? {
        participated: vote.resultCastCount ?? 0,
        notVoted: (vote.resultPresentCount ?? 0) - (vote.resultCastCount ?? 0),
        yes: vote.resultYes ?? 0,
        no: vote.resultNo ?? 0,
        abstain: vote.resultAbstain ?? 0,
      }
    : groups.reduce(
        (acc, g) => ({
          participated: acc.participated + g.participated,
          notVoted: acc.notVoted + g.notVoted,
          yes: acc.yes + (g.yes ?? 0),
          no: acc.no + (g.no ?? 0),
          abstain: acc.abstain + (g.abstain ?? 0),
        }),
        { participated: 0, notVoted: 0, yes: 0, no: 0, abstain: 0 },
      );

  // Per-kandydat (dla LIST) - z snapshotu options.resultCount jeśli SECRET zamiast ballots
  const candidatesSummary = isList
    ? vote.options.map((o) => ({
        label: o.label,
        yesCount: isSecret
          ? (o.resultCount ?? 0)
          : vote.ballots.reduce(
              (n, b) => n + (b.selections.some((s) => s.optionId === o.id) ? 1 : 0),
              0,
            ),
      }))
    : undefined;

  // Większość pokazujemy tylko gdy faktycznie wybrano coś innego niż SIMPLE
  let absoluteMajority: number | undefined;
  if (vote.majorityKind === "ABSOLUTE") {
    absoluteMajority = Math.floor(totals.participated / 2) + 1;
  } else if (vote.majorityKind === "QUALIFIED_TWO_THIRDS") {
    absoluteMajority = Math.ceil((2 * totals.participated) / 3);
  } else if (vote.majorityKind === "QUALIFIED_THREE_FIFTHS") {
    absoluteMajority = Math.ceil((3 * totals.participated) / 5);
  }
  // SIMPLE → undefined (nie pokazujemy progu)

  // Pobieram ustawienia globalne dla ukrycia belki klubów gdy wyłączone
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const showGroups = settings?.groupsEnabled !== false;

  // Nieobecni (nb) vs niegłosujący obecni (ng). Nieobecni = uczestnicy bez potwierdzonej obecności.
  const allParticipants = await prisma.meetingParticipant.findMany({
    where: { meetingId: vote.meetingId },
    include: { attendance: true },
  });
  const totalAbsent = allParticipants.filter((mp) => mp.attendance?.status !== "PRESENT").length;
  // Niegłosujący obecni = obecni − ci, którzy oddali głos.
  const presentCount = allParticipants.length - totalAbsent;
  const notVotedPresent = Math.max(0, presentCount - totals.participated);

  return (
    <div className="px-6 py-8" style={{ background: "var(--color-paper)" }}>
      <VoteReport
        agendaLabel={
          vote.agendaItem
            ? `Pkt ${vote.agendaItem.number}. ${vote.agendaItem.title}`
            : (vote.contextLabel ?? vote.meeting.name)
        }
        meetingTitle={meetingNameWithDate(vote.meeting.name, vote.meeting.scheduledAt)}
        organizationName={settings?.organizationName ?? undefined}
        meetingNumber={vote.meeting.number}
        voteNumber={vote.number ?? vote.id.slice(-6).toUpperCase()}
        timestamp={vote.closedAt ?? vote.openedAt ?? new Date()}
        itemTitle={vote.title}
        description={vote.description ?? undefined}
        kind={isList ? "list" : isQuorum ? "quorum" : "standard"}
        visibility={isSecret ? "secret" : "open"}
        showGroups={showGroups}
        totalParticipated={totals.participated}
        totalNotVoted={notVotedPresent}
        totalAbsent={totalAbsent}
        totalYes={!isList && !isQuorum ? totals.yes : undefined}
        totalNo={!isList && !isQuorum ? totals.no : undefined}
        totalAbstain={!isList && !isQuorum ? totals.abstain : undefined}
        absoluteMajority={absoluteMajority}
        majorityLabel={
          vote.majorityKind === "ABSOLUTE" ? "WIĘKSZOŚĆ BEZWZGLĘDNA"
          : vote.majorityKind === "QUALIFIED_TWO_THIRDS" ? "WIĘKSZOŚĆ 2/3"
          : vote.majorityKind === "QUALIFIED_THREE_FIFTHS" ? "WIĘKSZOŚĆ 3/5"
          : undefined
        }
        candidates={isList ? vote.options.map((o) => o.label) : undefined}
        candidatesSummary={candidatesSummary}
        groups={isSecret ? [] : groups}
      />

      <p className="text-center mt-6 text-xs" style={{ color: "var(--color-ink-3)" }}>
        Wygenerowano: <span className="mono">{formatDateTime(new Date())}</span>
      </p>

      {!isList && !isQuorum && (
        <div className="no-print" style={{ maxWidth: 920, margin: "16px auto 0" }}>
          <RecomputeMajority
            voteId={vote.id}
            currentKind={vote.majorityKind}
            currentBase={vote.majorityBase}
          />
        </div>
      )}
    </div>
  );
}
