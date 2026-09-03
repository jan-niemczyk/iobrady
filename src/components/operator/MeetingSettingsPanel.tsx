"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  meetingId: string;
  settings: {
    quorumRule: string;
    quorumValue: number | null;
    autoOpenSpeakerList: boolean;
    displaySummaryAfterClose: boolean;
    agendaAutoDisplayMode: string;
    holdResults: boolean;
    publishResultsAutomatically: boolean;
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
      if (!r.ok) setError(await r.text());
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
    <div className="card no-grid">
      <div className="px-5 py-3 border-b border-[var(--color-rule)]">
        <h2 className="text-sm font-medium">Ustawienia posiedzenia</h2>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        <div>
          <label className="label">Reguła kworum</label>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="input" style={{ maxWidth: 300 }}
              value={rule} disabled={pending}
              onChange={(e) => setRule(e.target.value)}
            >
              {QUORUM_RULES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {activeRule?.needsValue && (
              <input
                className="input" style={{ maxWidth: 110 }}
                type="number" min={0} step={1}
                placeholder={activeRule.needsValue === "percent" ? "np. 50" : "np. 8"}
                value={value} disabled={pending}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            {activeRule?.needsValue === "percent" && <span className="text-sm">%</span>}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
            Reguła decyduje, ile osób musi być obecnych, aby posiedzenie było zdolne do podejmowania uchwał.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox" className="mt-1"
            checked={settings.autoOpenSpeakerList} disabled={pending}
            onChange={(e) => patch({ autoOpenSpeakerList: e.target.checked })}
          />
          <span>
            Automatycznie otwieraj listę mówców
            <span className="block text-xs" style={{ color: "var(--color-ink-3)" }}>
              Po otwarciu punktu porządku obrad lista mówców włącza się sama, z możliwością samodzielnych zapisów.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox" className="mt-1"
            checked={settings.displaySummaryAfterClose} disabled={pending}
            onChange={(e) => patch({ displaySummaryAfterClose: e.target.checked })}
          />
          <span>
            Po zamknięciu głosowania pokazuj tylko podsumę
            <span className="block text-xs" style={{ color: "var(--color-ink-3)" }}>
              W trakcie głosowania wyświetlana jest tablica z nazwiskami, a po zamknięciu - sama podsuma wyników.
            </span>
          </span>
        </label>

        <div>
          <label className="label">Porządek obrad w auto-prezentacji</label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className={`btn btn-sm ${settings.agendaAutoDisplayMode !== "SINGLE" ? "btn-primary" : ""}`}
              disabled={pending}
              onClick={() => patch({ agendaAutoDisplayMode: "FULL" })}
            >Cała lista</button>
            <button
              className={`btn btn-sm ${settings.agendaAutoDisplayMode === "SINGLE" ? "btn-primary" : ""}`}
              disabled={pending}
              onClick={() => patch({ agendaAutoDisplayMode: "SINGLE" })}
            >Każdy punkt osobno</button>
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
            W trybie automatycznym: pokazywać całą listę porządku obrad, czy tylko bieżący punkt.
          </p>
        </div>

        <div className="pt-2">
          <button className="btn btn-primary" disabled={pending} onClick={saveQuorum}>
            Zapisz ustawienia kworum
          </button>
          <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
            Pozostałe ustawienia (lista mówców, podsuma, porządek) zapisują się automatycznie po zmianie.
          </p>
        </div>

        {error && <div className="text-sm" style={{ color: "var(--color-seal)" }}>{error}</div>}
      </div>
    </div>
  );
}
