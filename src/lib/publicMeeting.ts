import { prisma } from "@/lib/db";
import { formatMajority } from "@/lib/majority";
import { comparePl } from "@/lib/sortPl";
import type { MajorityBase, MajorityKind, VoteStatus } from "@prisma/client";

/**
 * Dane publicznego widoku posiedzenia (/public/[meetingId]) - wyłącznie treści udostępnione publicznie:
 * porządek obrad (bez pozycji ukrytych na prezentacji), publiczne załączniki, głosowania zakończone
 * (oraz informacja o trwającym głosowaniu - bez żadnych liczników).
 *
 * Zasady:
 * - wyniki i rozstrzygnięcie z wartości zapisanych przy zamknięciu (logika większości i kworum systemu),
 * - obecność, prawo głosu i klub z MIGAWKI składu z chwili otwarcia głosowania (VoteRoster),
 * - głosowanie tajne: tylko „oddał / nie oddał głosu” (SecretBallotMarker), bez treści głosu
 *   i bez wyników według klubów,
 * - do przeglądarki nie trafiają identyfikatory kont ani dane operatora.
 */

export type PublicPersonStatus = "YES" | "NO" | "ABSTAIN" | "VOTED" | "NOT_VOTED" | "ABSENT";

export interface PublicPerson {
  lastName: string;
  firstName: string;
  /** Skrót klubu / koła z migawki głosowania; null = bez przynależności. */
  club: string | null;
  status: PublicPersonStatus;
  /** Formy żeńskie określeń (ustawienie osoby). */
  female?: boolean;
  /** Głosowanie na listę (jawne): wskazane kandydatury. */
  selected?: string[];
  /** Pakiet (jawny): głos przy kolejnych pozycjach (YES/NO/ABSTAIN/null). */
  positions?: (("YES" | "NO" | "ABSTAIN") | null)[];
}

export interface PublicOptionResult {
  label: string;
  positionNumber?: string | null;
  /** Lista: głosy za kandydaturą. */
  count?: number;
  /** Pakiet: wyniki pozycji. */
  yes?: number; no?: number; abstain?: number;
  passed?: boolean | null;
}

/** Punkt porządku obrad głosowania (osobne pole - nie doklejamy go do przedmiotu głosowania). */
export interface PublicVoteItem {
  id: string;
  /** Numer punktu; null dla pozycji bez numeru. */
  number: string | null;
  title: string;
  isSubItem: boolean;
}

export interface PublicVoteSummary {
  id: string;
  number: number | null;
  /** Przedmiot głosowania (zapisana treść głosowania). */
  title: string;
  description: string | null;
  agendaItemId: string | null;
  item: PublicVoteItem | null;
  /** Głosowanie bez punktu: własny opis kontekstu z ustawień głosowania. */
  contextLabel: string | null;
  status: VoteStatus;
  type: "STANDARD" | "LIST" | "QUORUM" | "PACKAGE";
  secret: boolean;
  booth: boolean;
  time: string | null; // ISO zakończenia (albo rozpoczęcia)
  /** Wynik do listy i nagłówka (null, gdy głosowanie nie zakończone). */
  result: {
    cast: number; present: number | null; eligible: number | null;
    yes?: number; no?: number; abstain?: number; invalid?: number;
    options?: PublicOptionResult[];
  } | null;
  /** Rozstrzygnięcie zapisane w systemie (np. „Przyjęto”, „Kworum potwierdzone”); null - brak. */
  decision: { label: string; positive: boolean } | null;
  majority: string | null;
}

export interface PublicVoteDetail extends PublicVoteSummary {
  people: PublicPerson[];
  /** Uczestnictwo: obecni uprawnieni w chwili OTWARCIA głosowania (migawka) i ich udział. */
  participation: {
    presentAtOpen: number | null;
    votedPresentAtOpen: number;
    notVotedPresentAtOpen: number;
    /** Głosy osób, które w chwili otwarcia nie były oznaczone jako obecne (obecność potwierdzona później). */
    votedJoinedLater: number;
  } | null;
  prev: { id: string; number: number | null } | null;
  next: { id: string; number: number | null } | null;
  /** Obecność z chwili głosowania jest zapisana (migawka składu z obecnymi). */
  presenceKnown: boolean;
  /** Przynależność pochodzi z migawki głosowania (a nie z bieżących danych). */
  clubsFromSnapshot: boolean;
  groupsEnabled: boolean;
  clubNames: Record<string, string>;
}

