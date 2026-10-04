/**
 * Krótki cache odpowiedzi API prezentacji (utwardzenie dostępności).
 *
 * - Klucz = posiedzenie. Odpowiedź NIE zależy od oglądającego (autoryzacja jest sprawdzana
 *   przed odczytem cache), więc cache nie miesza uprawnień.
 * - Odpowiedź nie zawiera wyników cząstkowych głosowań tajnych (SA-01), więc nie może ich ujawnić.
 * - Każde zdarzenie posiedzenia (publishToMeeting: głos, zamknięcie, zmiana ekranu...) czyści wpis,
 *   a czas życia to 1 s - po zamknięciu głosowania ekran dostaje wynik od razu.
 */
const TTL_MS = 1_000;
const g = globalThis as unknown as { __iob_dc?: Map<string, { at: number; body: string }> };
if (!g.__iob_dc) g.__iob_dc = new Map();
const cache = g.__iob_dc;

export function getDisplayCache(meetingId: string): string | null {
  const e = cache.get(meetingId);
  if (!e || Date.now() - e.at > TTL_MS) return null;
  return e.body;
}

export function setDisplayCache(meetingId: string, body: string) {
  cache.set(meetingId, { at: Date.now(), body });
  if (cache.size > 500) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k);
}

export function invalidateDisplayCache(meetingId: string) {
  cache.delete(meetingId);
}
