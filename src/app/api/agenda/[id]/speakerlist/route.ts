import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  selfSignupEnabled: z.boolean().optional().default(false),
  visibleToParticipants: z.boolean().optional().default(true),
  defaultTimeLimitSec: z.number().int().min(0).nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: agendaItemId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const item = await prisma.agendaItem.findUnique({ where: { id: agendaItemId } });
  if (!item) return new NextResponse("Not found", { status: 404 });

  const existing = await prisma.speakerList.findUnique({ where: { agendaItemId } });
  if (existing) return new NextResponse("Lista mówców już istnieje dla tego punktu", { status: 400 });

  const list = await prisma.speakerList.create({
    data: {
      meetingId: item.meetingId,
      agendaItemId,
      selfSignupEnabled: parsed.data.selfSignupEnabled ?? false,
      visibleToParticipants: parsed.data.visibleToParticipants ?? true,
      defaultTimeLimitSec: parsed.data.defaultTimeLimitSec ?? null,
    },
  });

  publishToMeeting(item.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true, listId: list.id });
}
