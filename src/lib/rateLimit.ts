/**
 * Prosty limiter w pamięci procesu (okno przesuwne z koszykami 10 s). Wystarcza dla
 * pojedynczej instancji aplikacji (tak jak szyna zdarzeń SSE). Używany dla publicznego API
 * prezentacji i połączeń SSE; logowanie ma własne limity w bazie (lib/loginThrottle).
 */
type Bucket = { start: number; counts: number[] };
const g = globalThis as unknown as { __iob_rl?: Map<string, Bucket> };
if (!g.__iob_rl) g.__iob_rl = new Map();
const store = g.__iob_rl;
const SLOT_MS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const slots = Math.max(1, Math.round(windowMs / SLOT_MS));
  const cur = Math.floor(now / SLOT_MS);
  let b = store.get(key);
  if (!b) { b = { start: cur, counts: new Array(slots).fill(0) }; store.set(key, b); }
  // przesuń okno
  const shift = cur - b.start;
  if (shift > 0) {
    if (shift >= slots) b.counts.fill(0);
    else { b.counts.splice(0, shift); b.counts.push(...new Array(shift).fill(0)); }
    b.start = cur;
  }
  const total = b.counts.reduce((a, c) => a + c, 0);
  if (total >= limit) return false;
  b.counts[slots - 1]++;
  if (store.size > 20_000) store.clear();
  return true;
}

// ─── Limit równoczesnych połączeń (SSE) ─────────────────────────────
const gc = globalThis as unknown as { __iob_conn?: Map<string, number> };
if (!gc.__iob_conn) gc.__iob_conn = new Map();
const conns = gc.__iob_conn;

export function acquireConnection(key: string, max: number): boolean {
  const n = conns.get(key) ?? 0;
  if (n >= max) return false;
  conns.set(key, n + 1);
  return true;
}

export function releaseConnection(key: string) {
  const n = (conns.get(key) ?? 1) - 1;
  if (n <= 0) conns.delete(key); else conns.set(key, n);
}
