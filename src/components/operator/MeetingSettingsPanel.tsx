"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CardHeader } from "./ui";
import { readUserError } from "@/lib/feedback";

interface Props {
  meetingId: string;
  settings: {
    quorumRule: string;
    quorumValue: number | null;
    autoOpenSpeakerList: boolean;
    displaySummaryAfterClose: boolean;
    agendaAutoDisplayMode: string;
    publicEnabled: boolean;
  };
}

const QUORUM_RULES: { value: string; label: string; needsValue?: "percent" | "count" }[] = [
  { value: "MORE_THAN_HALF", label: "Więcej niż połowa składu" },
  { value: "AT_LEAST_HALF", label: "Co najmniej połowa składu" },
  { value: "PERCENTAGE", label: "Procent składu", needsValue: "percent" },
  { value: "COUNT", label: "Stała liczba osób", needsValue: "count" },
  { value: "CUSTOM", label: "Własna (bez automatycznej kontroli)" },
];

export function MeetingSettingsPanel({ meetingId, settings }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rule, setRule] = useState(settings.quorumRule);
  const [value, setValue] = useState<string>(
    settings.quorumValue != null ? String(settings.quorumValue) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const activeRule = QUORUM_RULES.find((r) => r.value === rule);

  function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) setError(await readUserError(r));
      else router.refresh();
    });
  }

  function saveQuorum() {
    const body: Record<string, unknown> = { quorumRule: rule };
    if (activeRule?.needsValue) {
      const n = parseFloat(value.replace(",", "."));
      if (Number.isNaN(n)) { setError("Podaj wartość liczbową"); return; }
      body.quorumValue = n;
    } else {
      body.quorumValue = null;
    }
    patch(body);
  }

  return (
    <div className="card">
      <CardHeader title="Ustawienia posiedzenia" />

      <div className="card-body d-flex flex-column gap-3">
        <div>
          <label className="form-label">Reguła kworum</label>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <select
              className="form-select" style={{ maxWidth: 300, width: "auto" }}
              value={rule} disabled={pending}
              onChange={(e) => setRule(e.target.value)}
            >
              {QUORUM_RULES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {activeRule?.needsValue && (
              <input
                className="form-control" style={{ maxWidth: 110 }}
                type="number" min={0} step={1}
                placeholder={activeRule.needsValue === "percent" ? "np. 50" : "np. 8"}
                value={value} disabled={pending}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            {activeRule?.needsValue === "percent" && <span>%</span>}
          </div>
          <p className="form-text mt-1 mb-0">
            Reguła decyduje, ile osób musi być obecnych, aby posiedzenie było zdolne do podejmowania uchwał.
          </p>
        </div>

        <div className="form-check">
          <input
            type="checkbox" className="form-check-input" id="mspAutoOpenSpeakerList"
            checked={settings.autoOpenSpeakerList} disabled={pending}
            onChange={(e) => patch({ autoOpenSpeakerList: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="mspAutoOpenSpeakerList">
            Automatycznie otwieraj listę mówców
            <span className="d-block form-text">
              Po otwarciu punktu porządku obrad lista mówców włącza się sama, z możliwością samodzielnych zapisów.
            </span>
          </label>
        </div>

        <div className="form-check">
          <input
            type="checkbox" className="form-check-input" id="mspSummaryAfterClose"
            checked={settings.displaySummaryAfterClose} disabled={pending}
            onChange={(e) => patch({ displaySummaryAfterClose: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="mspSummaryAfterClose">
            Po zamknięciu głosowania pokazuj tylko podsumę
            <span className="d-block form-text">
              W trakcie głosowania wyświetlana jest tablica z nazwiskami, a po zamknięciu - sama podsuma wyników.
            </span>
          </label>
        </div>

        <div>
          <label className="form-label">Porządek obrad w auto-prezentacji</label>
          <div className="btn-group btn-group-sm" role="group" aria-label="Porządek obrad w auto-prezentacji">
            <button
              className={`btn ${settings.agendaAutoDisplayMode !== "SINGLE" ? "btn-primary" : ""}`}
              disabled={pending}
              onClick={() => patch({ agendaAutoDisplayMode: "FULL" })}
            >Cała lista</button>
            <button
              className={`btn ${settings.agendaAutoDisplayMode === "SINGLE" ? "btn-primary" : ""}`}
              disabled={pending}
              onClick={() => patch({ agendaAutoDisplayMode: "SINGLE" })}
            >Każdy punkt osobno</button>
          </div>
          <p className="form-text mt-1 mb-0">
            W trybie automatycznym: pokazywać całą listę porządku obrad, czy tylko bieżący punkt.
          </p>
        </div>

        <div className="form-check">
          <input
            type="checkbox" className="form-check-input" id="mspPublicEnabled"
            checked={settings.publicEnabled} disabled={pending}
            onChange={(e) => patch({ publicEnabled: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="mspPublicEnabled">
            Widok publiczny (bez logowania)
            <span className="d-block form-text">
              Udostępnia porządek obrad, materiały oznaczone jako publiczne i wyniki zakończonych
              głosowań (imienne dla jawnych, zbiorcze dla tajnych) pod adresem
              <code className="font-monospace"> /public/{meetingId}</code> - bez logowania.
            </span>
          </label>
        </div>

        <div className="pt-2">
          <button className="btn btn-primary" disabled={pending} onClick={saveQuorum}>
            Zapisz ustawienia kworum
          </button>
          <p className="form-text mt-1 mb-0">
            Pozostałe ustawienia (lista mówców, podsuma, porządek) zapisują się automatycznie po zmianie.
          </p>
        </div>

        {error && <div className="alert alert-danger py-2 mb-0 small">{error}</div>}
      </div>
    </div>
  );
}
