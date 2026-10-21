import { prisma } from "@/lib/db";
import { comparePl } from "@/lib/sortPl";

/**
 * Raporty obecności - wspólne obliczenia dla widoku i eksportów (PDF, DOCX, XLSX).
 *
 * Zasady:
 * - obecność formalna wynika wyłącznie z zapisanych czynności (potwierdzenie, decyzja operatora,
 *   sprawdzenie obecności, kworum, korekta) - stan połączenia ani wylogowanie nie są nieobecnością,
 * - przedziały obecności liczone są ze znanych zdarzeń; brak zdarzeń = brak danych (bez domysłów),
 * - spóźnienie: pierwsze stwierdzenie obecności później niż tolerancja po FAKTYCZNYM otwarciu
 *   posiedzenia (a gdy pierwsze ustalenia obecności w posiedzeniu nastąpiły później - po nich),
 * - wcześniejsze wyjście: stwierdzona nieobecność (bez powrotu) wcześniej niż tolerancja przed
 *   FAKTYCZNYM zamknięciem; dla trwającego posiedzenia wynik jest roboczy (bez wcześniejszych wyjść),
 * - obecność, spóźnienie i wcześniejsze wyjście są niezależnymi informacjami (nie sumują się),
 * - goście są w osobnej sekcji i nie wpływają na liczby uprawnionych ani frekwencję.
 */

export type FormalStatus = "PRESENT" | "ABSENT" | "NO_DATA";
export type DataQuality = "FULL" | "PARTIAL" | "NONE";

export interface AttEvent {
  id: string; present: boolean; at: Date; source: string; recordedById: string | null;
  reason: string | null; correctsId: string | null; supersededAt: Date | null; createdAt: Date;
}

export interface PersonResult {
  userId: string;
  lastName: string;
  firstName: string;
  club: string | null;
  kind: "VOTING" | "NO_VOTE" | "GUEST";
  status: FormalStatus;
  quality: DataQuality;
  late: boolean | null;
  lateMinutes: number | null;
  earlyLeave: boolean | null;
  earlyMinutes: number | null;
  /** Obecność tylko przez część posiedzenia (spóźnienie, wcześniejsze wyjście albo przerwa w obecności). */
  partial: boolean;
  intervals: { from: string; to: string | null }[];
  presentMinutes: number | null;
  firstIn: string | null;
  lastOut: string | null;
  sources: string[];
  history: { id: string; present: boolean; at: string; source: string; reason: string | null; superseded: boolean; by: string | null }[];
  excused?: boolean;
  note?: string | null;
}

export interface MeetingAttendance {
  meeting: { id: string; number: string; name: string; scheduledAt: string; openedAt: string | null; closedAt: string | null; status: string; meetingType: string | null; provisional: boolean };
  toleranceLate: number;
  toleranceEarly: number;
  people: PersonResult[];
  guests: PersonResult[];
  counts: { eligible: number; present: number; absent: number; noData: number; late: number; early: number };
  basisNotes: string[];
}

export const SOURCE_LABEL: Record<string, string> = {
  SELF: "potwierdzenie przez radnego",
  OPERATOR: "decyzja operatora",
  CHECK: "sprawdzenie obecności",
  QUORUM: "głosowanie kworum",
  CORRECTION: "korekta",
};

const minutes = (ms: number) => Math.round(ms / 60_000);

