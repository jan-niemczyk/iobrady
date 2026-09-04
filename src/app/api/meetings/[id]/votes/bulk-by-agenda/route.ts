import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { VoteType, VoteVisibility, MajorityKind, MajorityBase } from "@prisma/client";

// Tworzy po jednym głosowaniu na każdy zaznaczony punkt porządku, z nazwą = tytuł punktu.
const schema = z.object({
  agendaItemIds: z.array(z.string()).min(1),
  type: z.nativeEnum(VoteType).default(VoteType.STANDARD),
  visibility: z.nativeEnum(VoteVisibility).default(VoteVisibility.OPEN),
  majorityKind: z.nativeEnum(MajorityKind).default(MajorityKind.SIMPLE),
  majorityBase: z.nativeEnum(MajorityBase).default(MajorityBase.OF_VOTERS),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return new NextResponse("Meeting not found", { status: 404 });

  const d = parsed.data;
  // Tak jak w imporcie z tekstu: bez opcji/pozycji, więc lista i pakiet są nieobsługiwane hurtowo.
  if (d.type === VoteType.LIST || d.type === VoteType.PACKAGE) {
    return new NextResponse("Głosowanie dla wybranych punktów obsługuje tylko głosowania zwykłe i kworum (bez opcji/pozycji).", { status: 400 });
  }

  const items = await prisma.agendaItem.findMany({
    where: { id: { in: d.agendaItemIds }, meetingId },
    select: { id: true, title: true },
  });
  if (items.length === 0) return new NextResponse("Nie znaleziono wybranych punktów.", { status: 400 });

  const created = await prisma.$transaction(
    items.map((item) =>
      prisma.vote.create({
        data: {
          meetingId,
          title: item.title.slice(0, 500),
          type: d.type,
          visibility: d.visibility,
          majorityKind: d.majorityKind,
          majorityBase: d.majorityBase,
          agendaItemId: item.id,
          status: "READY",
        },
        select: { id: true },
      }),
    ),
  );

  await audit({
    action: "VOTE_UPDATED",
    description: `Utworzono ${created.length} głosowań dla wybranych punktów porządku`,
    meetingId, userId: session.user.id,
    metadata: { count: created.length, type: d.type },
  });

  publishToMeeting(meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true, count: created.length });
}
