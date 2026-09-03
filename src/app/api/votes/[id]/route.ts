import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";

import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  contextLabel: z.string().max(500).nullable().optional(),
  // Pełna edycja PRZED otwarciem:
  type: z.enum(["STANDARD", "LIST", "QUORUM", "PACKAGE"]).optional(),
  visibility: z.enum(["OPEN", "SECRET"]).optional(),
  majorityKind: z.string().optional(),
  majorityBase: z.string().optional(),
  minSelections: z.number().int().optional(),
  maxSelections: z.number().int().optional(),
  requireAllPositions: z.boolean().optional(),
  firstVoteFinal: z.boolean().nullable().optional(),
  pinRequired: z.boolean().optional(),
  pinCode: z.string().nullable().optional(),
  options: z.array(z.object({ label: z.string().min(1), description: z.string().nullable().optional(), positionNumber: z.string().nullable().optional() })).optional(),
});

/**
 * PATCH - edycja głosowania.
 * Nazwa/opis/kontekst - dozwolone zawsze (także po zamknięciu: literówki w protokole).
 * Pełna edycja (typ, opcje, PIN, pakiet, większość) - tylko PRZED otwarciem (status READY).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad: ${parsed.error.message}`, { status: 400 });

  const vote = await prisma.vote.findUnique({ where: { id }, include: { options: true } });
  if (!vote) return new NextResponse("Not found", { status: 404 });

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description;
  if (d.contextLabel !== undefined) data.contextLabel = d.contextLabel;

  // Pola strukturalne wolno zmieniać tylko przed otwarciem głosowania.
  const structuralKeys = ["type", "visibility", "majorityKind", "majorityBase", "minSelections", "maxSelections", "requireAllPositions", "pinRequired", "pinCode", "options"] as const;
  const wantsStructural = structuralKeys.some((k) => d[k] !== undefined);
  if (wantsStructural) {
    if (vote.status !== "READY") {
      return new NextResponse("Pełna edycja jest możliwa tylko przed rozpoczęciem głosowania.", { status: 400 });
    }
    if (d.type !== undefined) data.type = d.type;
    if (d.visibility !== undefined) data.visibility = d.visibility;
    if (d.majorityKind !== undefined) data.majorityKind = d.majorityKind;
    if (d.majorityBase !== undefined) data.majorityBase = d.majorityBase;
    if (d.minSelections !== undefined) data.minSelections = d.minSelections;
    if (d.maxSelections !== undefined) data.maxSelections = d.maxSelections;
    if (d.requireAllPositions !== undefined) data.requireAllPositions = d.requireAllPositions;
    if (d.firstVoteFinal !== undefined) data.firstVoteFinal = d.firstVoteFinal;
    if (d.pinRequired !== undefined) data.pinRequired = d.pinRequired;
    if (d.pinCode !== undefined) data.pinCode = d.pinRequired ? d.pinCode : null;
  }

  if (Object.keys(data).length === 0 && d.options === undefined) return NextResponse.json({ ok: true });

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) await tx.vote.update({ where: { id }, data });
    // Wymiana opcji (lista/pakiet) - usuń stare, utwórz nowe.
    if (d.options !== undefined && vote.status === "READY") {
      await tx.voteOption.deleteMany({ where: { voteId: id } });
      if (d.options.length > 0) {
        await tx.voteOption.createMany({
          data: d.options.map((o, i) => ({ voteId: id, label: o.label, description: o.description ?? null, positionNumber: o.positionNumber ?? null, order: i })),
        });
      }
    }
  });

  await audit({
    action: "VOTE_UPDATED",
    description: `Zmieniono głosowanie${vote.number != null ? ` nr ${vote.number}` : ""}: ${d.title ?? vote.title}`,
    meetingId: vote.meetingId,
    userId: session.user.id,
    metadata: { voteId: id, structural: wantsStructural },
  });

  publishToMeeting(vote.meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const vote = await prisma.vote.findUnique({ where: { id } });
  if (!vote) return new NextResponse("Not found", { status: 404 });

  if (vote.status === "OPEN")
    return new NextResponse("Nie można usunąć trwającego głosowania - najpierw je zamknij lub przerwij.", { status: 400 });

  await prisma.vote.delete({ where: { id } });

  await audit({
    action: "VOTE_DELETED",
    description: `Usunięto głosowanie nr ${vote.number ?? "?"}: ${vote.title}`,
    meetingId: vote.meetingId,
    userId: session.user.id,
    metadata: { voteId: id, title: vote.title, number: vote.number },
  });

  publishToMeeting(vote.meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
