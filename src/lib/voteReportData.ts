import { prisma } from "@/lib/db";
import { meetingNameWithDate } from "@/lib/meetingName";
import type { ReportData, ReportGroup, ReportPerson } from "@/lib/reportTypes";

export type { ReportData, ReportGroup, ReportPerson, ReportMark } from "@/lib/reportTypes";

// Krótka etykieta większości do wydruku (styl Sejmu).
function majShortLabel(kind: string): string {
  switch (kind) {
    case "ABSOLUTE": return "WIĘKSZOŚĆ BEZWZGLĘDNA";
    case "QUALIFIED_TWO_THIRDS": return "WIĘKSZOŚĆ 2/3";
    case "QUALIFIED_THREE_FIFTHS": return "WIĘKSZOŚĆ 3/5";
    default: return "WIĘKSZOŚĆ";
  }
}

function buildSummaryLine(o: {
  isList: boolean; isQuorum: boolean;
  participated: number; notVotedPresent: number; absent: number;
  yes: number; no: number; abstain: number;
  absoluteMajority?: number; majorityLabel?: string;
}): { line: string; parts: string[]; majority?: string } {
  const parts: string[] = [];
  let majority: string | undefined;
  if (o.isQuorum) {
    parts.push(`OBECNYCH - ${o.participated}`);
    parts.push(`NIEOBECNI - ${o.absent}`);
  } else if (o.isList) {
    parts.push(`GŁOSOWAŁO - ${o.participated}`);
    parts.push(`NIE GŁOSOWAŁO - ${o.notVotedPresent}`);
    parts.push(`NIEOBECNI - ${o.absent}`);
    if (o.absoluteMajority != null) majority = `${(o.majorityLabel ?? "WIĘKSZOŚĆ")} - ${o.absoluteMajority}`;
  } else {
    parts.push(`GŁOSOWAŁO - ${o.participated}`);
    parts.push(`ZA - ${o.yes}`);
    parts.push(`PRZECIW - ${o.no}`);
    parts.push(`WSTRZYMAŁO SIĘ - ${o.abstain}`);
    parts.push(`NIE GŁOSOWAŁO - ${o.notVotedPresent}`);
    parts.push(`NIEOBECNI - ${o.absent}`);
    if (o.absoluteMajority != null) majority = `${(o.majorityLabel ?? "WIĘKSZOŚĆ BEZWZGLĘDNA")} - ${o.absoluteMajority}`;
  }
  return { line: parts.join("   "), parts, majority };
}

