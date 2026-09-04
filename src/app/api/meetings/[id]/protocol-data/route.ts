import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { comparePl } from "@/lib/sortPl";
import { formatPlDate } from "@/lib/meetingName";
import { formatDateTime, formatTime } from "@/lib/labels";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const [meeting, settings] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id },
      include: {
        agenda: { orderBy: { order: "asc" } },
        votes: {
          where: { status: "CLOSED" },
          orderBy: { number: "asc" },
          include: {
            roster: true,
            ballots: { include: { selections: true } },
            options: { orderBy: { order: "asc" } },
          },
        },
        speakerLists: { include: { entries: { orderBy: { order: "asc" } } } },
        participants: { include: { user: { include: { group: true } }, attendance: true } },
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!meeting) return new NextResponse("Not found", { status: 404 });
  const mtg = meeting;
  const groupsEnabled = settings?.groupsEnabled === true;

  const nameByUser = new Map<string, string>();
  for (const p of mtg.participants) nameByUser.set(p.userId, `${p.user.firstName} ${p.user.lastName}`);
  const bn = (arr: string[]) => arr.sort((a, b) => comparePl(a, b));

  // ─── Lista obecności (przed porządkiem obrad) ─────────────────────────────
  const eligible = mtg.participants.filter((p) => p.hasVotingRight && !p.excludedFromMeeting);
  const attPresent = eligible
    .filter((p) => p.attendance?.status === "PRESENT")
    .map((p) => ({ name: `${p.user.lastName} ${p.user.firstName}`, club: groupsEnabled ? (p.user.group?.shortName ?? p.user.group?.name ?? null) : null }))
    .sort((a, b) => comparePl(a.name, b.name));
  const attAbsent = eligible
    .filter((p) => p.attendance?.status !== "PRESENT")
    .map((p) => ({ name: `${p.user.lastName} ${p.user.firstName}`, club: groupsEnabled ? (p.user.group?.shortName ?? p.user.group?.name ?? null) : null }))
    .sort((a, b) => comparePl(a.name, b.name));

  // ─── Wyniki imienne głosowań ────────────────────────────────────────────
  function namedResult(vote: typeof mtg.votes[number]) {
    const rosterPresent = new Map<string, boolean>();
    for (const r of vote.roster) if (r.userId) rosterPresent.set(r.userId, r.present);
    const choiceByUser = new Map<string, string>();
    for (const b of vote.ballots) if (b.userId && b.choice) choiceByUser.set(b.userId, b.choice);

    const za: string[] = [], przeciw: string[] = [], wstrzym: string[] = [], brak: string[] = [], nieob: string[] = [];
    for (const p of mtg.participants) {
      if (!p.hasVotingRight || p.excludedFromMeeting) continue;
      const name = `${p.user.firstName} ${p.user.lastName}`;
      const present = vote.roster.length > 0 ? (rosterPresent.get(p.userId) ?? false) : choiceByUser.has(p.userId);
      if (!present) { nieob.push(name); continue; }
      const c = choiceByUser.get(p.userId);
      if (c === "YES") za.push(name);
      else if (c === "NO") przeciw.push(name);
      else if (c === "ABSTAIN") wstrzym.push(name);
      else brak.push(name);
    }
    return { za: bn(za), przeciw: bn(przeciw), wstrzym: bn(wstrzym), brak: bn(brak), nieob: bn(nieob) };
  }

  // Lista: dla każdej pozycji - kto był za (zaznaczył kandydata), kto przeciw (oddał głos, ale
  // nie zaznaczył tej pozycji). Osoby, które w ogóle nie oddały głosu, nie pojawiają się.
  function listResultNamed(vote: typeof mtg.votes[number]) {
    return vote.options.map((o) => {
      const za: string[] = [], przeciw: string[] = [];
      for (const b of vote.ballots) {
        if (!b.userId) continue;
        const name = nameByUser.get(b.userId);
        if (!name) continue;
        (b.selections.some((s) => s.optionId === o.id) ? za : przeciw).push(name);
      }
      return { label: o.label, za: bn(za), przeciw: bn(przeciw) };
    }).sort((a, b) => a.label.localeCompare(b.label, "pl"));
  }

  // Pakiet: dla każdej pozycji - kto był za/przeciw/wstrzymał się (wg oddanego głosu na tę pozycję).
  function packageResultNamed(vote: typeof mtg.votes[number]) {
    return vote.options.map((o) => {
      const za: string[] = [], przeciw: string[] = [], wstrzym: string[] = [];
      for (const b of vote.ballots) {
        if (!b.userId) continue;
        const name = nameByUser.get(b.userId);
        if (!name) continue;
        const sel = b.selections.find((s) => s.optionId === o.id);
        if (!sel || !sel.choice) continue;
        if (sel.choice === "YES") za.push(name);
        else if (sel.choice === "NO") przeciw.push(name);
        else wstrzym.push(name);
      }
      return { label: o.label, za: bn(za), przeciw: bn(przeciw), wstrzym: bn(wstrzym) };
    });
  }

  function quorumResult(vote: typeof mtg.votes[number]) {
    const present: string[] = [], absent: string[] = [];
    const voted = new Set(vote.ballots.map((b) => b.userId).filter(Boolean) as string[]);
    for (const p of mtg.participants) {
      if (!p.hasVotingRight || p.excludedFromMeeting) continue;
      const name = `${p.user.firstName} ${p.user.lastName}`;
      (voted.has(p.userId) ? present : absent).push(name);
    }
    return { present: bn(present), absent: bn(absent) };
  }

  function voteBlockFactory(vote: typeof mtg.votes[number]) {
    const closeTime = vote.closedAt ? formatDateTime(vote.closedAt) : null;
    const base = { voteId: vote.id, number: vote.number, title: vote.title, type: vote.type as string, closeTime };
    if (vote.type === "LIST") return { ...base, list: listResultNamed(vote) };
    if (vote.type === "PACKAGE") return { ...base, pkg: packageResultNamed(vote) };
    if (vote.type === "QUORUM") return { ...base, quorum: quorumResult(vote) };
    const r = namedResult(vote);
    return { ...base, za: r.za, przeciw: r.przeciw, wstrzym: r.wstrzym, brak: r.brak, nieob: r.nieob };
  }
  const voteBlock = voteBlockFactory;
  type PointEntry =
    | { kind: "vote"; vote: ReturnType<typeof voteBlockFactory> }
    | { kind: "motion"; name: string; time: string | null };

  // Czas odniesienia głosowania: kiedy się zaczęło (a nie kiedy się skończyło) - to on decyduje,
  // w którym punkcie porządku głosowanie "wydarzyło się" chronologicznie.
  const voteTime = (v: typeof mtg.votes[number]): Date => v.openedAt ?? v.closedAt ?? new Date(0);

  // ─── Wystąpienia: zwykłe/ad vocem trafiają na listę dyskusji punktu; wnioski formalne (w
  // ramach listy mówców punktu LUB w osobnej kolejce na poziomie posiedzenia) trafiają jako
  // odrębne wpisy w chronologii punktu (lub poza porządkiem, jeśli nie mieszczą się w żadnym punkcie).
  const discussionByItem = new Map<string, string[]>();
  const formalMotionsByItem = new Map<string, { name: string; time: Date | null }[]>();
  const looseFormalMotions: { name: string; time: Date | null }[] = [];

  for (const sl of mtg.speakerLists) {
    const finished = sl.entries.filter((e) => e.status === "FINISHED" || e.status === "SPEAKING");
    for (const e of finished) {
      const name = e.speakerName ?? (e.userId ? nameByUser.get(e.userId) ?? "" : "");
      if (!name) continue;
      if (e.entryType === "FORMAL_MOTION") {
        const item = { name, time: e.startedAt ?? null };
        if (sl.agendaItemId) {
          const arr = formalMotionsByItem.get(sl.agendaItemId) ?? [];
          arr.push(item); formalMotionsByItem.set(sl.agendaItemId, arr);
        } else {
          looseFormalMotions.push(item);
        }
      } else if (sl.agendaItemId) {
        const label = e.entryType === "AD_VOCEM" ? `${name} (ad vocem)` : name;
        const arr = discussionByItem.get(sl.agendaItemId) ?? [];
        arr.push(label); discussionByItem.set(sl.agendaItemId, arr);
      }
    }
  }

  // ─── Głosowania ad hoc (bez punktu) - do dopasowania chronologicznego do punktów. ──────────
  const looseVotes = mtg.votes.filter((v) => !v.agendaItemId);
  const votesByItem = new Map<string, typeof mtg.votes>();
  for (const v of mtg.votes) {
    if (!v.agendaItemId) continue;
    const arr = votesByItem.get(v.agendaItemId) ?? [];
    arr.push(v); votesByItem.set(v.agendaItemId, arr);
  }

  // ─── Dopasowanie luźnych głosowań/wniosków formalnych do "okna" punktu, w którym się odbyły. ──
  const visibleAgenda = mtg.agenda.filter((a) => !a.hiddenFromDisplay);
  function windowContains(a: typeof mtg.agenda[number], t: Date): boolean {
    if (!a.startedAt) return false;
    const end = a.completedAt ?? (mtg.currentAgendaItemId === a.id ? null : a.startedAt);
    if (end === null) return t.getTime() >= a.startedAt.getTime();
    return t.getTime() >= a.startedAt.getTime() && t.getTime() <= end.getTime();
  }
  function matchItem(t: Date): string | null {
    for (const a of visibleAgenda) if (windowContains(a, t)) return a.id;
    return null;
  }

  const matchedVotesByItem = new Map<string, typeof mtg.votes>();
  const unmatchedVotes: typeof mtg.votes = [];
  for (const v of looseVotes) {
    const m = matchItem(voteTime(v));
    if (m) { const arr = matchedVotesByItem.get(m) ?? []; arr.push(v); matchedVotesByItem.set(m, arr); }
    else unmatchedVotes.push(v);
  }
  const matchedMotionsByItem = new Map<string, { name: string; time: Date | null }[]>();
  const unmatchedMotions: { name: string; time: Date | null }[] = [];
  for (const m of looseFormalMotions) {
    const target = m.time ? matchItem(m.time) : null;
    if (target) { const arr = matchedMotionsByItem.get(target) ?? []; arr.push(m); matchedMotionsByItem.set(target, arr); }
    else unmatchedMotions.push(m);
  }

  function entriesFor(itemId: string): PointEntry[] {
    const votes = [...(votesByItem.get(itemId) ?? []), ...(matchedVotesByItem.get(itemId) ?? [])];
    const motions = [...(formalMotionsByItem.get(itemId) ?? []), ...(matchedMotionsByItem.get(itemId) ?? [])];
    const entries: (PointEntry & { t: number })[] = [
      ...votes.map((v) => ({ kind: "vote" as const, vote: voteBlock(v), t: voteTime(v).getTime() })),
      ...motions.map((m) => ({ kind: "motion" as const, name: m.name, time: m.time ? formatTime(m.time) : null, t: m.time?.getTime() ?? 0 })),
    ];
    entries.sort((a, b) => a.t - b.t);
    return entries.map(({ t: _t, ...rest }) => rest);
  }

  const points = visibleAgenda.map((a) => ({
    number: a.number,
    title: a.title,
    isSubItem: a.isSubItem,
    presenter: a.presenter ?? null,
    committee: (a as { committee?: string | null }).committee ?? null,
    openTime: a.startedAt ? formatTime(a.startedAt) : null,
    closeTime: a.completedAt ? formatTime(a.completedAt) : null,
    discussion: discussionByItem.get(a.id) ?? [],
    entries: entriesFor(a.id),
  }));

  // ─── Głosowania/wnioski, które nie trafiły do żadnego punktu - "poza porządkiem obrad",
  // wstawiane w dokumencie we właściwym miejscu chronologicznie (nie zawsze na końcu). ──────────
  const looseEntries: (PointEntry & { t: number })[] = [
    ...unmatchedVotes.map((v) => ({ kind: "vote" as const, vote: voteBlock(v), t: voteTime(v).getTime() })),
    ...unmatchedMotions.map((m) => ({ kind: "motion" as const, name: m.name, time: m.time ? formatTime(m.time) : null, t: m.time?.getTime() ?? 0 })),
  ];
  looseEntries.sort((a, b) => a.t - b.t);

  type Block =
    | { kind: "point"; point: typeof points[number] }
    | { kind: "adhoc"; entries: PointEntry[] };

  const blocks: Block[] = [];
  let li = 0;
  for (const p of visibleAgenda) {
    const startMs = p.startedAt?.getTime();
    if (startMs != null) {
      const flushed: (PointEntry & { t: number })[] = [];
      while (li < looseEntries.length && looseEntries[li].t <= startMs) {
        flushed.push(looseEntries[li]); li++;
      }
      if (flushed.length > 0) blocks.push({ kind: "adhoc", entries: flushed.map(({ t: _t, ...rest }) => rest) });
    }
    blocks.push({ kind: "point", point: points.find((x) => x.number === p.number && x.title === p.title)! });
  }
  if (li < looseEntries.length) {
    blocks.push({ kind: "adhoc", entries: looseEntries.slice(li).map(({ t: _t, ...rest }) => rest) });
  }

  const dateText = formatPlDate(mtg.scheduledAt) ?? "";

  return NextResponse.json({
    organization: settings?.organizationName ?? "",
    meetingName: mtg.name,
    meetingNumber: mtg.number,
    dateText,
    meetingOpenTime: mtg.openedAt ? formatDateTime(mtg.openedAt) : null,
    meetingCloseTime: mtg.closedAt ? formatDateTime(mtg.closedAt) : null,
    attendance: { present: attPresent, absent: attAbsent },
    points,
    blocks,
  });
}
