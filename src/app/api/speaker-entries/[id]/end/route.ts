import { auth } from "@/lib/auth";
import { canManageBySpeakerEntry } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canManageBySpeakerEntry(session, id)))
    return new NextResponse("Forbidden", { status: 403 });
  const entry = await prisma.speakerListEntry.findUnique({
    where: { id }, include: { list: true },
  });
  if (!entry) return new NextResponse("Not found", { status: 404 });
  if (entry.status !== "SPEAKING")
    return new NextResponse("Nie można zakończyć - wystąpienie nie trwa", { status: 400 });

  const consumed = Math.max(0, Math.floor((Date.now() - (entry.startedAt?.getTime() ?? Date.now())) / 1000));
  await prisma.speakerListEntry.update({
    where: { id },
    data: { status: "FINISHED", endedAt: new Date(), consumedSec: consumed },
  });

  // Nalicz czas do licznika netto dyskusji (łącznie + pula klubu mówcy), jeśli włączony.
  await accrueDiscussionTime(entry.list.meetingId, entry.speakerClubShort, consumed);

  publishToMeeting(entry.list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true, consumedSec: consumed });
}

/**
 * Dodaje wykorzystany czas wypowiedzi do licznika dyskusji (źródło prawdy).
 * Pula łączna zawsze; pula klubu tylko gdy mówca ma klub. Bez limitów twardych - tylko pomiar.
 */
async function accrueDiscussionTime(meetingId: string, clubShort: string | null, seconds: number) {
  if (seconds <= 0) return;
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { discussionClockEnabled: true },
  });
  if (!meeting?.discussionClockEnabled) return;

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { discussionElapsedSec: { increment: seconds }, discussionRunningSince: null },
  });

  if (clubShort) {
    await prisma.clubClock.upsert({
      where: { meetingId_clubShort: { meetingId, clubShort } },
      create: { meetingId, clubShort, elapsedSec: seconds },
      update: { elapsedSec: { increment: seconds } },
    });
  }
}
