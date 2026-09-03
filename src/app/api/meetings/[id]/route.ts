import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(500).optional(),
  displayNameOverride: z.string().max(500).nullable().optional(),
  number: z.string().min(1).max(50).optional(),
  description: z.string().max(2000).nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
  meetingType: z.string().max(100).nullable().optional(),
  quorumRule: z.enum(["MORE_THAN_HALF", "AT_LEAST_HALF", "PERCENTAGE", "COUNT", "CUSTOM"]).optional(),
  quorumValue: z.number().nullable().optional(),
  holdResults: z.boolean().optional(),
  publishResultsAutomatically: z.boolean().optional(),
  autoOpenSpeakerList: z.boolean().optional(),
  displaySummaryAfterClose: z.boolean().optional(),
  agendaAutoDisplayMode: z.enum(["FULL", "SINGLE"]).optional(),
  allowFormalMotionsAnytime: z.boolean().optional(),
  attendanceSelfCheckEnabled: z.boolean().optional(),
  speakerDefaultRegular: z.boolean().optional(),
  speakerDefaultAdVocem: z.boolean().optional(),
  speakerDefaultFormalMotion: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad: ${parsed.error.message}`, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.displayNameOverride !== undefined) data.displayNameOverride = parsed.data.displayNameOverride;
  if (parsed.data.number !== undefined) data.number = parsed.data.number;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.scheduledAt !== undefined) data.scheduledAt = new Date(parsed.data.scheduledAt);
  if (parsed.data.meetingType !== undefined) data.meetingType = parsed.data.meetingType;
  if (parsed.data.quorumRule !== undefined) data.quorumRule = parsed.data.quorumRule;
  if (parsed.data.quorumValue !== undefined) data.quorumValue = parsed.data.quorumValue;
  if (parsed.data.holdResults !== undefined) data.holdResults = parsed.data.holdResults;
  if (parsed.data.publishResultsAutomatically !== undefined) data.publishResultsAutomatically = parsed.data.publishResultsAutomatically;
  if (parsed.data.autoOpenSpeakerList !== undefined) data.autoOpenSpeakerList = parsed.data.autoOpenSpeakerList;
  if (parsed.data.displaySummaryAfterClose !== undefined) data.displaySummaryAfterClose = parsed.data.displaySummaryAfterClose;
  if (parsed.data.agendaAutoDisplayMode !== undefined) data.agendaAutoDisplayMode = parsed.data.agendaAutoDisplayMode;
  if (parsed.data.allowFormalMotionsAnytime !== undefined) data.allowFormalMotionsAnytime = parsed.data.allowFormalMotionsAnytime;
  if (parsed.data.attendanceSelfCheckEnabled !== undefined) data.attendanceSelfCheckEnabled = parsed.data.attendanceSelfCheckEnabled;
  if (parsed.data.speakerDefaultRegular !== undefined) data.speakerDefaultRegular = parsed.data.speakerDefaultRegular;
  if (parsed.data.speakerDefaultAdVocem !== undefined) data.speakerDefaultAdVocem = parsed.data.speakerDefaultAdVocem;
  if (parsed.data.speakerDefaultFormalMotion !== undefined) data.speakerDefaultFormalMotion = parsed.data.speakerDefaultFormalMotion;

  await prisma.meeting.update({ where: { id }, data });

  await audit({
    action: "MEETING_UPDATED",
    description: "Zmieniono dane posiedzenia",
    meetingId: id,
    userId: session.user.id,
    metadata: parsed.data,
  });

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const m = await prisma.meeting.findUnique({ where: { id } });
  if (!m) return new NextResponse("Not found", { status: 404 });

  if (m.status === "OPEN" || m.status === "IN_PROGRESS")
    return new NextResponse("Nie można usunąć trwającego posiedzenia - najpierw je zamknij.", { status: 400 });

  await prisma.meeting.delete({ where: { id } });

  await audit({
    action: "MEETING_DELETED",
    description: `Usunięto posiedzenie ${m.number}: ${m.name}`,
    userId: session.user.id,
    metadata: { meetingId: id, number: m.number, name: m.name },
  });

  return NextResponse.json({ ok: true });
}
