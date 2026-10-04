import type { Prisma } from "@prisma/client";
import { comparePl } from "@/lib/sortPl";

/**
 * TRYB KOTARKOWY - głosowanie tajne, w którym radni wchodzą pojedynczo za kotarkę,
 * a operator udostępnia kartę wyłącznie osobie, która właśnie weszła (jedna kabina).
 *
 * Spójność: każde przejście stanu kabiny (udostępnienie, cofnięcie, przyjęcie głosu,
 * zamknięcie) wykonuje się w transakcji, która NAJPIERW blokuje wiersz głosowania
 * (`SELECT ... FOR UPDATE`). Równoczesne żądania ustawiają się więc w jednoznacznej
 * kolejności: np. cofnięcie i wysłanie głosu - wygrywa to, które pierwsze zajmie blokadę;
 * drugie widzi już stan po pierwszym (głos przyjęty albo dostęp cofnięty).
 *
 * Tajność: stan kabiny (kto ma kartę, kto oddał głos) nie jest nigdy ujawniany razem z treścią
 * głosu - treść trafia do anonimowych liczników, jak w zwykłym głosowaniu tajnym. Na czas
 * trwania głosowania marker przechowuje treść ZASZYFROWANĄ wyłącznie na potrzeby zerowania
 * pomyłki przez operatora (lib/secretReset); zakończenie głosowania ją usuwa.
 */

export type Tx = Prisma.TransactionClient;

/** Blokada wiersza głosowania do końca transakcji (serializuje operacje na kabinie i zamknięcie). */
export async function lockVoteRow(tx: Tx, voteId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Vote" WHERE "id" = ${voteId} FOR UPDATE`;
}

/** Błąd z kodem HTTP - rzucany z transakcji i zamieniany na odpowiedź w trasie. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type BoothPersonStatus = "WAITING" | "GRANTED" | "VOTED";

export interface BoothPerson {
  userId: string;
  name: string;
  clubShort: string | null;
  present: boolean;
  status: BoothPersonStatus;
}

export interface BoothState {
  voteId: string;
  boothMode: boolean;
  status: string;
  boothUserId: string | null;
  boothUserName: string | null;
  boothGrantedAt: string | null;
  castCount: number;
  /** Uprawnieni: prawo głosu, bez wyłączeń, obecni (oraz ci, którzy już głosowali). */
  eligibleCount: number;
  people: BoothPerson[];
}

/**
 * Powód, dla którego dana osoba NIE może teraz otrzymać karty (albo null, gdy może).
 * Te same reguły co przy przyjęciu głosu (trasa /cast).
 */
export async function boothIneligibility(tx: Tx, vote: { id: string; meetingId: string }, userId: string): Promise<string | null> {
  const mp = await tx.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId: vote.meetingId, userId } },
    include: { attendance: true },
  });
  if (!mp) return "Ta osoba nie należy do tego posiedzenia.";
  if (mp.excludedFromMeeting) return "Ta osoba została wykluczona z posiedzenia.";
  if (!mp.hasVotingRight) return "Ta osoba nie ma prawa głosu.";
  if (mp.excludedFromVoteIds.includes(vote.id)) return "Ta osoba została wyłączona z tego głosowania.";
  if (mp.attendance?.status !== "PRESENT") return "Ta osoba nie ma potwierdzonej obecności.";
  return null;
}

/** Stan kabiny dla panelu operatora - bez jakiejkolwiek informacji o treści głosów. */
export async function loadBoothState(tx: Tx, voteId: string): Promise<BoothState | null> {
  const vote = await tx.vote.findUnique({
    where: { id: voteId },
    select: {
      id: true, meetingId: true, status: true, boothMode: true, boothUserId: true, boothGrantedAt: true,
      secretMarkers: { select: { userId: true } },
    },
  });
  if (!vote) return null;
  const voted = new Set(vote.secretMarkers.map((m) => m.userId));
  const parts = await tx.meetingParticipant.findMany({
    where: { meetingId: vote.meetingId, hasVotingRight: true, excludedFromMeeting: false },
    include: { attendance: true, user: { include: { group: true } } },
  });
  const people: BoothPerson[] = parts
    .filter((p) => !p.excludedFromVoteIds.includes(vote.id))
    .filter((p) => p.attendance?.status === "PRESENT" || voted.has(p.userId) || vote.boothUserId === p.userId)
    .map((p): BoothPerson => ({
      userId: p.userId,
      name: `${p.user.lastName} ${p.user.firstName}`,
      clubShort: p.user.group?.shortName ?? null,
      present: p.attendance?.status === "PRESENT",
      status: voted.has(p.userId) ? "VOTED" : vote.boothUserId === p.userId ? "GRANTED" : "WAITING",
    }))
    .sort((a, b) => comparePl(a.name, b.name));
  const holder = people.find((p) => p.userId === vote.boothUserId);
  return {
    voteId: vote.id,
    boothMode: vote.boothMode,
    status: vote.status,
    boothUserId: vote.boothUserId,
    boothUserName: holder?.name ?? null,
    boothGrantedAt: vote.boothGrantedAt?.toISOString() ?? null,
    castCount: voted.size,
    eligibleCount: people.length,
    people,
  };
}
