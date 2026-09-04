import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { formatTime } from "@/lib/labels";
import { formatPlDate } from "@/lib/meetingName";

const TYPE_LABEL: Record<string, string> = {
  REGULAR: "zwykłe",
  AD_VOCEM: "ad vocem",
  FORMAL_MOTION: "wniosek formalny",
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      agenda: { orderBy: { order: "asc" } },
      speakerLists: { include: { entries: { orderBy: { order: "asc" } } } },
      participants: { include: { user: true } },
    },
  });
  if (!meeting) return new NextResponse("Not found", { status: 404 });
  const mtg = meeting;
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });

  const nameByUser = new Map<string, string>();
  for (const p of mtg.participants) nameByUser.set(p.userId, `${p.user.firstName} ${p.user.lastName}`);

  type Row = { name: string; type: string; start: string | null; end: string | null; durationSec: number | null; limitSec: number | null };
  function toRow(e: (typeof mtg.speakerLists)[number]["entries"][number]): Row | null {
    const name = e.speakerName ?? (e.userId ? nameByUser.get(e.userId) ?? "" : "");
    if (!name) return null;
    const duration = e.consumedSec ?? (e.startedAt && e.endedAt ? Math.round((e.endedAt.getTime() - e.startedAt.getTime()) / 1000) : null);
    return {
      name,
      type: TYPE_LABEL[e.entryType] ?? e.entryType,
      start: e.startedAt ? formatTime(e.startedAt) : null,
      end: e.endedAt ? formatTime(e.endedAt) : null,
      durationSec: duration,
      limitSec: e.timeLimitSec,
    };
  }

  const visibleAgenda = meeting.agenda.filter((a) => !a.hiddenFromDisplay);

  // Wpisy z list przypisanych do punktu (DISCUSSION lub FORMAL_MOTIONS z agendaItemId) - trafiają
  // wprost do tego punktu. Wpisy z kolejki wniosków formalnych na poziomie posiedzenia
  // (agendaItemId = null) dopasowujemy do punktu po czasie (okno startedAt..completedAt).
  const rowsByItem = new Map<string, { row: Row; t: number }[]>();
  const loose: { row: Row; t: number }[] = [];

  for (const sl of meeting.speakerLists) {
    for (const e of sl.entries) {
      if (e.status !== "FINISHED" && e.status !== "SPEAKING") continue;
      const row = toRow(e);
      if (!row) continue;
      const t = e.startedAt?.getTime() ?? 0;
      if (sl.agendaItemId) {
        const arr = rowsByItem.get(sl.agendaItemId) ?? []; arr.push({ row, t }); rowsByItem.set(sl.agendaItemId, arr);
      } else if (e.startedAt) {
        loose.push({ row, t });
      }
    }
  }

  function windowContains(a: (typeof visibleAgenda)[number], t: number): boolean {
    if (!a.startedAt) return false;
    const start = a.startedAt.getTime();
    const end = a.completedAt ? a.completedAt.getTime() : (mtg.currentAgendaItemId === a.id ? null : start);
    if (end === null) return t >= start;
    return t >= start && t <= end;
  }
  function matchItem(t: number): string | null {
    for (const a of visibleAgenda) if (windowContains(a, t)) return a.id;
    return null;
  }

  const unmatched: { row: Row; t: number }[] = [];
  for (const l of loose) {
    const m = matchItem(l.t);
    if (m) { const arr = rowsByItem.get(m) ?? []; arr.push(l); rowsByItem.set(m, arr); }
    else unmatched.push(l);
  }
  unmatched.sort((a, b) => a.t - b.t);

  const points = visibleAgenda.map((a) => ({
    number: a.number,
    title: a.title,
    rows: (rowsByItem.get(a.id) ?? []).sort((x, y) => x.t - y.t).map((x) => x.row),
  }));

  type Block = { kind: "point"; point: (typeof points)[number] } | { kind: "out"; rows: Row[] };
  const blocks: Block[] = [];
  let li = 0;
  for (const a of visibleAgenda) {
    const startMs = a.startedAt?.getTime();
    if (startMs != null) {
      const flushed: Row[] = [];
      while (li < unmatched.length && unmatched[li].t <= startMs) { flushed.push(unmatched[li].row); li++; }
      if (flushed.length > 0) blocks.push({ kind: "out", rows: flushed });
    }
    blocks.push({ kind: "point", point: points.find((p) => p.number === a.number && p.title === a.title)! });
  }
  if (li < unmatched.length) blocks.push({ kind: "out", rows: unmatched.slice(li).map((x) => x.row) });

  return NextResponse.json({
    organization: settings?.organizationName ?? "",
    meetingName: meeting.name,
    meetingNumber: meeting.number,
    dateText: formatPlDate(meeting.scheduledAt) ?? "",
    blocks,
  });
}
