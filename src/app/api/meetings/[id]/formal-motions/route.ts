import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

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
  const queue = await ensureFormalQueue(id);
  const entries = await prisma.speakerListEntry.findMany({
    where: { speakerListId: queue.id, status: { in: ["WAITING", "SPEAKING"] } },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({
    listId: queue.id,
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
      timeAdjustmentSec: e.timeAdjustmentSec,
    })),
  });
}
