import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { comparePl } from "@/lib/sortPl";
import { formatPlDate } from "@/lib/meetingName";

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
        participants: { include: { user: { include: { group: true } } } },
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!meeting) return new NextResponse("Not found", { status: 404 });
  const mtg = meeting;

  const nameByUser = new Map<string, string>();
  for (const p of mtg.participants) nameByUser.set(p.userId, `${p.user.firstName} ${p.user.lastName}`);

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
    const bn = (arr: string[]) => arr.sort((a, b) => comparePl(a, b));
    return { za: bn(za), przeciw: bn(przeciw), wstrzym: bn(wstrzym), brak: bn(brak), nieob: bn(nieob) };
  }

  function listResult(vote: typeof mtg.votes[number]) {
    const voterCount = new Set(vote.ballots.map((b) => b.userId).filter(Boolean)).size;
    return vote.options.map((o) => {
      const yes = vote.ballots.filter((b) => b.selections.some((s) => s.optionId === o.id)).length;
      return { label: o.label, yes };
    }).sort((a, b) => a.label.localeCompare(b.label, "pl"));
  }

  function packageResult(vote: typeof mtg.votes[number]) {
    return vote.options.map((o) => {
      let y = 0, n = 0, a = 0;
      for (const b of vote.ballots) {
        const sel = b.selections.find((s) => s.optionId === o.id);
        if (!sel) continue;
        if (sel.choice === "YES") y++; else if (sel.choice === "NO") n++; else if (sel.choice === "ABSTAIN") a++;
      }
      return { label: o.label, yes: y, no: n, abstain: a };
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
    const bn = (arr: string[]) => arr.sort((a, b) => comparePl(a, b));
    return { present: bn(present), absent: bn(absent) };
  }

  function voteBlock(vote: typeof mtg.votes[number]) {
    const closeTime = vote.closedAt
      ? new Date(vote.closedAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      : null;
    const base = { voteId: vote.id, number: vote.number, title: vote.title, type: vote.type as string, closeTime };
    if (vote.type === "LIST") return { ...base, list: listResult(vote) };
    if (vote.type === "PACKAGE") return { ...base, pkg: packageResult(vote) };
    if (vote.type === "QUORUM") return { ...base, quorum: quorumResult(vote) };
    const r = namedResult(vote);
    return { ...base, za: r.za, przeciw: r.przeciw, wstrzym: r.wstrzym, brak: r.brak, nieob: r.nieob };
  }

  const votesByItem = new Map<string, typeof mtg.votes>();
  const adHocVotes: typeof mtg.votes = [];
  for (const v of mtg.votes) {
    if (v.agendaItemId) {
      const arr = votesByItem.get(v.agendaItemId) ?? [];
      arr.push(v); votesByItem.set(v.agendaItemId, arr);
    } else {
      adHocVotes.push(v);
    }
  }
  adHocVotes.sort((a, b) => {
    const ta = a.closedAt ? new Date(a.closedAt).getTime() : (a.number ?? 0);
    const tb = b.closedAt ? new Date(b.closedAt).getTime() : (b.number ?? 0);
    return ta - tb;
  });

  const discussionByItem = new Map<string, string[]>();
  for (const sl of mtg.speakerLists) {
    if (!sl.agendaItemId || sl.kind !== "DISCUSSION") continue;
    const speakers = sl.entries
      .filter((e) => e.status === "FINISHED" || e.status === "SPEAKING")
      .map((e) => e.speakerName ?? (e.userId ? nameByUser.get(e.userId) ?? "" : ""))
      .filter(Boolean);
    if (speakers.length > 0) discussionByItem.set(sl.agendaItemId, speakers);
  }

  const points = mtg.agenda
    .filter((a) => !a.hiddenFromDisplay)
    .map((a) => ({
      number: a.number,
      title: a.title,
      isSubItem: a.isSubItem,
      presenter: a.presenter ?? null,
      committee: (a as { committee?: string | null }).committee ?? null,
      discussion: discussionByItem.get(a.id) ?? [],
      votes: (votesByItem.get(a.id) ?? []).map(voteBlock),
    }));

  const dateText = formatPlDate(mtg.scheduledAt) ?? "";

  return NextResponse.json({
    organization: settings?.organizationName ?? "",
    meetingName: mtg.name,
    meetingNumber: mtg.number,
    dateText,
    points,
    adHoc: adHocVotes.map(voteBlock),
  });
}