/** Wynik osoby z jej zdarzeń (czysta funkcja - testowalna bez bazy). */
export function computePerson(opts: {
  events: AttEvent[];
  currentStatus: "PRESENT" | "ABSENT" | null;
  openedAt: Date | null;
  closedAt: Date | null;
  firstDeterminationAt: Date | null;
  live: boolean;
  tolLateMin: number;
  tolEarlyMin: number;
}): Omit<PersonResult, "userId" | "lastName" | "firstName" | "club" | "kind" | "history"> {
  const ev = opts.events.filter((e) => !e.supersededAt).sort((a, b) => a.at.getTime() - b.at.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
  const sources = [...new Set(ev.map((e) => e.source))];
  if (ev.length === 0) {
    // Starsze posiedzenia (przed zapisem historii): znany tylko stan końcowy, bez godzin.
    const status: FormalStatus = opts.currentStatus === "PRESENT" ? "PRESENT" : opts.currentStatus === "ABSENT" ? "ABSENT" : "NO_DATA";
    return { status, quality: opts.currentStatus ? "PARTIAL" : "NONE", late: null, lateMinutes: null, earlyLeave: null, earlyMinutes: null, partial: false, intervals: [], presentMinutes: null, firstIn: null, lastOut: null, sources };
  }
  const intervals: { from: Date; to: Date | null }[] = [];
  let open: Date | null = null;
  for (const e of ev) {
    if (e.present && !open) open = e.at;
    else if (!e.present && open) { intervals.push({ from: open, to: e.at }); open = null; }
  }
  if (open) intervals.push({ from: open, to: opts.live ? null : opts.closedAt });
  const status: FormalStatus = intervals.length > 0 ? "PRESENT" : "ABSENT";

  let late: boolean | null = null, lateMinutes: number | null = null;
  if (intervals.length > 0 && opts.openedAt) {
    const base = Math.max(opts.openedAt.getTime(), opts.firstDeterminationAt?.getTime() ?? 0);
    const diff = intervals[0].from.getTime() - base;
    late = diff > opts.tolLateMin * 60_000;
    lateMinutes = late ? minutes(diff) : 0;
  }
  let earlyLeave: boolean | null = null, earlyMinutes: number | null = null;
  const last = ev[ev.length - 1];
  if (intervals.length > 0 && !opts.live && opts.closedAt) {
    if (!last.present) {
      const diff = opts.closedAt.getTime() - last.at.getTime();
      earlyLeave = diff > opts.tolEarlyMin * 60_000;
      earlyMinutes = earlyLeave ? minutes(diff) : 0;
    } else { earlyLeave = false; earlyMinutes = 0; }
  }
  let presentMinutes: number | null = null;
  if (opts.openedAt && (opts.closedAt || opts.live)) {
    const lo = opts.openedAt.getTime(), hi = (opts.closedAt ?? new Date()).getTime();
    presentMinutes = minutes(intervals.reduce((s, i) => s + Math.max(0, Math.min(hi, (i.to ?? new Date()).getTime()) - Math.max(lo, i.from.getTime())), 0));
  }
  const partial = !!late || !!earlyLeave || intervals.length > 1;
  return {
    status, quality: "FULL", late, lateMinutes, earlyLeave, earlyMinutes, partial,
    intervals: intervals.map((i) => ({ from: i.from.toISOString(), to: i.to?.toISOString() ?? null })),
    presentMinutes,
    firstIn: intervals[0]?.from.toISOString() ?? null,
    lastOut: !last.present ? last.at.toISOString() : null,
    sources,
  };
}

/** Raport obecności jednego posiedzenia. `withNotes` - uwagi i usprawiedliwienia (tylko operator). */
export async function meetingAttendance(meetingId: string, opts: { withNotes?: boolean } = {}): Promise<MeetingAttendance | null> {
  const [m, settings] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        participants: { include: { user: { select: { id: true, firstName: true, lastName: true, group: { select: { shortName: true, name: true } } } }, attendance: { select: { status: true } } } },
        attendanceEvents: true,
        attendanceNotes: opts.withNotes ? true : false,
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" }, select: { attendanceLateToleranceMin: true, attendanceEarlyToleranceMin: true } }),
  ]);
  if (!m) return null;
  const tolLate = settings?.attendanceLateToleranceMin ?? 10;
  const tolEarly = settings?.attendanceEarlyToleranceMin ?? 10;
  const live = m.status === "OPEN" || m.status === "IN_PROGRESS" || m.status === "PAUSED";
  const valid = m.attendanceEvents.filter((e) => !e.supersededAt);
  const firstDeterminationAt = valid.length ? new Date(Math.min(...valid.map((e) => e.at.getTime()))) : null;
  const byUser = new Map<string, AttEvent[]>();
  for (const e of m.attendanceEvents) byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e]);
  const recorders = await prisma.user.findMany({ where: { id: { in: [...new Set(m.attendanceEvents.map((e) => e.recordedById).filter((x): x is string => !!x))] } }, select: { id: true, firstName: true, lastName: true } });
  const recName = new Map(recorders.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const notes = new Map((opts.withNotes ? (m as unknown as { attendanceNotes: { userId: string; excused: boolean; note: string | null }[] }).attendanceNotes : []).map((n) => [n.userId, n]));

  const results: PersonResult[] = m.participants.map((p) => {
    const events = byUser.get(p.userId) ?? [];
    const r = computePerson({
      events, currentStatus: (p.attendance?.status as "PRESENT" | "ABSENT" | undefined) ?? null,
      openedAt: m.openedAt, closedAt: m.closedAt, firstDeterminationAt, live, tolLateMin: tolLate, tolEarlyMin: tolEarly,
    });
    const n = notes.get(p.userId);
    return {
      userId: p.userId, lastName: p.user.lastName, firstName: p.user.firstName,
      club: p.user.group ? (p.user.group.shortName ?? p.user.group.name) : null,
      kind: (p.isInvitedGuest ? "GUEST" : p.hasVotingRight ? "VOTING" : "NO_VOTE") as PersonResult["kind"],
      ...r,
      history: [...events].sort((a, b) => a.at.getTime() - b.at.getTime()).map((e) => ({
        id: e.id, present: e.present, at: e.at.toISOString(), source: e.source, reason: e.reason, superseded: !!e.supersededAt, by: e.recordedById ? (recName.get(e.recordedById) ?? null) : null,
      })),
      ...(opts.withNotes ? { excused: n?.excused ?? false, note: n?.note ?? null } : {}),
    };
  }).sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  const people = results.filter((r) => r.kind !== "GUEST");
  const guests = results.filter((r) => r.kind === "GUEST");
  const voting = people.filter((r) => r.kind === "VOTING");
  const basisNotes: string[] = [];
  if (!m.openedAt) basisNotes.push("Brak zapisanej godziny otwarcia posiedzenia - spóźnień nie można ustalić.");
  if (!m.closedAt && !live) basisNotes.push("Brak zapisanej godziny zamknięcia posiedzenia - wcześniejszych wyjść nie można ustalić.");
  if (live) basisNotes.push("Posiedzenie trwa - wynik jest roboczy (wcześniejsze wyjścia ustala się po zamknięciu).");
  if (m.attendanceEvents.length === 0) basisNotes.push("Posiedzenie bez zapisanej historii obecności - znany jest tylko stan końcowy (dane częściowe, bez godzin).");
  if (firstDeterminationAt && m.openedAt && firstDeterminationAt > m.openedAt) basisNotes.push("Spóźnienia liczone od pierwszego ustalenia obecności w posiedzeniu (było późniejsze niż otwarcie).");

  return {
    meeting: {
      id: m.id, number: m.number, name: m.name, scheduledAt: m.scheduledAt.toISOString(),
      openedAt: m.openedAt?.toISOString() ?? null, closedAt: m.closedAt?.toISOString() ?? null,
      status: m.status, meetingType: m.meetingType, provisional: live,
    },
    toleranceLate: tolLate, toleranceEarly: tolEarly,
    people, guests,
    counts: {
      eligible: voting.length,
      present: voting.filter((r) => r.status === "PRESENT").length,
      absent: voting.filter((r) => r.status === "ABSENT").length,
      noData: voting.filter((r) => r.status === "NO_DATA").length,
      late: voting.filter((r) => r.late).length,
      early: voting.filter((r) => r.earlyLeave).length,
    },
    basisNotes,
  };
}