export interface PublicAgendaItem {
  id: string;
  number: string;
  unnumbered: boolean;
  isSubItem: boolean;
  title: string;
  /** Status punktu (zakończony - także oznaczony ręcznie, bez godzin przebiegu). */
  status: string;
  presenter: string | null;
  committee: string | null;
  attachments: { id: string; fileName: string; sizeBytes: number }[];
}

export interface PublicMeeting {
  id: string;
  organization: string;
  logoUrl: string | null;
  name: string;
  number: string;
  scheduledAt: string;
  location: string | null;
  status: string;
  active: boolean;
  agenda: PublicAgendaItem[];
  meetingAttachments: { id: string; fileName: string; sizeBytes: number }[];
  votes: PublicVoteSummary[];
}

const SHOWN_STATUSES: VoteStatus[] = ["OPEN", "CLOSED", "INTERRUPTED", "CANCELLED", "IRRELEVANT"];

type VoteRow = Awaited<ReturnType<typeof loadVotes>>[number];

function loadVotes(meetingId: string, voteId?: string) {
  return prisma.vote.findMany({
    where: { meetingId, status: { in: SHOWN_STATUSES }, ...(voteId ? { id: voteId } : {}) },
    orderBy: [{ number: "asc" }, { openedAt: "asc" }],
    include: { options: { orderBy: { order: "asc" } } },
  });
}

function decisionOf(v: VoteRow): PublicVoteSummary["decision"] {
  if (v.status !== "CLOSED") return null;
  if (v.type === "QUORUM") {
    // Rozstrzygnięcie głosowania kworum zapisane przy zamknięciu (resultPassed = wynik liczenia).
    const met = v.resultPassed ?? v.resultQuorumMet;
    return met == null ? null : { label: met ? "Kworum potwierdzone" : "Brak kworum", positive: met };
  }
  if (v.type === "LIST" || v.type === "PACKAGE") return null; // rozstrzygnięcia przy pozycjach / kandydaturach
  if (v.resultPassed == null) return null;
  return { label: v.resultPassed ? "Przyjęto" : "Odrzucono", positive: v.resultPassed };
}

type ItemRow = { id: string; number: string; unnumbered: boolean; isSubItem: boolean; title: string };

function itemOf(items: Map<string, ItemRow>, id: string | null): PublicVoteItem | null {
  const a = id ? items.get(id) : undefined;
  if (!a) return null;
  return { id: a.id, number: a.unnumbered || !a.number?.trim() ? null : a.number.trim(), title: a.title, isSubItem: a.isSubItem };
}

function summaryOf(v: VoteRow, items: Map<string, ItemRow>): PublicVoteSummary {
  const closed = v.status === "CLOSED";
  const secret = v.visibility === "SECRET";
  let result: PublicVoteSummary["result"] = null;
  if (closed) {
    result = {
      cast: v.resultCastCount ?? 0,
      present: v.resultPresentCount ?? null,
      eligible: v.resultEligibleCount ?? null,
    };
    if (v.type === "STANDARD") {
      result.yes = v.resultYes ?? 0; result.no = v.resultNo ?? 0; result.abstain = v.resultAbstain ?? 0;
      if (secret && (v.resultInvalid ?? 0) > 0) result.invalid = v.resultInvalid ?? 0;
    } else if (v.type === "LIST") {
      result.options = v.options.map((o) => ({ label: o.label, count: o.resultCount ?? 0, passed: o.resultPassed ?? null }));
    } else if (v.type === "PACKAGE") {
      result.options = v.options.map((o, i) => ({
        label: o.label, positionNumber: o.positionNumber ?? String(i + 1),
        yes: (secret ? o.secretYes : o.resultYes) ?? 0,
        no: (secret ? o.secretNo : o.resultNo) ?? 0,
        abstain: (secret ? o.secretAbstain : o.resultAbstain) ?? 0,
        passed: o.resultPassed ?? null,
      }));
    }
  }
  return {
    id: v.id,
    number: v.number,
    title: v.title,
    description: v.description,
    agendaItemId: v.agendaItemId,
    item: itemOf(items, v.agendaItemId),
    contextLabel: v.agendaItemId ? null : (v.contextLabel?.trim() || null),
    status: v.status,
    type: v.type as PublicVoteSummary["type"],
    secret,
    booth: v.boothMode,
    time: (v.closedAt ?? v.openedAt)?.toISOString() ?? null,
    result,
    decision: decisionOf(v),
    majority: v.type === "QUORUM" ? null : formatMajority(v.majorityKind as MajorityKind, v.majorityBase as MajorityBase),
  };
}

