import type { Prisma } from "@prisma/client";

/**
 * Blokada wiersza posiedzenia do końca transakcji (BR-3). Serializuje operacje cyklu życia
 * JEDNEGO posiedzenia: otwarcie głosowania, zamknięcie posiedzenia. Różne posiedzenia blokują
 * różne wiersze, więc mogą być prowadzone równolegle (także z udziałem tej samej osoby).
 */
export async function lockMeetingRow(tx: Prisma.TransactionClient, meetingId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Meeting" WHERE "id" = ${meetingId} FOR UPDATE`;
}

/** Statusy posiedzenia, w których wolno otworzyć głosowanie. */
export const VOTING_MEETING_STATUSES = ["OPEN", "IN_PROGRESS", "PAUSED"] as const;
