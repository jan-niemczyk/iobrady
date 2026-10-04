"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CardHeader } from "@/components/operator/ui";
import { useHotkeys } from "@/lib/useHotkeys";
import { EntryLimitSwitch } from "@/components/operator/SpeakersPanel";

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
  limitEnabled: boolean;
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
  // Przełącznik limitu kolejki - zapamiętany na całe posiedzenie.
  const [limitEnabled, setLimitEnabled] = useState(true);
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
        if (typeof d.limitEnabled === "boolean") setLimitEnabled(d.limitEnabled);
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
  function setEntryLimitEnabled(entryId: string, value: boolean) {
    startTransition(async () => {
      await fetch(`/api/speaker-entries/${entryId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limitEnabled: value }),
      });
      load();
    });
  }
  function setListLimitEnabled(value: boolean) {
    if (!listId) return;
    setLimitEnabled(value);
    startTransition(async () => {
      await fetch(`/api/speakerlists/${listId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limitEnabled: value }),
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
        <div
          className="toast show position-fixed top-0 end-0 m-3 text-bg-danger border-0 shadow"
          style={{ zIndex: 1100, cursor: "pointer" }}
          role="alert"
          onClick={() => setToast(null)}
        >
          <div className="toast-body">
            <div className="small opacity-75">Wniosek formalny</div>
            <div className="fw-semibold">{toast}</div>
          </div>
        </div>
      )}
      <CardHeader
        title="Wnioski formalne"
        right={
          <div className="d-flex flex-wrap align-items-center gap-3">
            <div className="form-check form-switch mb-0 small" title="Limit czasu wniosków formalnych (stan zapamiętywany na całe posiedzenie). Bez limitu czas liczy się w górę.">
              <input className="form-check-input" type="checkbox" role="switch" id="fm-limit" checked={limitEnabled} disabled={pending || !listId} onChange={(e) => setListLimitEnabled(e.target.checked)} />
              <label className="form-check-label" htmlFor="fm-limit">{limitEnabled ? "Limit" : "Bez limitu"}</label>
            </div>
            <div className="form-check form-switch mb-0 small">
              <input className="form-check-input" type="checkbox" role="switch" id="fm-anytime" checked={allowAnytime} onChange={(e) => onToggleAllow(e.target.checked)} />
              <label className="form-check-label" htmlFor="fm-anytime">Dozwolone w każdej chwili</label>
            </div>
          </div>
        }
      />

      {speaking && (() => {
        const limit = (speaking.timeLimitSec ?? 0) + (speaking.timeAdjustmentSec ?? 0);
        const started = speaking.startedAt ? new Date(speaking.startedAt).getTime() : now;
        const elapsed = Math.floor((now - started) / 1000);
        const remaining = limit > 0 ? limit - elapsed : null;
        const over = remaining != null && remaining < 0;
        const fmt = (s: number) => `${s < 0 ? "-" : ""}${String(Math.floor(Math.abs(s) / 60)).padStart(2, "0")}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
        return (
          <div className="card-body bg-danger-subtle border-bottom border-danger-subtle">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div className="min-w-0">
                <div className="small fw-semibold text-danger">Trwa wniosek</div>
                <div className="fw-semibold">{speaking.speakerName}{speaking.speakerClubShort ? <span className="small text-body-secondary fw-normal"> ({speaking.speakerClubShort})</span> : null}</div>
              </div>
              <div className="text-end">
                <div className={`num fs-4 fw-semibold lh-1${over ? " text-danger" : ""}`}>{limit > 0 ? fmt(remaining!) : fmt(elapsed)}</div>
                {limit > 0 && <div className="small text-body-secondary">limit {fmt(limit)}</div>}
              </div>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <EntryLimitSwitch entry={speaking} disabled={pending} onChange={(v) => setEntryLimitEnabled(speaking.id, v)} />
                <div className="btn-group btn-group-sm" role="group" aria-label="Korekta czasu">
                  <button className="btn" disabled={pending} onClick={() => adjust(speaking.id, -30)}>-30 s</button>
                  <button className="btn" disabled={pending} onClick={() => adjust(speaking.id, 30)}>+30 s</button>
                </div>
                <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => finish(speaking.id)}>Zakończ wniosek</button>
              </div>
            </div>
          </div>
        );
      })()}

      {waiting.length > 0 ? (
        <ol className="list-group list-group-flush">
          {waiting.map((m, i) => (
            <li key={m.id} className="list-group-item d-flex flex-wrap align-items-center gap-2">
              <span className="row-num mono small">{i + 1}.</span>
              <div className="min-w-0 flex-grow-1 text-truncate" style={{ flexBasis: 140 }} title={m.speakerName ?? undefined}>
                {m.speakerName}{m.speakerClubShort ? <span className="small text-body-secondary"> ({m.speakerClubShort})</span> : null}
              </div>
              <div className="d-flex align-items-center gap-1 ms-auto">
                <EntryLimitSwitch entry={m} disabled={pending} onChange={(v) => setEntryLimitEnabled(m.id, v)} />
                {m.limitEnabled && <div className="input-group input-group-sm" style={{ width: 96 }} title="Limit czasu wniosku (sekundy) - ustaw przed udzieleniem głosu">
                  <input
                    className="form-control mono text-center"
                    type="text"
                    inputMode="numeric"
                    aria-label="Limit czasu (s)"
                    defaultValue={m.timeLimitSec ? String(m.timeLimitSec) : ""}
                    placeholder="limit"
                    onBlur={(e) => {
                      const sec = parseInt(e.target.value, 10);
                      const val = Number.isFinite(sec) && sec > 0 ? sec : null;
                      if (val !== (m.timeLimitSec ?? null)) setLimit(m.id, val);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                  <span className="input-group-text">s</span>
                </div>}
                <div className="btn-group btn-group-sm" role="group" aria-label="Kolejność">
                  <button className="btn" disabled={pending || i === 0} onClick={() => reorder(m.id, "up")} title="W górę">↑</button>
                  <button className="btn" disabled={pending || i === waiting.length - 1} onClick={() => reorder(m.id, "down")} title="W dół">↓</button>
                  <button className="btn" disabled={pending || i === 0} onClick={() => reorder(m.id, "top")} title="Na początek">⤒</button>
                </div>
                <button className="btn btn-primary btn-sm" disabled={pending || !!speaking} onClick={() => give(m.id)}>Udziel głosu</button>
                <button className="btn btn-sm btn-outline-danger" disabled={pending} onClick={() => remove(m.id)} title="Odrzuć wniosek" aria-label="Odrzuć wniosek">✕</button>
              </div>
            </li>
          ))}
        </ol>
      ) : !speaking && (
        <div className="card-body small text-body-secondary">Brak zgłoszonych wniosków formalnych.</div>
      )}

      {listId && (
        <div className="card-footer bg-body-tertiary">
          <div className="input-group">
            <select className="form-select" aria-label="Uczestnik do dopisania" value={addUser} onChange={(e) => setAddUser(e.target.value)}>
              <option value="">Dopisz do wniosków…</option>
              {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}{!p.hasVotingRight && " (bez prawa)"}</option>)}
            </select>
            <button className="btn" disabled={pending || !addUser} onClick={addToQueue}>Dopisz</button>
          </div>
        </div>
      )}
    </div>
  );
}
