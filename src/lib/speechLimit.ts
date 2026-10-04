import { prisma } from "@/lib/db";
import type { Prisma, SpeakerEntryType, SpeakerListKind } from "@prisma/client";

/**
 * Przełącznik "limit / bez limitu" wystąpień.
 * - Stan listy jest zapamiętywany na całe posiedzenie (Meeting.speechLimitEnabled dla list mówców
 *   w punktach, Meeting.formalMotionLimitEnabled dla kolejki wniosków formalnych).
 * - Każdy wpis ma własny przełącznik (limitEnabled), domyślnie równy stanowi listy.
 * - Bez limitu timeLimitSec = null, więc wszystkie ekrany liczą czas w górę; wartość limitu
 *   czeka w savedLimitSec na ponowne włączenie.
 */

type Db = Prisma.TransactionClient | typeof prisma;
type ListLike = { meetingId: string; kind: SpeakerListKind; defaultTimeLimitSec: number | null };

export async function listLimitEnabled(list: { meetingId: string; kind: SpeakerListKind }, db: Db = prisma): Promise<boolean> {
  const m = await db.meeting.findUnique({
    where: { id: list.meetingId },
    select: { speechLimitEnabled: true, formalMotionLimitEnabled: true },
  });
  if (!m) return true;
  return list.kind === "FORMAL_MOTIONS" ? m.formalMotionLimitEnabled : m.speechLimitEnabled;
}

/** Domyślny limit wpisu: limit listy, a gdy brak - ustawienie globalne dla typu zgłoszenia. */
export async function defaultLimitFor(list: ListLike, entryType: SpeakerEntryType, db: Db = prisma): Promise<number | null> {
  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  if (list.kind === "FORMAL_MOTIONS") return settings?.defaultFormalMotionLimitSec ?? null;
  const globalLimit = entryType === "FORMAL_MOTION" ? settings?.defaultFormalMotionLimitSec
    : entryType === "AD_VOCEM" ? settings?.defaultAdVocemLimitSec
    : settings?.defaultSpeechLimitSec;
  return list.defaultTimeLimitSec ?? globalLimit ?? null;
}

/** Pola limitu dla nowego wpisu wg stanu przełącznika. */
export function newEntryLimitFields(enabled: boolean, limitSec: number | null) {
  return enabled
    ? { limitEnabled: true, timeLimitSec: limitSec, savedLimitSec: null }
    : { limitEnabled: false, timeLimitSec: null, savedLimitSec: limitSec };
}

type EntryLike = {
  id: string; entryType: SpeakerEntryType; limitEnabled: boolean;
  timeLimitSec: number | null; savedLimitSec: number | null;
};

/** Włącza / wyłącza limit pojedynczego wpisu (także w trakcie wystąpienia). */
export async function setEntryLimitEnabled(entry: EntryLike, list: ListLike, enabled: boolean, db: Db = prisma) {
  if (entry.limitEnabled === enabled) return;
  if (enabled) {
    const limit = entry.savedLimitSec ?? (await defaultLimitFor(list, entry.entryType, db));
    await db.speakerListEntry.update({
      where: { id: entry.id },
      data: { limitEnabled: true, timeLimitSec: limit, savedLimitSec: null },
    });
  } else {
    await db.speakerListEntry.update({
      where: { id: entry.id },
      data: { limitEnabled: false, timeLimitSec: null, savedLimitSec: entry.timeLimitSec ?? entry.savedLimitSec },
    });
  }
}

/** Przełącznik całej listy: zapamiętanie na posiedzenie + wszystkie nieukończone wpisy listy. */
export async function setListLimitEnabled(listId: string, enabled: boolean) {
  await prisma.$transaction(async (tx) => {
    const list = await tx.speakerList.findUnique({
      where: { id: listId },
      include: { entries: { where: { status: { in: ["WAITING", "SPEAKING"] } } } },
    });
    if (!list) return;
    await tx.meeting.update({
      where: { id: list.meetingId },
      data: list.kind === "FORMAL_MOTIONS" ? { formalMotionLimitEnabled: enabled } : { speechLimitEnabled: enabled },
    });
    for (const e of list.entries) await setEntryLimitEnabled(e, list, enabled, tx);
  });
}

/**
 * Nowy domyślny limit listy (np. planowany limit punktu): oczekujące wystąpienia dostają limit
 * wyliczony od nowa (przy wyłączonym limicie wartość trafia do savedLimitSec).
 */
export async function applyListDefaultToWaiting(listId: string, db: Db = prisma) {
  const list = await db.speakerList.findUnique({
    where: { id: listId },
    include: { entries: { where: { status: "WAITING" } } },
  });
  if (!list) return;
  for (const e of list.entries) {
    const limit = await defaultLimitFor(list, e.entryType, db);
    await db.speakerListEntry.update({
      where: { id: e.id },
      data: e.limitEnabled ? { timeLimitSec: limit } : { savedLimitSec: limit },
    });
  }
}
