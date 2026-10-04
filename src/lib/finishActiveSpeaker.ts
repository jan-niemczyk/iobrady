import { prisma } from "@/lib/db";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Kończy trwające przemówienie w posiedzeniu i nalicza jego czas do licznika dyskusji (netto),
// oraz zeruje discussionRunningSince, aby czas nie tykał "na sucho" po zawieszeniu/zamknięciu punktu.
export async function finishActiveSpeaker(tx: Tx, meetingId: string) {
  const speaking = await tx.speakerListEntry.findMany({
    where: { list: { meetingId }, status: "SPEAKING" },
  });
  const now = Date.now();
  for (const s of speaking) {
    const consumed = Math.max(0, Math.floor((now - (s.startedAt?.getTime() ?? now)) / 1000));
    await tx.speakerListEntry.update({
      where: { id: s.id },
      data: { status: "FINISHED", endedAt: new Date(), consumedSec: consumed },
    });
    if (consumed > 0) {
      const mtg = await tx.meeting.findUnique({ where: { id: meetingId }, select: { discussionClockEnabled: true } });
      if (mtg?.discussionClockEnabled) {
        await tx.meeting.update({ where: { id: meetingId }, data: { discussionElapsedSec: { increment: consumed } } });
        if (s.speakerClubShort) {
          await tx.clubClock.upsert({
            where: { meetingId_clubShort: { meetingId, clubShort: s.speakerClubShort } },
            create: { meetingId, clubShort: s.speakerClubShort, elapsedSec: consumed },
            update: { elapsedSec: { increment: consumed } },
          });
        }
      }
    }
  }
  await tx.meeting.update({ where: { id: meetingId }, data: { discussionRunningSince: null } });
}