// ─── Raport zbiorczy ────────────────────────────────────────────────────────

export interface SummaryFilters {
  from?: string | null;
  to?: string | null;
  orgUnitIds?: string[];
  userId?: string | null;
  meetingType?: string | null;
  /** Domyślnie tylko zakończone posiedzenia; anulowane i przyszłe nigdy nie tworzą nieobecności. */
  includeOngoing?: boolean;
}

export interface SummaryRow {
  userId: string; lastName: string; firstName: string; club: string | null;
  meetings: number; present: number; absent: number; noData: number; late: number; early: number; partial: number; excused: number;
  /** Frekwencja = obecności / (obecności + stwierdzone nieobecności); null gdy mianownik 0. */
  rate: number | null;
  /** Pokrycie danych: posiedzenia z ustalonym statusem / wszystkie posiedzenia osoby. */
  coverage: number | null;
  details: { meetingId: string; number: string; name: string; date: string; status: FormalStatus; quality: DataQuality; late: boolean | null; early: boolean | null; partial: boolean; excused: boolean }[];
}

export interface AttendanceSummary {
  filters: SummaryFilters;
  filterLabels: string[];
  meetings: { id: string; number: string; name: string; date: string; status: string; units: string[] }[];
  rows: SummaryRow[];
  generatedAt: string;
}

