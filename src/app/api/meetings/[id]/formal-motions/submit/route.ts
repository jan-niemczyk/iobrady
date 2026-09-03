import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  userId: z.string().optional(), // operator może zgłosić w imieniu
});

/**
 * Zgłoszenie do kolejki wniosków formalnych. Dostępne w każdej chwili (gdy dopuszczone),
 * niezależnie od aktywnego punktu i stanu listy mówców. Kolejność FIFO.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return new NextResponse("Not found", { status: 404 });
  if (!meeting.allowFormalMotionsAnytime)
    return new NextResponse("Wnioski formalne są wyłączone na tym posiedzeniu.", { status: 403 });

  const targetUserId = parsed.data.userId && session.user.role === "OPERATOR"
    ? parsed.data.userId : session.user.id;

  const mp = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId: targetUserId } },
  });
  if (!mp) return new NextResponse("Nie jest uczestnikiem tego posiedzenia", { status: 400 });
  if (mp.excludedFromMeeting)
    return new NextResponse("Uczestnik został wykluczony z posiedzenia", { status: 403 });

  const queue = await prisma.speakerList.findFirst({ where: { meetingId, kind: "FORMAL_MOTIONS" } })
    ?? await prisma.speakerList.create({
      data: { meetingId, kind: "FORMAL_MOTIONS", agendaItemId: null, selfSignupEnabled: true, allowRegular: false, allowAdVocem: false, allowFormalMotion: true },
    });

  // Bez limitu na osobę, ale unikamy podwójnego wpisu tego samego oczekującego.
  const dup = await prisma.speakerListEntry.findFirst({
    where: { speakerListId: queue.id, userId: targetUserId, status: { in: ["WAITING", "SPEAKING"] } },
  });
  if (dup) return new NextResponse("Już oczekujesz w kolejce wniosków formalnych.", { status: 400 });

  const last = await prisma.speakerListEntry.findFirst({
    where: { speakerListId: queue.id },
    orderBy: { order: "desc" },
  });
  const nextOrder = last ? last.order + 1 : 0;

  const u = await prisma.user.findUnique({ where: { id: targetUserId }, include: { group: true } });
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });

  await prisma.speakerListEntry.create({
    data: {
      speakerListId: queue.id,
      userId: targetUserId,
      speakerName: u ? `${u.firstName} ${u.lastName}` : null,
      speakerClubShort: u?.group?.shortName ?? null,
      speakerRole: u?.functionTitle ?? null,
      order: nextOrder,
      entryType: "FORMAL_MOTION",
      timeLimitSec: settings?.defaultFormalMotionLimitSec ?? null,
      status: "WAITING",
    },
  });

  publishToMeeting(meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}
