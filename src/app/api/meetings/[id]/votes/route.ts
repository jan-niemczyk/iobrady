import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { VoteType, VoteVisibility, MajorityKind, MajorityBase, VoteStatus } from "@prisma/client";
import { validationError } from "@/lib/http";
import { openVoteNow } from "@/lib/openVote";
import { VOTING_MEETING_STATUSES } from "@/lib/meetingLock";

const optionSchema = z.object({
  label: z.string().min(1).max(2000),
  positionNumber: z.string().max(20).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

const schema = z.object({
  title: z.string().min(1).max(5000),
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
  // Tryb kotarkowy (tylko tajne, bez kworum) - operator udostępnia kartę pojedynczo.
  boothMode: z.boolean().optional().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return validationError(parsed.error);

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return new NextResponse("Meeting not found", { status: 404 });

  const d = parsed.data;

  // Ad hoc nie ma agendaItemId
  const effectiveAgendaItemId = d.adHoc ? null : (d.agendaItemId ?? null);

  if (d.boothMode && (d.visibility !== VoteVisibility.SECRET || d.type === VoteType.QUORUM))
    return new NextResponse("Tryb kotarkowy jest dostępny tylko dla głosowania tajnego (bez kworum).", { status: 400 });

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

  // "Utwórz i otwórz": głosowanie powstaje jako READY i jest otwierane tą samą ścieżką co przycisk
  // "Otwórz" (migawka składu, numer, blokada posiedzenia - BR-3). Szybka kontrola przed utworzeniem:
  if (d.openImmediately) {
    if (!(VOTING_MEETING_STATUSES as readonly string[]).includes(meeting.status))
      return new NextResponse("Głosowanie można otworzyć tylko w otwartym lub trwającym posiedzeniu.", { status: 400 });
    const otherOpen = await prisma.vote.findFirst({ where: { meetingId, status: VoteStatus.OPEN }, select: { id: true } });
    if (otherOpen)
      return new NextResponse("Nie można otworzyć - inne głosowanie jest aktywne", { status: 400 });
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
      boothMode: d.boothMode ?? false,
      status: VoteStatus.READY,
      options: (d.type === VoteType.LIST || d.type === VoteType.PACKAGE)
        ? { create: d.options.map((o, i) => ({ order: i + 1, label: o.label, positionNumber: o.positionNumber ?? String(i + 1), description: o.description ?? null })) }
        : undefined,
    },
  });

  await audit({
    action: "VOTE_CREATED",
    description: `Utworzono głosowanie: ${vote.title}`,
    meetingId,
    userId: session.user.id,
    metadata: { voteId: vote.id, type: vote.type, visibility: vote.visibility, openedImmediately: d.openImmediately, adHoc: d.adHoc },
  });

  let number: number | null = null;
  if (d.openImmediately) {
    const r = await openVoteNow(vote.id, session.user.id);
    if (!r.ok) {
      publishToMeeting(meetingId, { type: "meeting.updated" });
      return new NextResponse(`Głosowanie utworzono, ale nie otwarto: ${r.message}`, { status: r.status });
    }
    number = r.number;
  } else {
    publishToMeeting(meetingId, { type: "meeting.updated" });
  }
  return NextResponse.json({ ok: true, voteId: vote.id, number });
}
