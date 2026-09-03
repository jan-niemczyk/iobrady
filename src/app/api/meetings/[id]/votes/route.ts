import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { VoteType, VoteVisibility, MajorityKind, MajorityBase, VoteStatus } from "@prisma/client";

const optionSchema = z.object({
  label: z.string().min(1).max(200),
  positionNumber: z.string().max(20).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

const schema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  type: z.nativeEnum(VoteType),
  visibility: z.nativeEnum(VoteVisibility),
  majorityKind: z.nativeEnum(MajorityKind),
  majorityBase: z.nativeEnum(MajorityBase),
  agendaItemId: z.string().nullable().optional(),
  /** czy głosowanie jest ad hoc - bez wiązania z punktem porządku */
  adHoc: z.boolean().optional().default(false),
  contextLabel: z.string().max(500).optional().nullable(),
  minSelections: z.number().int().min(0).optional().nullable(),
  maxSelections: z.number().int().min(0).optional().nullable(),
  options: z.array(optionSchema).optional().default([]),
  openImmediately: z.boolean().optional().default(false),
  // PIN zabezpieczający
  pinRequired: z.boolean().optional().default(false),
  pinCode: z.string().regex(/^\d{4}$/).optional().nullable(),
  // Pakiet: czy wymagane oddanie głosu na wszystkie pozycje
  requireAllPositions: z.boolean().optional().default(true),
  firstVoteFinal: z.boolean().nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return new NextResponse("Meeting not found", { status: 404 });

  const d = parsed.data;

  // Ad hoc nie ma agendaItemId
  const effectiveAgendaItemId = d.adHoc ? null : (d.agendaItemId ?? null);

  // walidacja: LIST musi mieć opcje
  if (d.type === VoteType.LIST && (!d.options || d.options.length < 2))
    return new NextResponse("Głosowanie na listę wymaga co najmniej 2 opcji", { status: 400 });

  // walidacja: min/max selections sensowne
  if (d.type === VoteType.LIST) {
    const max = d.maxSelections ?? d.options.length;
    const min = d.minSelections ?? 1;
    if (min < 0 || max < min || max > d.options.length)
      return new NextResponse("Nieprawidłowe limity wyboru", { status: 400 });
  }

  // jeśli openImmediately - domykamy wszystkie inne OPEN votes
  if (d.openImmediately) {
    const otherOpen = await prisma.vote.findFirst({
      where: { meetingId, status: VoteStatus.OPEN },
    });
    if (otherOpen)
      return new NextResponse("Nie można otworzyć - inne głosowanie jest aktywne", { status: 400 });
  }

  // snapshot uprawnionych / obecnych przy otwarciu
  let snapshot: { resultEligibleCount: number; resultPresentCount: number } | null = null;
  if (d.openImmediately) {
    const participants = await prisma.meetingParticipant.findMany({
      where: { meetingId },
      include: { attendance: true },
    });
    const eligible = participants.filter((p) => p.hasVotingRight);
    const present = eligible.filter((p) => p.attendance?.status === "PRESENT");
    snapshot = { resultEligibleCount: eligible.length, resultPresentCount: present.length };
  }

  // Numer głosowania nadajemy DOPIERO przy otwarciu (READY nie ma numeru).
  let nextNumber: number | null = null;
  if (d.openImmediately) {
    const lastNumbered = await prisma.vote.findFirst({
      where: { meetingId, number: { not: null } },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    nextNumber = (lastNumbered?.number ?? 0) + 1;
  }

  // Wybieramy reprezentację MajorityType dla wstecznej kompatybilności pola `majority`
  const legacyMajority = d.majorityKind === "SIMPLE" ? "SIMPLE"
    : d.majorityKind === "ABSOLUTE" ? "ABSOLUTE"
    : d.majorityKind === "QUALIFIED_TWO_THIRDS" ? "QUALIFIED_TWO_THIRDS"
    : "QUALIFIED_THREE_FIFTHS";

  const vote = await prisma.vote.create({
    data: {
      meetingId,
      agendaItemId: effectiveAgendaItemId,
      adHoc: d.adHoc,
      contextLabel: d.adHoc ? (d.contextLabel ?? null) : null,
      number: nextNumber,
      title: d.title,
      description: d.description ?? null,
      type: d.type,
      visibility: d.visibility,
      majority: legacyMajority,
      majorityKind: d.majorityKind,
      majorityBase: d.majorityBase,
      minSelections: d.type === VoteType.LIST ? (d.minSelections ?? 1) : null,
      maxSelections: d.type === VoteType.LIST ? (d.maxSelections ?? d.options.length) : null,
      // PIN zabezpieczający (tylko gdy włączony i podano 4 cyfry)
      pinRequired: d.pinRequired ?? false,
      pinCode: d.pinRequired ? (d.pinCode ?? null) : null,
      // Pakiet: wymóg oddania na wszystkie pozycje
      requireAllPositions: d.type === VoteType.PACKAGE ? (d.requireAllPositions ?? true) : true,
      firstVoteFinal: d.firstVoteFinal ?? null,
      status: d.openImmediately ? VoteStatus.OPEN : VoteStatus.READY,
      openedAt: d.openImmediately ? new Date() : null,
      resultEligibleCount: snapshot?.resultEligibleCount,
      resultPresentCount: snapshot?.resultPresentCount,
      options: (d.type === VoteType.LIST || d.type === VoteType.PACKAGE)
        ? { create: d.options.map((o, i) => ({ order: i + 1, label: o.label, positionNumber: o.positionNumber ?? String(i + 1), description: o.description ?? null })) }
        : undefined,
    },
  });

  await audit({
    action: "VOTE_CREATED",
    description: `Utworzono głosowanie nr ${nextNumber}: ${vote.title}`,
    meetingId,
    userId: session.user.id,
    metadata: { voteId: vote.id, number: nextNumber, type: vote.type, visibility: vote.visibility, openedImmediately: d.openImmediately, adHoc: d.adHoc },
  });

  if (d.openImmediately) {
    await audit({
      action: "VOTE_OPENED",
      description: `Otwarto głosowanie nr ${nextNumber}: ${vote.title}`,
      meetingId,
      userId: session.user.id,
      metadata: { voteId: vote.id },
    });
  }

  publishToMeeting(meetingId, { type: d.openImmediately ? "vote.opened" : "meeting.updated", voteId: vote.id });
  return NextResponse.json({ ok: true, voteId: vote.id, number: nextNumber });
}
