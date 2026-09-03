import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { VoteType, VoteVisibility, MajorityKind, MajorityBase } from "@prisma/client";

// Import głosowań z tekstu: jedna linia = jedno głosowanie (tytuł),
// wspólne ustawienia dla wszystkich (typ, jawność, większość, punkt, PIN).
const schema = z.object({
  text: z.string().min(1),
  type: z.nativeEnum(VoteType).default(VoteType.STANDARD),
  visibility: z.nativeEnum(VoteVisibility).default(VoteVisibility.OPEN),
  majorityKind: z.nativeEnum(MajorityKind).default(MajorityKind.SIMPLE),
  majorityBase: z.nativeEnum(MajorityBase).default(MajorityBase.OF_VOTERS),
  agendaItemId: z.string().nullable().optional(),
  adHoc: z.boolean().optional().default(false),
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
  // Import dotyczy głosowań o prostym tytule (zwykłe / kworum). Lista i pakiet wymagają opcji -> nieobsługiwane hurtowo.
  if (d.type === VoteType.LIST || d.type === VoteType.PACKAGE) {
    return new NextResponse("Import hurtowy obsługuje tylko głosowania zwykłe i kworum (bez opcji/pozycji).", { status: 400 });
  }

  const titles = d.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (titles.length === 0) return new NextResponse("Brak tytułów do zaimportowania.", { status: 400 });

  const effectiveAgendaItemId = d.adHoc ? null : (d.agendaItemId ?? null);

  const created = await prisma.$transaction(
    titles.map((title) =>
      prisma.vote.create({
        data: {
          meetingId,
          title: title.slice(0, 500),
          type: d.type,
          visibility: d.visibility,
          majorityKind: d.majorityKind,
          majorityBase: d.majorityBase,
          agendaItemId: effectiveAgendaItemId,
          adHoc: d.adHoc,
          status: "READY",
        },
        select: { id: true },
      }),
    ),
  );

  await audit({
    action: "VOTE_UPDATED",
    description: `Zaimportowano ${created.length} głosowań z tekstu`,
    meetingId, userId: session.user.id,
    metadata: { count: created.length, type: d.type },
  });

  publishToMeeting(meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true, count: created.length });
}
