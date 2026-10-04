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
    where: { id },
    include: { list: true, user: true },
  });
  if (!entry) return new NextResponse("Not found", { status: 404 });
  if (entry.status !== "WAITING")
    return new NextResponse(`Nie można uruchomić - status ${entry.status}`, { status: 400 });

  // K15: start nowego przemówienia kończy każde inne aktywne (w dowolnej liście posiedzenia).
  await prisma.$transaction(async (tx) => {
    const meetingLists = await tx.speakerList.findMany({
      where: { meetingId: entry.list.meetingId }, select: { id: true },
    });
    const listIds = meetingLists.map((l) => l.id);
    const others = await tx.speakerListEntry.findMany({
      where: { speakerListId: { in: listIds }, status: "SPEAKING" },
    });
    for (const o of others) {
      const consumed = Math.max(0, Math.floor((Date.now() - (o.startedAt?.getTime() ?? Date.now())) / 1000));
      await tx.speakerListEntry.update({
        where: { id: o.id },
        data: { status: "FINISHED", endedAt: new Date(), consumedSec: consumed },
      });
      // Nalicz czas poprzedniego mówcy do licznika dyskusji (jeśli włączony).
      if (consumed > 0) {
        const mtg = await tx.meeting.findUnique({ where: { id: entry.list.meetingId }, select: { discussionClockEnabled: true } });
        if (mtg?.discussionClockEnabled) {
          await tx.meeting.update({ where: { id: entry.list.meetingId }, data: { discussionElapsedSec: { increment: consumed } } });
          if (o.speakerClubShort) {
            await tx.clubClock.upsert({
              where: { meetingId_clubShort: { meetingId: entry.list.meetingId, clubShort: o.speakerClubShort } },
              create: { meetingId: entry.list.meetingId, clubShort: o.speakerClubShort, elapsedSec: consumed },
              update: { elapsedSec: { increment: consumed } },
            });
          }
        }
      }
    }
    await tx.speakerListEntry.update({
      where: { id: entry.id },
      data: { status: "SPEAKING", startedAt: new Date() },
    });
    // Znacznik startu bieżącej wypowiedzi - do naliczania na żywo po stronie prezentacji.
    await tx.meeting.update({
      where: { id: entry.list.meetingId },
      data: { discussionRunningSince: new Date() },
    });
  });

  publishToMeeting(entry.list.meetingId, { type: "speakerlist.updated" });

  // Auto-głosowanie ad hoc przy wniosku formalnym (gdy włączone w ustawieniach globalnych).
  if (entry.entryType === "FORMAL_MOTION") {
    const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
    if (settings?.autoAdHocOnFormalMotion) {
      // Nie duplikuj - jeśli już jest otwarte/gotowe głosowanie dla tego wystąpienia, pomiń.
      const speakerName = entry.speakerName
        ?? (entry.user ? `${entry.user.lastName} ${entry.user.firstName}` : "mówca");
      const existing = await prisma.vote.findFirst({
        where: { meetingId: entry.list.meetingId, status: { in: ["READY", "OPEN"] }, adHoc: true, title: { startsWith: "Wniosek formalny:" } },
      });
      if (!existing) {
        const s = settings;
        await prisma.vote.create({
          data: {
            meetingId: entry.list.meetingId,
            title: `Wniosek formalny: ${speakerName}`,
            type: "STANDARD",
            visibility: s?.defaultVoteVisibility ?? "OPEN",
            majority: s?.defaultMajority ?? "SIMPLE",
            majorityKind: s?.defaultMajorityKind ?? "SIMPLE",
            majorityBase: s?.defaultMajorityBase ?? "OF_VOTERS",
            adHoc: true,
            status: "READY",
          },
        });
        publishToMeeting(entry.list.meetingId, { type: "meeting.updated" });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
