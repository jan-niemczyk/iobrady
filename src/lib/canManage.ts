import { prisma } from "@/lib/db";

type SessionLike = { user: { id: string; role: string } } | null | undefined;

/**
 * Czy użytkownik może PROWADZIĆ dane posiedzenie:
 * - operator (zawsze), albo
 * - uczestnik oznaczony jako przewodniczący TEGO posiedzenia (isChairperson).
 * Przewodniczący prowadzi obrady w zakresie: zamykanie głosowań, lista mówców i wnioski
 * formalne, zegar dyskusji, sprawdzenie obecności/kworum.
 */
export async function canManageMeeting(session: SessionLike, meetingId: string): Promise<boolean> {
  if (!session) return false;
  if (session.user.role === "OPERATOR") return true;
  const mp = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId: session.user.id } },
    select: { isChairperson: true },
  });
  return !!mp?.isChairperson;
}

/** Wariant, gdy znamy tylko id wpisu na liście mówców - ustala meetingId z relacji. */
export async function canManageBySpeakerEntry(session: SessionLike, entryId: string): Promise<boolean> {
  if (!session) return false;
  if (session.user.role === "OPERATOR") return true;
  const entry = await prisma.speakerListEntry.findUnique({
    where: { id: entryId },
    select: { list: { select: { meetingId: true } } },
  });
  if (!entry?.list?.meetingId) return false;
  return canManageMeeting(session, entry.list.meetingId);
}

/** Wariant, gdy znamy tylko id głosowania - ustala meetingId z relacji. */
export async function canManageByVote(session: SessionLike, voteId: string): Promise<boolean> {
  if (!session) return false;
  if (session.user.role === "OPERATOR") return true;
  const vote = await prisma.vote.findUnique({ where: { id: voteId }, select: { meetingId: true } });
  if (!vote?.meetingId) return false;
  return canManageMeeting(session, vote.meetingId);
}