export async function attendanceSummary(f: SummaryFilters): Promise<AttendanceSummary> {
  const from = f.from ? new Date(`${f.from}T00:00:00`) : null;
  const to = f.to ? new Date(`${f.to}T23:59:59.999`) : null;
  const statuses = f.includeOngoing ? ["CLOSED", "ARCHIVED", "OPEN", "IN_PROGRESS", "PAUSED"] : ["CLOSED", "ARCHIVED"];
  const units = f.orgUnitIds?.length ? await prisma.orgUnit.findMany({ where: { id: { in: f.orgUnitIds } }, include: { members: true } }) : [];
  const meetings = await prisma.meeting.findMany({
    where: {
      status: { in: statuses as never },
      scheduledAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
      ...(f.meetingType ? { meetingType: f.meetingType } : {}),
      // Posiedzenie wspólne kilku wybranych grup - jeden rekord (bez podwójnego liczenia).
      ...(f.orgUnitIds?.length ? { orgUnits: { some: { orgUnitId: { in: f.orgUnitIds } } } } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    take: 1000,
    include: { orgUnits: { include: { orgUnit: { select: { name: true } } } } },
  });

  const rowsByUser = new Map<string, SummaryRow>();
  for (const mt of meetings) {
    const rep = await meetingAttendance(mt.id, { withNotes: true });
    if (!rep) continue;
    for (const p of rep.people) {
      if (p.kind !== "VOTING") continue;
      if (f.userId && p.userId !== f.userId) continue;
      // Filtr grup: osoba objęta raportem tylko w okresie członkostwa w wybranej grupie (gdy okres
      // jest zapisany). Bez wpisu członkostwa w wybranych grupach - poza raportem tej grupy.
      if (units.length) {
        const memberships = units.flatMap((u) => u.members.filter((mm) => mm.userId === p.userId));
        if (memberships.length === 0) continue;
        const at = mt.scheduledAt.getTime();
        const inPeriod = memberships.some((mm) => (!mm.validFrom || mm.validFrom.getTime() <= at) && (!mm.validTo || mm.validTo.getTime() + 86_399_999 >= at));
        if (!inPeriod) continue;
      }
      const row = rowsByUser.get(p.userId) ?? {
        userId: p.userId, lastName: p.lastName, firstName: p.firstName, club: p.club,
        meetings: 0, present: 0, absent: 0, noData: 0, late: 0, early: 0, partial: 0, excused: 0, rate: null, coverage: null, details: [],
      };
      row.meetings++;
      if (p.status === "PRESENT") row.present++; else if (p.status === "ABSENT") row.absent++; else row.noData++;
      if (p.late) row.late++;
      if (p.earlyLeave) row.early++;
      if (p.partial && p.status === "PRESENT") row.partial++;
      if (p.excused && p.status === "ABSENT") row.excused++;
      row.details.push({ meetingId: mt.id, number: mt.number, name: mt.name, date: mt.scheduledAt.toISOString(), status: p.status, quality: p.quality, late: p.late, early: p.earlyLeave, partial: p.partial, excused: !!p.excused });
      rowsByUser.set(p.userId, row);
    }
  }
  const rows = [...rowsByUser.values()].map((r) => ({
    ...r,
    rate: r.present + r.absent > 0 ? r.present / (r.present + r.absent) : null,
    coverage: r.meetings > 0 ? (r.present + r.absent) / r.meetings : null,
  })).sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  const labels: string[] = [];
  labels.push(`Okres: ${f.from ?? "od początku"} - ${f.to ?? "do dziś"}`);
  if (units.length) labels.push(`Grupy: ${units.map((u) => u.name).join(", ")}`);
  if (f.meetingType) labels.push(`Rodzaj posiedzenia: ${f.meetingType}`);
  if (f.userId) labels.push(`Osoba: ${rows[0] ? `${rows[0].lastName} ${rows[0].firstName}` : "-"}`);
  labels.push(f.includeOngoing ? "Posiedzenia zakończone i trwające (wynik roboczy)" : "Tylko posiedzenia zakończone");

  return {
    filters: f, filterLabels: labels,
    meetings: meetings.map((m) => ({ id: m.id, number: m.number, name: m.name, date: m.scheduledAt.toISOString(), status: m.status, units: m.orgUnits.map((o) => o.orgUnit.name) })),
    rows,
    generatedAt: new Date().toISOString(),
  };
}
