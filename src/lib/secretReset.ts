import { prisma } from "@/lib/db";
import { lockVoteRow } from "@/lib/booth";
import { decryptSecret } from "@/lib/secretBox";
import type { Prisma } from "@prisma/client";

/**
 * Zerowanie głosu TAJNEGO (zgłoszona pomyłka).
 *
 * Przy oddaniu głosu tajnego treść karty jest zapisywana przy markerze w postaci zaszyfrowanej
 * (`SecretBallotMarker.resetPayload`). Dzięki temu operator może cofnąć anonimowe liczniki
 * konkretnej osoby, NIE poznając treści jej głosu (serwer niczego nie zwraca). Pole istnieje
 * wyłącznie do końca głosowania: zamknięcie, przerwanie i anulowanie je czyszczą
 * (`purgeSecretResetPayloads`), więc po zakończeniu powiązanie osoba -> treść głosu znika.
 */
export type SecretBallotContent = {
  invalid: boolean;
  choice: "YES" | "NO" | "ABSTAIN" | null;
  selected: string[];
  pkg: { optionId: string; choice: "YES" | "NO" | "ABSTAIN" }[];
};

export const ballotContext = (voteId: string, userId: string) => `ballot:${voteId}:${userId}`;

type Result = { ok: true } | { ok: false; status: number; message: string };

export async function resetSecretBallot(voteId: string, userId: string): Promise<Result> {
  try {
    await prisma.$transaction(async (tx) => {
      await lockVoteRow(tx, voteId);
      const vote = await tx.vote.findUnique({ where: { id: voteId }, select: { status: true, type: true, visibility: true } });
      if (!vote || vote.status !== "OPEN") throw new ResetError(409, "Głosowanie nie jest otwarte - nie można wyzerować głosu.");
      if (vote.visibility !== "SECRET" || vote.type === "QUORUM") throw new ResetError(400, "To nie jest głosowanie tajne.");
      const marker = await tx.secretBallotMarker.findUnique({ where: { voteId_userId: { voteId, userId } } });
      if (!marker) throw new ResetError(404, "Ten uczestnik nie oddał głosu w tym głosowaniu.");
      if (!marker.resetPayload)
        throw new ResetError(409, "Tego głosu nie można wyzerować (oddany przed włączeniem funkcji zerowania).");
      let c: SecretBallotContent;
      try {
        c = JSON.parse(decryptSecret(marker.resetPayload, ballotContext(voteId, userId)));
      } catch {
        throw new ResetError(409, "Nie można odczytać danych do korekty głosu (zmieniony klucz szyfrowania?).");
      }
      await undoCounters(tx, voteId, vote.type, c);
      await tx.secretBallotMarker.delete({ where: { id: marker.id } });
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof ResetError) return { ok: false, status: e.status, message: e.message };
    throw e;
  }
}

class ResetError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function undoCounters(tx: Prisma.TransactionClient, voteId: string, type: string, c: SecretBallotContent) {
  if (type === "PACKAGE") {
    if (c.invalid) return;
    for (const pc of c.pkg) {
      const data = pc.choice === "YES" ? { secretYes: { decrement: 1 } }
        : pc.choice === "NO" ? { secretNo: { decrement: 1 } }
        : { secretAbstain: { decrement: 1 } };
      await tx.voteOption.update({ where: { id: pc.optionId }, data });
    }
  } else if (type === "LIST") {
    if (c.invalid || c.selected.length === 0) return;
    await tx.voteOption.updateMany({ where: { voteId, id: { in: c.selected } }, data: { secretCount: { decrement: 1 } } });
  } else {
    const field = c.invalid ? "secretInvalid"
      : c.choice === "YES" ? "secretYes"
      : c.choice === "NO" ? "secretNo"
      : c.choice === "ABSTAIN" ? "secretAbstain" : null;
    if (!field) return;
    await tx.vote.update({ where: { id: voteId }, data: { [field]: { decrement: 1 } } });
  }
}

/** Usuwa zaszyfrowane treści głosów - wywoływać przy każdym zakończeniu głosowania (w tej samej transakcji). */
export async function purgeSecretResetPayloads(tx: Prisma.TransactionClient | typeof prisma, voteId: string) {
  await tx.secretBallotMarker.updateMany({ where: { voteId, resetPayload: { not: null } }, data: { resetPayload: null } });
}
