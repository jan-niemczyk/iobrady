/**
 * Lekki event bus dla SSE.
 *
 * Operator wykonuje akcję → API route woła `publishToMeeting(meetingId, event)`.
 * Uczestnicy są zasubskrybowani na `/api/meetings/[id]/stream` (SSE), gdzie
 * trzymamy aktywne ReadableStreams; bus broadcastuje do nich event.
 *
 * Stan przechowywany jest w pamięci procesu - dla pojedynczego deploya wystarcza.
 * Dla wielu instancji aplikacji należy podpiąć Redis Pub/Sub w `publishToMeeting`.
 */

type Listener = (data: BroadcastEvent) => void;

export type BroadcastEvent =
  | { type: "meeting.updated" }
  | { type: "agenda.changed" }
  | { type: "attendance.updated" }
  | { type: "vote.opened"; voteId: string }
  | { type: "vote.closed"; voteId: string }
  | { type: "vote.cancelled"; voteId: string }
  | { type: "vote.result_published"; voteId: string }
  | { type: "message.published"; messageId: string }
  | { type: "message.changed" }
  | { type: "display.changed" }
  | { type: "speakerlist.updated" };

// Trzymamy listenery per meeting w globalu, żeby przeżyć HMR w dev.
const g = globalThis as unknown as { __esog_bus?: Map<string, Set<Listener>> };
if (!g.__esog_bus) g.__esog_bus = new Map();
const bus = g.__esog_bus;

export function subscribeMeeting(meetingId: string, listener: Listener): () => void {
  let set = bus.get(meetingId);
  if (!set) {
    set = new Set();
    bus.set(meetingId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) bus.delete(meetingId);
  };
}

export function publishToMeeting(meetingId: string, event: BroadcastEvent): void {
  const set = bus.get(meetingId);
  if (!set) return;
  for (const fn of set) {
    try { fn(event); } catch { /* ignore */ }
  }
}

// ─── Rejestr obecności online (kto ma aktywne połączenie SSE) ─────────────────
// Klucz: meetingId -> (userId -> ostatni heartbeat ms). Uczestnika uznajemy za
// online, jeśli jego ostatni heartbeat jest młodszy niż PRESENCE_TTL.
const gp = globalThis as unknown as { __esog_presence?: Map<string, Map<string, number>> };
if (!gp.__esog_presence) gp.__esog_presence = new Map();
const presence = gp.__esog_presence;
const PRESENCE_TTL = 12_000; // 12 s bez heartbeatu = offline

export function markOnline(meetingId: string, userId: string): void {
  let m = presence.get(meetingId);
  if (!m) { m = new Map(); presence.set(meetingId, m); }
  m.set(userId, Date.now());
}

export function markOffline(meetingId: string, userId: string): void {
  const m = presence.get(meetingId);
  if (m) m.delete(userId);
}

export function getOnlineUserIds(meetingId: string): string[] {
  const m = presence.get(meetingId);
  if (!m) return [];
  const now = Date.now();
  const ids: string[] = [];
  for (const [userId, ts] of m) {
    if (now - ts < PRESENCE_TTL) ids.push(userId);
    else m.delete(userId);
  }
  return ids;
}

// ─── Globalny rejestr online (od zalogowania, niezależny od posiedzenia) ──────
const gg = globalThis as unknown as { __esog_presence_global?: Map<string, number> };
if (!gg.__esog_presence_global) gg.__esog_presence_global = new Map();
const globalPresence = gg.__esog_presence_global;

export function markOnlineGlobal(userId: string): void {
  globalPresence.set(userId, Date.now());
}

export function isOnlineGlobal(userId: string): boolean {
  const ts = globalPresence.get(userId);
  if (ts == null) return false;
  if (Date.now() - ts < PRESENCE_TTL) return true;
  globalPresence.delete(userId);
  return false;
}

export function getOnlineGlobalIds(): string[] {
  const now = Date.now();
  const ids: string[] = [];
  for (const [userId, ts] of globalPresence) {
    if (now - ts < PRESENCE_TTL) ids.push(userId);
    else globalPresence.delete(userId);
  }
  return ids;
}
