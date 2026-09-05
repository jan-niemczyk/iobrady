import { prisma } from "@/lib/db";

/**
 * Zwraca wiersz MeetingParticipant, jeśli dany użytkownik "należy" do posiedzenia (ma tam wpis -
 * niezależnie od hasVotingRight/excludedFromMeeting, to gate'y dla konkretnych działań, nie dla
 * samego dostępu do historii/materiałów). Zwraca null, jeśli nie należy.
 */
export async function getMeetingParticipant(userId: string, meetingId: string) {
  return prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
  });
}
