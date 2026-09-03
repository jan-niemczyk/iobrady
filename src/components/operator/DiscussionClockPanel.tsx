"use client";

import { useEffect, useState, useTransition } from "react";

interface ClubClock { clubShort: string; budgetSec: number | null; elapsedSec: number }
interface ClockState {
  enabled: boolean;
  mode: "COUNT_UP" | "COUNT_DOWN";
  scope: "PER_AGENDA_ITEM" | "WHOLE_MEETING";
  budgetSec: number | null;
  elapsedSec: number;
  runningSince: string | null;
  clubs: ClubClock[];
}

function fmt(sec: number): string {
  const neg = sec < 0; const s = Math.abs(Math.floor(sec));
  const mm = Math.floor(s / 60), ss = s % 60;
  return `${neg ? "−" : ""}${mm}:${String(ss).padStart(2, "0")}`;
}

// Panel operatora: konfiguracja licznika netto dyskusji + podgląd (łączny + kluby).
export function DiscussionClockPanel({ meetingId }: { meetingId: string }) {
  const [state, setState] = useState<ClockState | null>(null);
  const [pending, startTransition] = useTransition();
  const [budgetMin, setBudgetMin] = useState("");
  const [, setTick] = useState(0);

  const load = () => {
    fetch(`/api/meetings/${meetingId}/discussion-clock`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setState(d); if (d.budgetSec != null) setBudgetMin(String(Math.round(d.budgetSec / 60))); } })
      .catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // Sekundowe tykanie podglądu, gdy trwa wypowiedź.
  useEffect(() => {
    if (!state?.runningSince) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [state?.runningSince]);

  function patch(body: Record<string, unknown>) {
    startTransition(async () => {
      await fetch(`/api/meetings/${meetingId}/discussion-clock`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      load();
    });
  }

  if (!state) return null;

  // Podgląd na żywo: doliczamy czas trwającej wypowiedzi.
  const runningExtra = state.runningSince ? Math.floor((Date.now() - new Date(state.runningSince).getTime()) / 1000) : 0;
  const liveElapsed = state.elapsedSec + runningExtra;
  const remaining = state.budgetSec != null ? state.budgetSec - liveElapsed : null;
  const display = state.mode === "COUNT_DOWN" && remaining != null ? remaining : liveElapsed;
  const over = state.mode === "COUNT_DOWN" && remaining != null && remaining < 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-rule-soft)]">
        <h3 className="eyebrow" style={{ margin: 0 }}>Licznik czasu dyskusji</h3>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={state.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          <span>Włączony</span>
        </label>
      </div>

      {state.enabled && (
        <div className="p-4 space-y-4">
          {/* Podgląd łączny */}
          <div className="flex items-baseline justify-between">
            <span className="text-sm" style={{ color: "var(--color-ink-3)" }}>Dyskusja łącznie</span>
            <span className="mono" style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: over ? "var(--color-no)" : "var(--color-ink)" }}>
              {fmt(display)}
              {state.budgetSec != null && state.mode === "COUNT_DOWN" && (
                <span style={{ fontSize: 14, color: "var(--color-ink-3)", marginLeft: 8 }}>/ {fmt(state.budgetSec)}</span>
              )}
            </span>
          </div>

          {/* Konfiguracja */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tryb</label>
              <select className="input" value={state.mode} onChange={(e) => patch({ mode: e.target.value })}>
                <option value="COUNT_UP">Licz w górę</option>
                <option value="COUNT_DOWN">Odliczaj w dół</option>
              </select>
            </div>
            <div>
              <label className="label">Zakres</label>
              <select className="input" value={state.scope} onChange={(e) => patch({ scope: e.target.value })}>
                <option value="PER_AGENDA_ITEM">Per punkt</option>
                <option value="WHOLE_MEETING">Całe posiedzenie</option>
              </select>
            </div>
          </div>

          {state.mode === "COUNT_DOWN" && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="label">Budżet łączny (min)</label>
                <input className="input" type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="np. 40" />
              </div>
              <button className="btn" disabled={pending} onClick={() => patch({ budgetSec: budgetMin === "" ? null : Number(budgetMin) * 60 })}>Ustaw</button>
            </div>
          )}

          {/* Limity klubów */}
          {state.clubs.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Kluby</div>
              <div className="flex flex-col gap-2">
                {state.clubs.map((c) => (
                  <ClubRow key={c.clubShort} club={c} mode={state.mode} pending={pending}
                    onSetBudget={(sec) => patch({ clubBudgets: [{ clubShort: c.clubShort, budgetSec: sec }] })} />
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-[var(--color-rule-soft)]">
            <button className="btn" style={{ color: "var(--color-no)" }} disabled={pending}
              onClick={() => { if (window.confirm("Wyzerować naliczony czas dyskusji (łączny i kluby)?")) patch({ reset: true }); }}>
              Wyzeruj naliczony czas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClubRow({ club, mode, pending, onSetBudget }: {
  club: ClubClock; mode: string; pending: boolean; onSetBudget: (sec: number | null) => void;
}) {
  const [min, setMin] = useState(club.budgetSec != null ? String(Math.round(club.budgetSec / 60)) : "");
  const over = mode === "COUNT_DOWN" && club.budgetSec != null && club.elapsedSec > club.budgetSec;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm flex-1 truncate">{club.clubShort}</span>
      <span className="mono text-sm" style={{ color: over ? "var(--color-no)" : "var(--color-ink-2)", fontVariantNumeric: "tabular-nums" }}>
        {fmt(club.elapsedSec)}{club.budgetSec != null ? ` / ${fmt(club.budgetSec)}` : ""}
      </span>
      {mode === "COUNT_DOWN" && (
        <>
          <input className="input" type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} placeholder="min" style={{ width: 70, fontSize: 12 }} />
          <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} disabled={pending} onClick={() => onSetBudget(min === "" ? null : Number(min) * 60)}>Ustaw</button>
        </>
      )}
    </div>
  );
}