/** Posiedzenie z publicznym dostępem albo null (nie istnieje lub nie udostępnione - bez rozróżnienia). */
export async function loadPublicMeeting(meetingId: string): Promise<PublicMeeting | null> {
  const [meeting, settings] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        agenda: { orderBy: { order: "asc" } },
        attachments: { where: { visibleToPublic: true }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, sizeBytes: true, agendaItemId: true } },
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!meeting || !meeting.publicEnabled) return null;

  const items = new Map<string, ItemRow>(meeting.agenda.map((a) => [a.id, a]));
  const votes = (await loadVotes(meetingId)).map((v) => summaryOf(v, items));
  const attByItem = new Map<string, PublicAgendaItem["attachments"]>();
  const meetingAttachments: PublicMeeting["meetingAttachments"] = [];
  for (const a of meeting.attachments) {
    const item = { id: a.id, fileName: a.fileName, sizeBytes: a.sizeBytes };
    if (a.agendaItemId) attByItem.set(a.agendaItemId, [...(attByItem.get(a.agendaItemId) ?? []), item]);
    else meetingAttachments.push(item);
  }

  return {
    id: meeting.id,
    organization: settings?.organizationName ?? "",
    logoUrl: settings?.presentationLogoUrl ?? null,
    name: meeting.name,
    number: meeting.number,
    scheduledAt: meeting.scheduledAt.toISOString(),
    location: meeting.location ?? null,
    status: meeting.status,
    active: meeting.status === "OPEN" || meeting.status === "IN_PROGRESS" || meeting.status === "PAUSED",
    // Porządek bez pozycji ukrytych na prezentacji; kontekst głosowań - ze wszystkich punktów.
    agenda: meeting.agenda.filter((a) => !a.hiddenFromDisplay).map((a) => ({
      id: a.id, number: a.number, unnumbered: a.unnumbered, isSubItem: a.isSubItem, title: a.title, status: a.status,
      presenter: a.presenter, committee: a.committee,
      attachments: attByItem.get(a.id) ?? [],
    })),
    meetingAttachments,
    votes,
  };
}

