import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Rejestr sesji (SA-04).
 *
 * Token JWT niesie identyfikator sesji (`sid`). Przy każdym żądaniu (middleware w runtime Node.js
 * oraz `auth()` w trasach) sesja jest weryfikowana z bazą: czy nie została unieważniona, czy nie
 * wygasła, czy konto jest aktywne i nie minął limit bezczynności. Dzięki temu dezaktywacja konta,
 * zmiana roli, reset hasła i wylogowanie działają natychmiast (z dokładnością do krótkiego cache).
 *
 * Bezczynność: `lastActivityAt` zmienia WYŁĄCZNIE `touchActivity()` wywoływane z
 * POST /api/session/activity, które klient wysyła po realnej interakcji użytkownika
 * (klawiatura, mysz, dotyk). Ruch SSE i odpytywanie serwera nie przedłużają sesji.
 */

export const SESSION_MAX_AGE_SEC = 60 * 60 * 8;
const CACHE_MS = 5_000;

export type SessionCheck = {
  role: "OPERATOR" | "PARTICIPANT";
  firstName: string;
  lastName: string;
  email: string;
  mustChangePassword: boolean;
};

type Cached = { at: number; value: SessionCheck | null };
// Cache we wspólnym globalThis: middleware i trasy API są osobnymi pakietami (osobne instancje
// modułu) w tym samym procesie - unieważnienie sesji musi być widoczne dla obu od razu.
const g = globalThis as unknown as { __iob_sess?: Map<string, Cached>; __iob_idle?: { at: number; minutes: number } | null };
if (!g.__iob_sess) g.__iob_sess = new Map();
const cache = g.__iob_sess;

async function idleMinutes(): Promise<number> {
  const idleCache = g.__iob_idle;
  if (idleCache && Date.now() - idleCache.at < 30_000) return idleCache.minutes;
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { sessionIdleMinutes: true } }).catch(() => null);
  const minutes = s?.sessionIdleMinutes ?? 240;
  g.__iob_idle = { at: Date.now(), minutes };
  return minutes;
}

export function invalidateSettingsCache() { g.__iob_idle = null; }

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const id = randomBytes(24).toString("base64url");
  await prisma.userSession.create({
    data: {
      id, userId,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000),
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return id;
}

/** Weryfikacja sesji - zwraca aktualne dane konta albo null (sesja nieważna). */
export async function checkSession(sid: string | undefined | null): Promise<SessionCheck | null> {
  if (!sid) return null;
  const c = cache.get(sid);
  if (c && Date.now() - c.at < CACHE_MS) return c.value;

  const s = await prisma.userSession.findUnique({
    where: { id: sid },
    include: { user: { select: { active: true, role: true, firstName: true, lastName: true, email: true, mustChangePassword: true } } },
  });
  let value: SessionCheck | null = null;
  if (s && !s.revokedAt && s.expiresAt > new Date() && s.user.active) {
    const idle = await idleMinutes();
    if (idle > 0 && Date.now() - s.lastActivityAt.getTime() > idle * 60_000) {
      await revokeSession(sid, "idle");
    } else {
      value = {
        role: s.user.role as SessionCheck["role"],
        firstName: s.user.firstName, lastName: s.user.lastName, email: s.user.email,
        mustChangePassword: s.user.mustChangePassword,
      };
    }
  }
  cache.set(sid, { at: Date.now(), value });
  if (cache.size > 5000) for (const k of [...cache.keys()].slice(0, 1000)) cache.delete(k);
  return value;
}

/** Aktywność użytkownika - przedłuża limit bezczynności. Zapis najwyżej co 30 s. */
export async function touchActivity(sid: string) {
  await prisma.userSession.updateMany({
    where: { id: sid, revokedAt: null, lastActivityAt: { lt: new Date(Date.now() - 30_000) } },
    data: { lastActivityAt: new Date() },
  });
}

export async function revokeSession(sid: string, reason: string) {
  await prisma.userSession.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
  cache.delete(sid);
}

/** Unieważnia wszystkie sesje użytkownika (opcjonalnie poza bieżącą). Zwraca liczbę sesji. */
export async function revokeUserSessions(userId: string, reason: string, exceptSid?: string | null) {
  const active = await prisma.userSession.findMany({
    where: { userId, revokedAt: null, ...(exceptSid ? { NOT: { id: exceptSid } } : {}) },
    select: { id: true },
  });
  if (active.length === 0) return 0;
  await prisma.userSession.updateMany({
    where: { id: { in: active.map((a) => a.id) } },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  for (const a of active) cache.delete(a.id);
  return active.length;
}

/** Po zmianie danych konta (np. wymuszona zmiana hasła) - odśwież sesje użytkownika bez czekania na cache. */
export async function refreshUserSessionsCache(userId: string) {
  const ids = await prisma.userSession.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
  for (const s of ids) cache.delete(s.id);
}
