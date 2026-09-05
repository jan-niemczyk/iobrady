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
      <div className="card-header bg-white d-flex align-items-center justify-content-between">
        <h3 className="text-uppercase text-body-secondary small mb-0" style={{ letterSpacing: "0.06em" }}>Licznik czasu dyskusji</h3>
        <div className="form-check form-switch mb-0">
          <input className="form-check-input" type="checkbox" role="switch" id="dcpEnabled" checked={state.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          <label className="form-check-label small" htmlFor="dcpEnabled">Włączony</label>
        </div>
      </div>

      {state.enabled && (
        <div className="card-body d-flex flex-column gap-3">
          {/* Podgląd łączny */}
          <div className="d-flex align-items-baseline justify-content-between">
            <span className="small text-body-secondary">Dyskusja łącznie</span>
            <span className="font-monospace" style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: over ? "var(--color-no)" : "var(--color-ink)" }}>
              {fmt(display)}
              {state.budgetSec != null && state.mode === "COUNT_DOWN" && (
                <span style={{ fontSize: 14, color: "var(--color-ink-3)", marginLeft: 8 }}>/ {fmt(state.budgetSec)}</span>
              )}
            </span>
          </div>

          {/* Konfiguracja */}
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label">Tryb</label>
              <select className="form-select" value={state.mode} onChange={(e) => patch({ mode: e.target.value })}>
                <option value="COUNT_UP">Licz w górę</option>
                <option value="COUNT_DOWN">Odliczaj w dół</option>
              </select>
            </div>
            <div className="col-6">
              <label className="form-label">Zakres</label>
              <select className="form-select" value={state.scope} onChange={(e) => patch({ scope: e.target.value })}>
                <option value="PER_AGENDA_ITEM">Per punkt</option>
                <option value="WHOLE_MEETING">Całe posiedzenie</option>
              </select>
            </div>
          </div>

          {state.mode === "COUNT_DOWN" && (
            <div className="d-flex align-items-end gap-2">
              <div className="flex-grow-1">
                <label className="form-label">Budżet łączny (min)</label>
                <input className="form-control" type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="np. 40" />
              </div>
              <button className="btn btn-outline-secondary" disabled={pending} onClick={() => patch({ budgetSec: budgetMin === "" ? null : Number(budgetMin) * 60 })}>Ustaw</button>
            </div>
          )}

          {/* Limity klubów */}
          {state.clubs.length > 0 && (
            <div>
              <div className="text-uppercase text-body-secondary small mb-2" style={{ letterSpacing: "0.06em" }}>Kluby</div>
              <div className="d-flex flex-column gap-2">
                {state.clubs.map((c) => (
                  <ClubRow key={c.clubShort} club={c} mode={state.mode} pending={pending}
                    onSetBudget={(sec) => patch({ clubBudgets: [{ clubShort: c.clubShort, budgetSec: sec }] })} />
                ))}
              </div>
            </div>
          )}

          <div className="d-flex justify-content-end pt-2 border-top">
            <button className="btn btn-outline-danger btn-sm" disabled={pending}
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
    <div className="d-flex align-items-center gap-2">
      <span className="small flex-grow-1 text-truncate">{club.clubShort}</span>
      <span className="font-monospace small" style={{ color: over ? "var(--color-no)" : "var(--color-ink-2)", fontVariantNumeric: "tabular-nums" }}>
        {fmt(club.elapsedSec)}{club.budgetSec != null ? ` / ${fmt(club.budgetSec)}` : ""}
      </span>
      {mode === "COUNT_DOWN" && (
        <>
          <input className="form-control form-control-sm" type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} placeholder="min" style={{ width: 70 }} />
          <button className="btn btn-outline-secondary btn-sm" disabled={pending} onClick={() => onSetBudget(min === "" ? null : Number(min) * 60)}>Ustaw</button>
        </>
      )}
    </div>
  );
}
