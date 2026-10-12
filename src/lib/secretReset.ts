import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/db";

/**
 * Głosowanie TAJNE: treść głosu nie jest nigdzie zapisywana (decyzja właściciela, H-02).
 * Przy oddaniu karty powstaje tylko znacznik „kto oddał” (frekwencja, jeden głos na osobę)
 * oraz przyrost anonimowych liczników - bez powiązania osoba -> treść. Dlatego głosu tajnego
 * nie da się wyzerować; pomyłkę naprawia się anulowaniem i powtórzeniem głosowania.
 *
 * Kolumna `SecretBallotMarker.resetPayload` pochodzi z wcześniejszej wersji (zerowanie tajnego).
 * Nowe głosy jej nie wypełniają; poniższa funkcja czyści ewentualne stare wartości przy każdym
 * zakończeniu głosowania, a migracja po aktualizacji - we wszystkich rekordach.
 */
export async function purgeSecretResetPayloads(tx: Prisma.TransactionClient | typeof prisma, voteId: string) {
  await tx.secretBallotMarker.updateMany({ where: { voteId, resetPayload: { not: null } }, data: { resetPayload: null } });
}
