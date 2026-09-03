import { auth } from "@/lib/auth";
import { canManageMeeting } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["COUNT_UP", "COUNT_DOWN"]).optional(),
  scope: z.enum(["PER_AGENDA_ITEM", "WHOLE_MEETING"]).optional(),
  budgetSec: z.number().int().min(0).nullable().optional(),
  // Limity per klub: [{ clubShort, budgetSec }]
  clubBudgets: z.array(z.object({ clubShort: z.string(), budgetSec: z.number().int().min(0).nullable() })).optional(),
  // Reset naliczonych czasów (np. przy zmianie punktu w trybie PER_AGENDA_ITEM).
  reset: z.boolean().optional(),
});

// GET - bieżący stan licznika + kluby. PATCH - konfiguracja.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canManageMeeting(session, id)))
    return new NextResponse("Unauthorized", { status: 401 });

  const m = await prisma.meeting.findUnique({
    where: { id },
    select: {
      discussionClockEnabled: true, discussionClockMode: true, discussionClockScope: true,
      discussionBudgetSec: true, discussionElapsedSec: true, discussionRunningSince: true,
    },
  });
  if (!m) return new NextResponse("Not found", { status: 404 });
  const clubs = await prisma.clubClock.findMany({ where: { meetingId: id }, orderBy: { clubShort: "asc" } });

  return NextResponse.json({
    enabled: m.discussionClockEnabled,
    mode: m.discussionClockMode,
    scope: m.discussionClockScope,
    budgetSec: m.discussionBudgetSec,
    elapsedSec: m.discussionElapsedSec,
    runningSince: m.discussionRunningSince,
    clubs: clubs.map((c) => ({ clubShort: c.clubShort, budgetSec: c.budgetSec, elapsedSec: c.elapsedSec })),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canManageMeeting(session, id)))
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.enabled !== undefined) data.discussionClockEnabled = d.enabled;
  if (d.mode !== undefined) data.discussionClockMode = d.mode;
  if (d.scope !== undefined) data.discussionClockScope = d.scope;
  if (d.budgetSec !== undefined) data.discussionBudgetSec = d.budgetSec;
  if (d.reset) { data.discussionElapsedSec = 0; data.discussionRunningSince = null; }
  if (Object.keys(data).length) await prisma.meeting.update({ where: { id }, data });

  if (d.reset) await prisma.clubClock.updateMany({ where: { meetingId: id }, data: { elapsedSec: 0 } });

  if (d.clubBudgets) {
    for (const cb of d.clubBudgets) {
      await prisma.clubClock.upsert({
        where: { meetingId_clubShort: { meetingId: id, clubShort: cb.clubShort } },
        create: { meetingId: id, clubShort: cb.clubShort, budgetSec: cb.budgetSec ?? null },
        update: { budgetSec: cb.budgetSec ?? null },
      });
    }
  }

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
