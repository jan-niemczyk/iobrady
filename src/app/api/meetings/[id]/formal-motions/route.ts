import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { canManageMeeting } from "@/lib/canManage";
import { getMeetingParticipant } from "@/lib/participantAccess";

/**
 * Stała kolejka wniosków formalnych posiedzenia (niezależna od punktu porządku).
 * GET zwraca kolejkę (tworzy ją, jeśli jeszcze nie istnieje) wraz z wpisami.
 */
async function ensureFormalQueue(meetingId: string) {
  const existing = await prisma.speakerList.findFirst({
    where: { meetingId, kind: "FORMAL_MOTIONS" },
  });
  if (existing) return existing;
  return prisma.speakerList.create({
    data: {
      meetingId,
      kind: "FORMAL_MOTIONS",
      agendaItemId: null,
      selfSignupEnabled: true,
      allowRegular: false,
      allowAdVocem: false,
      allowFormalMotion: true,
      visibleToParticipants: true,
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  // SA-08: tylko prowadzący (operator / przewodniczący) albo uczestnik TEGO posiedzenia.
  const manager = await canManageMeeting(session, id);
  if (!manager && !(await getMeetingParticipant(session.user.id, id)))
    return new NextResponse("Not found", { status: 404 });
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true, formalMotionLimitEnabled: true } });
  if (!meeting) return new NextResponse("Not found", { status: 404 });
  // Kolejkę tworzy wyłącznie prowadzący (panel operatora potrzebuje jej id); odczyt przez
  // uczestnika niczego nie zapisuje.
  const queue = manager
    ? await ensureFormalQueue(id)
    : await prisma.speakerList.findFirst({ where: { meetingId: id, kind: "FORMAL_MOTIONS" } });
  if (!queue) return NextResponse.json({ listId: null, limitEnabled: meeting.formalMotionLimitEnabled, entries: [] });
  const entries = await prisma.speakerListEntry.findMany({
    where: { speakerListId: queue.id, status: { in: ["WAITING", "SPEAKING"] } },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({
    listId: queue.id,
    // przełącznik limitu kolejki - zapamiętany na całe posiedzenie
    limitEnabled: meeting.formalMotionLimitEnabled,
    entries: entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      speakerName: e.speakerName,
      speakerClubShort: e.speakerClubShort,
      speakerRole: e.speakerRole,
      status: e.status,
      order: e.order,
      startedAt: e.startedAt,
      timeLimitSec: e.timeLimitSec,
      limitEnabled: e.limitEnabled,
      timeAdjustmentSec: e.timeAdjustmentSec,
    })),
  });
}
