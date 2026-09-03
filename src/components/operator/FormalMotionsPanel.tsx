"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useHotkeys } from "@/lib/useHotkeys";

interface Motion {
  id: string;
  userId: string | null;
  speakerName: string | null;
  speakerClubShort: string | null;
  speakerRole: string | null;
  status: string;
  order: number;
  startedAt: string | null;
  timeLimitSec: number | null;
  timeAdjustmentSec?: number;
}

// Panel operatora: stała kolejka wniosków formalnych + przełącznik dopuszczenia.
export function FormalMotionsPanel({
  meetingId, allowAnytime, onToggleAllow, participants,
}: {
  meetingId: string;
  allowAnytime: boolean;
  onToggleAllow: (value: boolean) => void;
  participants: { userId: string; name: string; hasVotingRight: boolean }[];
}) {
  const [entries, setEntries] = useState<Motion[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const [addUser, setAddUser] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const prevWaitingIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  const [pending, startTransition] = useTransition();

  const load = () => {
    fetch(`/api/meetings/${meetingId}/formal-motions`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { entries: [] })
      .then((d) => {
        const list: Motion[] = d.entries ?? [];
        // Wykryj nowe zgłoszenia (pojawiły się od ostatniego odświeżenia) i pokaż powiadomienie.
        const waitingNow = list.filter((e) => e.status === "WAITING");
        const currentIds = new Set(waitingNow.map((e) => e.id));
        if (!firstLoad.current) {
          const fresh = waitingNow.filter((e) => !prevWaitingIds.current.has(e.id));
          if (fresh.length > 0) {
            const who = fresh[0].speakerName ?? "uczestnik";
            setToast(fresh.length === 1 ? `Nowy wniosek formalny: ${who}` : `${fresh.length} nowe wnioski formalne`);
            try { new Audio("data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQ4AAAAAAAAAAAAAAAAAAAAAAA==").play().catch(() => {}); } catch { /* */ }
            setTimeout(() => setToast(null), 6000);
          }
        }
        prevWaitingIds.current = currentIds;
        firstLoad.current = false;
        setEntries(list);
        setListId(d.listId ?? null);
      })
      .catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  function setLimit(entryId: string, sec: number | null) {
    startTransition(async () => {
      await fetch(`/api/speaker-entries/${entryId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeLimitSec: sec }),
      });
      load();
    });
  }
  function reorder(entryId: string, direction: "up" | "down" | "top") {
    startTransition(async () => {
      await fetch(`/api/meetings/${meetingId}/formal-motions/reorder`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, direction }),
      });
      load();
    });
  }

  function give(entryId: string) {
    startTransition(async () => {
      await fetch(`/api/speaker-entries/${entryId}/start`, { method: "POST" });
      load();
    });
  }
  function finish(entryId: string) {
    startTransition(async () => {
      await fetch(`/api/speaker-entries/${entryId}/end`, { method: "POST" });
      load();
    });
  }
  function remove(entryId: string) {
    startTransition(async () => {
      await fetch(`/api/speaker-entries/${entryId}/withdraw`, { method: "POST" });
      load();
    });
  }
  function adjust(entryId: string, delta: number) {
    startTransition(async () => {
      await fetch(`/api/speaker-entries/${entryId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addSeconds: delta }),
      });
      load();
    });
  }

  // Tykający zegar (co sekundę) do wyświetlania odliczania trwającego wniosku.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function addToQueue() {
    if (!listId || !addUser) return;
    startTransition(async () => {
      await fetch(`/api/speakerlists/${listId}/entries`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addUser, entryType: "FORMAL_MOTION" }),
      });
      setAddUser("");
      load();
    });
  }

  const waiting = entries.filter((e) => e.status === "WAITING");
  const speaking = entries.find((e) => e.status === "SPEAKING");

  // Skróty operatora (wnioski formalne):
  //  B - udziel głosu pierwszemu oczekującemu wnioskowi,
  //  K lub Spacja - zakończ trwający wniosek (wspólne z listą mówców).
  const firstWaiting = waiting[0];
  useHotkeys([
    { key: "b", enabled: !pending && !speaking && !!firstWaiting, action: () => firstWaiting && give(firstWaiting.id), description: "Udziel głosu wnioskowi formalnemu" },
    { key: "k", enabled: !pending && !!speaking, action: () => speaking && finish(speaking.id), description: "Zakończ wniosek formalny" },
    { key: " ", enabled: !pending && !!speaking, action: () => speaking && finish(speaking.id), description: "Zakończ wniosek formalny" },
  ], [pending, speaking?.id, firstWaiting?.id]);

  return (
    <div className="card">
      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, background: "var(--color-no)", color: "#fff", padding: "12px 18px", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.25)", maxWidth: 320, cursor: "pointer" }} onClick={() => setToast(null)}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.85 }}>Wniosek formalny</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{toast}</div>
        </div>
      )}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-rule-soft)]">
        <h3 className="eyebrow" style={{ margin: 0, color: "var(--color-no)" }}>Wnioski formalne</h3>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={allowAnytime} onChange={(e) => onToggleAllow(e.target.checked)} />
          <span>Dozwolone w każdej chwili</span>
        </label>
      </div>

      <div className="p-4">
        {speaking && (() => {
          const limit = (speaking.timeLimitSec ?? 0) + (speaking.timeAdjustmentSec ?? 0);
          const started = speaking.startedAt ? new Date(speaking.startedAt).getTime() : now;
          const elapsed = Math.floor((now - started) / 1000);
          const remaining = limit > 0 ? limit - elapsed : null;
          const over = remaining != null && remaining < 0;
          const fmt = (s: number) => `${s < 0 ? "-" : ""}${String(Math.floor(Math.abs(s) / 60)).padStart(2, "0")}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
          return (
            <div className="mb-3 p-3" style={{ background: "rgba(200,16,46,0.06)", border: "1px solid rgba(200,16,46,0.35)" }}>
              <div className="text-xs eyebrow mb-1" style={{ color: "var(--color-no)" }}>Trwa wniosek</div>
              <div className="text-sm font-medium">{speaking.speakerName}{speaking.speakerClubShort ? <span className="text-xs" style={{ color: "var(--color-ink-3)" }}> ({speaking.speakerClubShort})</span> : null}</div>
              <div className="flex items-center gap-3 mt-2">
                <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: over ? "var(--color-no)" : "var(--color-ink)" }}>
                  {limit > 0 ? fmt(remaining!) : fmt(elapsed)}
                </span>
                {limit > 0 && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>limit {fmt(limit)}</span>}
              </div>
              <div className="flex gap-1 mt-2">
                <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} disabled={pending} onClick={() => adjust(speaking.id, -30)}>-30s</button>
                <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} disabled={pending} onClick={() => adjust(speaking.id, 30)}>+30s</button>
                <button className="btn btn-primary" style={{ padding: "3px 10px", fontSize: 12, marginLeft: "auto" }} disabled={pending} onClick={() => finish(speaking.id)}>Zakończ wniosek</button>
              </div>
            </div>
          );
        })()}

        {waiting.length === 0 && !speaking && (
          <div className="text-sm" style={{ color: "var(--color-ink-3)" }}>Brak zgłoszonych wniosków formalnych.</div>
        )}

        <ol className="flex flex-col gap-2">
          {waiting.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 py-2 border-b border-[var(--color-rule-soft)] last:border-0">
              <span className="mono text-xs" style={{ color: "var(--color-ink-3)", width: 20 }}>{i + 1}.</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.speakerName}{m.speakerClubShort ? <span className="text-xs" style={{ color: "var(--color-ink-3)" }}> ({m.speakerClubShort})</span> : null}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="text"
                  defaultValue={m.timeLimitSec ? String(m.timeLimitSec) : ""}
                  placeholder="sek"
                  title="Limit czasu wniosku (sekundy) - ustaw przed udzieleniem głosu"
                  style={{ width: 42, fontSize: 11, padding: "2px 4px", border: "1px solid var(--color-rule)", borderRadius: 4, textAlign: "center" }}
                  onBlur={(e) => {
                    const sec = parseInt(e.target.value, 10);
                    const val = Number.isFinite(sec) && sec > 0 ? sec : null;
                    if (val !== (m.timeLimitSec ?? null)) setLimit(m.id, val);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
                <button className="btn" style={{ padding: "2px 6px", fontSize: 11 }} disabled={pending || i === 0} onClick={() => reorder(m.id, "up")} title="W górę">↑</button>
                <button className="btn" style={{ padding: "2px 6px", fontSize: 11 }} disabled={pending || i === waiting.length - 1} onClick={() => reorder(m.id, "down")} title="W dół">↓</button>
                <button className="btn" style={{ padding: "2px 6px", fontSize: 11 }} disabled={pending || i === 0} onClick={() => reorder(m.id, "top")} title="Na początek">⤒</button>
                <button className="btn btn-primary" style={{ padding: "2px 8px", fontSize: 11 }} disabled={pending || !!speaking} onClick={() => give(m.id)}>Udziel głosu</button>
                <button className="btn" style={{ padding: "2px 6px", fontSize: 11, color: "var(--color-no)" }} disabled={pending} onClick={() => remove(m.id)} title="Odrzuć">✕</button>
              </div>
            </li>
          ))}
        </ol>

        {listId && (
          <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[var(--color-rule-soft)]">
            <select className="input" style={{ fontSize: 14, flex: 1 }} value={addUser} onChange={(e) => setAddUser(e.target.value)}>
              <option value="">- dopisz do wniosków -</option>
              {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}{!p.hasVotingRight && " (bez prawa)"}</option>)}
            </select>
            <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }} disabled={pending || !addUser} onClick={addToQueue}>Dopisz</button>
          </div>
        )}
      </div>
    </div>
  );
}