/** Szczegóły jednego głosowania posiedzenia z publicznym dostępem (null - brak dostępu / nie istnieje). */
export async function loadPublicVote(meetingId: string, voteId: string): Promise<PublicVoteDetail | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { publicEnabled: true, agenda: { select: { id: true, number: true, unnumbered: true, isSubItem: true, title: true } } },
  });
  if (!meeting?.publicEnabled) return null;
  const all = await loadVotes(meetingId);
  const idx = all.findIndex((x) => x.id === voteId);
  if (idx < 0) return null;
  const v = all[idx];
  const items = new Map<string, ItemRow>(meeting.agenda.map((a) => [a.id, a]));
  const summary = summaryOf(v, items);
  const nav = {
    prev: idx > 0 ? { id: all[idx - 1].id, number: all[idx - 1].number } : null,
    next: idx < all.length - 1 ? { id: all[idx + 1].id, number: all[idx + 1].number } : null,
  };

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { groupsEnabled: true } });
  const groupsEnabled = settings?.groupsEnabled === true;
  const groups = groupsEnabled ? await prisma.group.findMany({ select: { name: true, shortName: true } }) : [];
  const clubNames: Record<string, string> = {};
  for (const g of groups) clubNames[g.shortName ?? g.name] = g.name;

  // Lista osób - tylko dla zakończonych (w trakcie nie ujawniamy, kto już głosował w widoku publicznym).
  if (v.status !== "CLOSED") {
    return { ...summary, ...nav, people: [], participation: null, presenceKnown: false, clubsFromSnapshot: false, groupsEnabled, clubNames };
  }

  const roster = await prisma.voteRoster.findMany({ where: { voteId: v.id, hasVotingRight: true }, orderBy: { order: "asc" } });
  const presenceKnown = v.type === "QUORUM" || roster.some((r) => r.present);
  const secret = v.visibility === "SECRET";

  // Kto oddał głos: jawne - karty z wyborem; tajne - anonimowe znaczniki (bez treści głosu).
  const ballots = secret || v.type === "QUORUM"
    ? []
    : await prisma.ballot.findMany({ where: { voteId: v.id }, select: { userId: true, choice: true, selections: { select: { optionId: true, choice: true } } } });
  const ballotByUser = new Map(ballots.filter((b) => b.userId).map((b) => [b.userId as string, b]));
  const votedIds = new Set<string>(
    secret
      ? (await prisma.secretBallotMarker.findMany({ where: { voteId: v.id }, select: { userId: true } })).map((m) => m.userId)
      : v.type === "QUORUM"
        ? (await prisma.ballot.findMany({ where: { voteId: v.id }, select: { userId: true } })).map((b) => b.userId).filter((x): x is string => !!x)
        : ballots.map((b) => b.userId).filter((x): x is string => !!x),
  );
  const optionLabel = new Map(v.options.map((o) => [o.id, o.label]));

  let clubsFromSnapshot = true;
  let base: { userId: string | null; lastName: string; firstName: string; club: string | null; present: boolean | null }[];
  if (roster.length > 0) {
    base = roster.map((r) => ({ userId: r.userId, lastName: r.lastName, firstName: r.firstName, club: r.clubShort ?? null, present: presenceKnown ? r.present : null }));
  } else {
    // Starsze głosowania bez migawki: skład bieżący, przynależność bieżąca (oznaczona w widoku).
    clubsFromSnapshot = false;
    const parts = await prisma.meetingParticipant.findMany({
      where: { meetingId, hasVotingRight: true },
      include: { user: { select: { firstName: true, lastName: true, group: { select: { name: true, shortName: true } } } } },
    });
    base = parts.map((p) => ({ userId: p.userId, lastName: p.user.lastName, firstName: p.user.firstName, club: p.user.group ? (p.user.group.shortName ?? p.user.group.name) : null, present: null }));
  }

  const femaleIds = new Set((await prisma.user.findMany({
    where: { id: { in: base.map((p) => p.userId).filter((x): x is string => !!x) }, femaleForms: true },
    select: { id: true },
  })).map((u) => u.id));

  const people: PublicPerson[] = base.map((p) => {
    const voted = !!p.userId && votedIds.has(p.userId);
    const person: PublicPerson = { lastName: p.lastName, firstName: p.firstName, club: groupsEnabled ? p.club : null, status: "NOT_VOTED", female: !!p.userId && femaleIds.has(p.userId) };
    if (v.type === "QUORUM") {
      person.status = voted ? "VOTED" : "NOT_VOTED";
    } else if (!voted) {
      person.status = p.present === false ? "ABSENT" : "NOT_VOTED";
    } else if (secret) {
      person.status = "VOTED";
    } else {
      const b = ballotByUser.get(p.userId as string);
      if (v.type === "STANDARD") {
        person.status = b?.choice === "YES" ? "YES" : b?.choice === "NO" ? "NO" : b?.choice === "ABSTAIN" ? "ABSTAIN" : "VOTED";
      } else if (v.type === "LIST") {
        person.status = "VOTED";
        person.selected = (b?.selections ?? []).map((s) => optionLabel.get(s.optionId) ?? "").filter(Boolean);
      } else {
        person.status = "VOTED";
        person.positions = v.options.map((o) => {
          const c = b?.selections.find((s) => s.optionId === o.id)?.choice;
          return c === "YES" || c === "NO" || c === "ABSTAIN" ? c : null;
        });
      }
    }
    return person;
  });
  people.sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  // Uczestnictwo względem migawki z chwili otwarcia (bez mieszania z bieżącą obecnością).
  // Liczba „obecnych uprawnionych" zapisana przy otwarciu nie obejmuje osób, które potwierdziły
  // obecność później - ich głosy liczymy osobno, żeby podsumowanie zgadzało się z listą imienną.
  let participation: PublicVoteDetail["participation"] = null;
  if (v.type !== "QUORUM" && presenceKnown) {
    let votedPresentAtOpen = 0, notVotedPresentAtOpen = 0, votedJoinedLater = 0;
    for (const p of base) {
      const voted = !!p.userId && votedIds.has(p.userId);
      if (p.present) { if (voted) votedPresentAtOpen++; else notVotedPresentAtOpen++; }
      else if (voted) votedJoinedLater++;
    }
    participation = { presentAtOpen: v.resultPresentCount ?? null, votedPresentAtOpen, notVotedPresentAtOpen, votedJoinedLater };
  }

  // Bez rzeczywiście skonfigurowanych klubów w danych głosowania - bez kolumn i zestawień klubowych.
  const hasClubs = groupsEnabled && people.some((p) => !!p.club);
  return { ...summary, ...nav, people, participation, presenceKnown, clubsFromSnapshot, groupsEnabled: hasClubs, clubNames };
}