/** Buduje komplet danych raportu jednego głosowania (format zbliżony do wydruków Sejmu). */
export async function buildVoteReportData(voteId: string): Promise<ReportData | null> {
  const vote = await prisma.vote.findUnique({
    where: { id: voteId },
    include: {
      meeting: { include: { participants: { include: { user: { include: { group: true } }, attendance: true } } } },
      agendaItem: true,
      options: { orderBy: { order: "asc" } },
      ballots: { include: { selections: true } },
      roster: true,
    },
  });
  if (!vote) return null;

  const isList = vote.type === "LIST";
  const isQuorum = vote.type === "QUORUM";
  const isSecret = vote.visibility === "SECRET";

  const ballotByUser = new Map<string, typeof vote.ballots[number]>();
  for (const b of vote.ballots) if (b.userId) ballotByUser.set(b.userId, b);

  // Stan obecności na chwilę głosowania - ze snapshotu (VoteRoster.present) zapisanego przy otwarciu.
  const hasRoster = vote.roster.length > 0;
  const presentByUser = new Map<string, boolean>();
  const clubByUser = new Map<string, string | null>();
  for (const r of vote.roster) if (r.userId) { presentByUser.set(r.userId, r.present); clubByUser.set(r.userId, r.clubShort ?? null); }
  // Zabezpieczenie: jeśli migawka rostera istnieje, ale NIKT nie jest w niej obecny (np. głosowanie
  // otwarto zanim potwierdzono obecność), migawka jest bezużyteczna - wtedy dla głosowań innych niż
  // kworum bierzemy bieżącą obecność (attendance.status), aby nie pokazywać wszystkich jako nieobecnych.
  const rosterHasAnyPresent = vote.roster.some((r) => r.present);
  const useRosterPresence = hasRoster && rosterHasAnyPresent;
  // Kworum jest SPECJALNYM głosowaniem = samodzielne sprawdzenie obecności liczone OD ZERA.
  // Obecny w kworum = ten, kto oddał w nim głos. Nie dziedziczymy wcześniejszej obecności/rostera.
  const isPresent = (mp: { userId: string; attendance?: { status: string } | null }) =>
    isQuorum
      ? ballotByUser.has(mp.userId)
      : useRosterPresence
        ? (presentByUser.get(mp.userId) ?? (mp.attendance?.status === "PRESENT"))
        : (mp.attendance?.status === "PRESENT");

  // Nieobecni (nb) - uczestnicy z prawem głosu nieobecni w chwili głosowania.
  const votingParticipants = vote.meeting.participants.filter((mp) => mp.hasVotingRight);
  const totalAbsent = votingParticipants.filter((mp) => !isPresent(mp)).length;

  const NO = "__noGroup";
  const groupMap = new Map<string, { shortName: string; members: typeof vote.meeting.participants }>();
  for (const mp of votingParticipants) {
    // Klub z MIGAWKI (roster) z chwili głosowania; gdy brak migawki - bieżący klub uczestnika.
    const snapClub = hasRoster ? (clubByUser.get(mp.userId) ?? null) : (mp.user.group?.shortName ?? mp.user.group?.name ?? null);
    const key = snapClub ?? NO;
    const sn = snapClub ?? "niez.";
    const g = groupMap.get(key) ?? { shortName: sn, members: [] };
    g.members.push(mp);
    groupMap.set(key, g);
  }

  const groups: ReportGroup[] = Array.from(groupMap.values()).map((g) => {
    let yes = 0, no = 0, abstain = 0, participated = 0, notVoted = 0, absent = 0;
    const voters: ReportPerson[] = [];   // obecni (głosujący + niegłosujący)
    const absentees: ReportPerson[] = []; // nieobecni - na końcu bloku
    const excluded: ReportPerson[] = []; // wykluczeni z posiedzenia - osobna lista

    for (const mp of g.members) {
      const present = isPresent(mp);
      const ballot = ballotByUser.get(mp.userId);
      const person: ReportPerson = { lastName: mp.user.lastName, firstName: mp.user.firstName, present };

      // Wykluczony z posiedzenia - nie liczy się do głosowania; osobna lista + znacznik.
      if ((mp as { excludedFromMeeting?: boolean }).excludedFromMeeting) {
        person.mark = "wykl.";
        excluded.push(person);
        continue;
      }

      if (!present) {
        // Nieobecny na chwilę głosowania - znacznik „nb." (nieobecny), na koniec bloku.
        person.mark = "nb.";
        absent++;
        absentees.push(person);
        continue;
      }

      if (isQuorum || isSecret) {
        // Kworum i głosowania tajne: pokazujemy tylko obecność (bez treści głosu).
        person.mark = "ob."; participated++;
      } else if (vote.type === "PACKAGE") {
        // Pakiet: dla każdej pozycji zapisujemy głos (za/pr./ws./ng.) danej osoby.
        if (!ballot) { person.mark = "ng."; person.perPosition = vote.options.map(() => "ng."); notVoted++; }
        else {
          person.perPosition = vote.options.map((o) => {
            const sel = ballot.selections.find((s) => s.optionId === o.id);
            if (!sel || !sel.choice) return "ng.";
            return sel.choice === "YES" ? "za" : sel.choice === "NO" ? "pr." : "ws.";
          });
          person.mark = "ob."; participated++;
        }
      } else if (isList) {
        if (!ballot) { person.mark = "ng."; notVoted++; }
        else { person.perCandidate = vote.options.map((o) => ballot.selections.some((s) => s.optionId === o.id) ? "za" : "pr."); participated++; }
      } else {
        if (!ballot || !ballot.choice) { person.mark = "ng."; notVoted++; }
        else if (ballot.choice === "YES") { person.mark = "za"; yes++; participated++; }
        else if (ballot.choice === "NO") { person.mark = "pr."; no++; participated++; }
        else { person.mark = "ws."; abstain++; participated++; }
      }
      voters.push(person);
    }

    const isPackage = vote.type === "PACKAGE";
    const alpha = (a: typeof voters[number], b: typeof voters[number]) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "pl");

    let people: typeof voters;
    if (isSecret) {
      // Tajne (także pakiet/lista): pokazujemy tylko obecność, bez treści głosu.
      // Sortowanie: obecni (ob.) przed nieobecnymi (nb.), w obrębie - alfabetycznie.
      const presenceRank: Record<string, number> = { "ob.": 1, "za": 1, "pr.": 1, "ws.": 1, "ng.": 1, "nb.": 2 };
      people = [...voters, ...absentees].sort((a, b) => {
        const ra = presenceRank[a.mark ?? "nb."] ?? 2, rb = presenceRank[b.mark ?? "nb."] ?? 2;
        if (ra !== rb) return ra - rb;
        return alpha(a, b);
      });
      excluded.sort(alpha);
      people = [...people, ...excluded];
    } else if (isList) {
      // Lista: w obrębie klubu wyłącznie alfabetycznie (obecni i nieobecni razem, alfabetycznie).
      people = [...voters, ...absentees, ...excluded].sort(alpha);
    } else if (isPackage) {
      // Pakiet: najpierw głosujący (ob.) przed niegłosującymi/nieobecnymi, potem alfabetycznie.
      const rank: Record<string, number> = { "ob.": 1, "ng.": 2, "nb.": 3 };
      voters.sort((a, b) => {
        const ra = rank[a.mark ?? "ng."] ?? 2, rb = rank[b.mark ?? "ng."] ?? 2;
        if (ra !== rb) return ra - rb;
        return alpha(a, b);
      });
      absentees.sort(alpha);
      excluded.sort(alpha);
      people = [...voters, ...absentees, ...excluded];
    } else {
      // Zwykłe/kworum: najpierw wg oddanego głosu (za, pr., ws., ng.), potem alfabetycznie.
      const markRank: Record<string, number> = { "za": 1, "ob.": 1, "pr.": 2, "ws.": 3, "ng.": 4, "nb.": 5 };
      voters.sort((a, b) => {
        const ra = markRank[a.mark ?? "ng."] ?? 5, rb = markRank[b.mark ?? "ng."] ?? 5;
        if (ra !== rb) return ra - rb;
        return alpha(a, b);
      });
      absentees.sort(alpha);
      excluded.sort(alpha);
      people = [...voters, ...absentees, ...excluded];
    }

    return {
      shortName: g.shortName, membersCount: g.members.length - excluded.length, participated,
      yes: isList || isQuorum ? undefined : yes,
      no: isList || isQuorum ? undefined : no,
      abstain: isList || isQuorum ? undefined : abstain,
      notVoted, absent,
      people,
    };
  }).sort((a, b) => {
    // "Niez." (niezrzeszeni) zawsze na końcu; pozostałe kluby wg liczebności malejąco.
    const aNiez = a.shortName.toLowerCase().startsWith("niez");
    const bNiez = b.shortName.toLowerCase().startsWith("niez");
    if (aNiez !== bNiez) return aNiez ? 1 : -1;
    return b.membersCount - a.membersCount;
  });

  // Globalna lista wykluczonych z posiedzenia (osobna sekcja w raporcie).
  const excludedList: { lastName: string; firstName: string; groupShort?: string | null }[] = [];
  for (const g of Array.from(groupMap.values())) {
    for (const mp of g.members) {
      if ((mp as { excludedFromMeeting?: boolean }).excludedFromMeeting) {
        excludedList.push({ lastName: mp.user.lastName, firstName: mp.user.firstName, groupShort: g.shortName });
      }
    }
  }
  excludedList.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "pl"));

  const totals = isSecret
    ? { participated: vote.resultCastCount ?? 0, notVoted: (vote.resultPresentCount ?? 0) - (vote.resultCastCount ?? 0), yes: vote.resultYes ?? 0, no: vote.resultNo ?? 0, abstain: vote.resultAbstain ?? 0 }
    : groups.reduce((a, g) => ({ participated: a.participated + g.participated, notVoted: a.notVoted + g.notVoted, yes: a.yes + (g.yes ?? 0), no: a.no + (g.no ?? 0), abstain: a.abstain + (g.abstain ?? 0) }), { participated: 0, notVoted: 0, yes: 0, no: 0, abstain: 0 });

  let absoluteMajority: number | undefined;
  if (vote.majorityKind === "ABSOLUTE") absoluteMajority = Math.floor(totals.participated / 2) + 1;
  else if (vote.majorityKind === "QUALIFIED_TWO_THIRDS") absoluteMajority = Math.ceil((2 * totals.participated) / 3);
  else if (vote.majorityKind === "QUALIFIED_THREE_FIFTHS") absoluteMajority = Math.ceil((3 * totals.participated) / 5);

  const candidatesSummary = isList
    ? vote.options.map((o) => ({
        label: o.label,
        yesCount: isSecret ? (o.resultCount ?? 0) : vote.ballots.reduce((n, b) => n + (b.selections.some((s) => s.optionId === o.id) ? 1 : 0), 0),
      }))
    : undefined;

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const groupsEnabled = settings?.groupsEnabled === true;
  // Gdy kluby wyłączone - nie pokazujemy skrótu klubu przy wykluczonych.
  if (!groupsEnabled) for (const e of excludedList) e.groupShort = null;
  const majLabelText = absoluteMajority != null ? majShortLabel(vote.majorityKind) : undefined;

  const summary = buildSummaryLine({
    isList, isQuorum,
    participated: totals.participated,
    notVotedPresent: totals.notVoted,
    absent: totalAbsent,
    yes: totals.yes, no: totals.no, abstain: totals.abstain,
    absoluteMajority, majorityLabel: majLabelText,
  });

  // Dokładny czas z sekundami zakończenia głosowania.
  const ts = vote.closedAt ?? vote.openedAt ?? new Date();
  const timestamp = new Date(ts).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Europe/Warsaw",
  });

  // Kontekst: dla punktu numerowanego „Pkt N. tytuł"; dla punktu BEZ numeru (unnumbered) sam tytuł
  // z myślnikiem zamiast „Pkt ."; dla ad hoc - tekst z ustawień głosowania albo nazwa posiedzenia z datą.
  const ai = vote.agendaItem as { number?: string; title?: string; unnumbered?: boolean } | null;
  const contextLabel = ai
    ? (ai.unnumbered ? `- ${ai.title}` : `Pkt ${ai.number}. ${ai.title}`)
    : (vote.contextLabel?.trim() || meetingNameWithDate(vote.meeting.name, vote.meeting.scheduledAt));

  // Gdy podział na kluby wyłączony - jedna zbiorcza „grupa" bez nazwy klubu.
  // Głosowania tajne: pokazujemy listę obecnych/nieobecnych (jak w kworum), bez treści głosów.
  const outGroups = groupsEnabled ? groups : mergeToSingleGroup(groups);

  return {
    organizationName: settings?.organizationName ?? undefined,
    meetingTitle: meetingNameWithDate(vote.meeting.name, vote.meeting.scheduledAt),
    meetingNumber: vote.meeting.number,
    voteNumber: vote.number ?? vote.id.slice(-6).toUpperCase(),
    timestamp,
    contextLabel,
    voteTitle: vote.title,
    description: vote.description ?? undefined,
    summaryLine: summary.line,
    summaryParts: summary.parts,
    majorityPart: summary.majority,
    isList, isQuorum, isSecret,
    // Lista: osoby które oddały głos, ale były PRZECIW wszystkim (perCandidate bez żadnego "za").
    againstAllCount: isList
      ? [...groups].flatMap((g) => g.people).filter((p) =>
          p.perCandidate && p.perCandidate.length > 0 && p.perCandidate.every((m) => m !== "za") && p.mark !== "nb." && p.mark !== "ng." && p.mark !== "wykl.",
        ).length
      : undefined,
    excludedList: excludedList.length > 0 ? excludedList : undefined,
    isPackage: vote.type === "PACKAGE",
    requireAllPositions: vote.requireAllPositions,
    packagePositions: vote.type === "PACKAGE"
      ? vote.options.map((o, i) => {
          // Tajny pakiet: liczby z anonimowych liczników secret*. Jawny: z result*.
          // Uwaga: nie używamy ?? (0 to poprawna wartość, nie brak), tylko wyboru wg tajności.
          const y = isSecret ? (o.secretYes ?? 0) : (o.resultYes ?? 0);
          const n = isSecret ? (o.secretNo ?? 0) : (o.resultNo ?? 0);
          const a = isSecret ? (o.secretAbstain ?? 0) : (o.resultAbstain ?? 0);
          return { positionNumber: o.positionNumber ?? String(i + 1), label: o.label, yes: y, no: n, abstain: a, glosowalo: y + n + a };
        })
      : undefined,
    candidatesCount: isList ? vote.options.length : undefined,
    candidates: isList ? vote.options.map((o) => o.label) : undefined,
    candidatesSummary,
    groups: outGroups,
    groupsEnabled,
  };
}

// Scala wszystkie kluby w jedną listę (gdy podział klubowy wyłączony).
function mergeToSingleGroup(groups: ReportGroup[]): ReportGroup[] {
  if (groups.length === 0) return [];
  const all = groups.flatMap((g) => g.people);
  return [{
    shortName: "",
    membersCount: groups.reduce((s, g) => s + g.membersCount, 0),
    participated: groups.reduce((s, g) => s + g.participated, 0),
    yes: groups.every((g) => g.yes === undefined) ? undefined : groups.reduce((s, g) => s + (g.yes ?? 0), 0),
    no: groups.every((g) => g.no === undefined) ? undefined : groups.reduce((s, g) => s + (g.no ?? 0), 0),
    abstain: groups.every((g) => g.abstain === undefined) ? undefined : groups.reduce((s, g) => s + (g.abstain ?? 0), 0),
    notVoted: groups.reduce((s, g) => s + g.notVoted, 0),
    absent: groups.reduce((s, g) => s + g.absent, 0),
    people: all,
  }];
}
