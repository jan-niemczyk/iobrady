"use client";

import { useState, useTransition } from "react";
import type { MajorityKind, MajorityBase, QuorumRule, AttendanceMode, VoteVisibility } from "@prisma/client";

interface Settings {
  organizationName: string;
  groupsEnabled: boolean;
  defaultQuorumRule: QuorumRule;
  defaultQuorumValue: number | null;
  defaultMajorityKind: MajorityKind;
  defaultMajorityBase: MajorityBase;
  defaultAttendanceMode: AttendanceMode;
  defaultVoteVisibility: VoteVisibility;
  autoPublishResults: boolean;
  sessionTimeoutMinutes: number;
  presentationFont: string;
  presentationHeaderColor: string;
  presentationLogoUrl: string | null;
  firstVoteFinalOpen: boolean;
  firstVoteFinalSecret: boolean;
  defaultSpeechLimitSec: number | null;
  defaultAdVocemLimitSec: number | null;
  defaultFormalMotionLimitSec: number | null;
  autoAdHocOnFormalMotion: boolean;
  speechOvertimeSound: boolean;
  overlayFont: string;
  overlayResultsMode: string;
  overlayBoardTiming: string;
  overlayShowSpeechClock: boolean;
  defaultShowCastCount: boolean;
  defaultShowByName: boolean;
  defaultShowIndividualVotes: boolean;
  colorItemBar: string;
  colorSpeakerBar: string;
  colorVoteBar: string;
  colorSessionBar: string;
}

const QUORUM_LABELS: Record<QuorumRule, string> = {
  MORE_THAN_HALF: "Więcej niż połowa składu",
  AT_LEAST_HALF: "Co najmniej połowa składu",
  PERCENTAGE: "Procent składu (PERCENTAGE)",
  COUNT: "Konkretna liczba osób (COUNT)",
  CUSTOM: "Reguła własna",
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!r.ok) { alert(await r.text()); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="card p-8 space-y-6">
      <div>
        <label className="label">Nazwa organizacji</label>
        <input className="input" value={s.organizationName} onChange={(e) => update("organizationName", e.target.value)} />
        <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Wyświetlana w nagłówkach raportów i protokołów.</p>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={s.groupsEnabled} onChange={(e) => update("groupsEnabled", e.target.checked)} />
          <span>Włącz kluby / koła</span>
        </label>
        <p className="text-xs mt-1 ml-6" style={{ color: "var(--color-ink-3)" }}>
          Gdy wyłączone - uczestnicy są listowani bez przynależności grupowej.
        </p>
      </div>

      <div className="border-t border-[var(--color-rule-soft)] pt-6">
        <h3 className="eyebrow mb-3">Domyślne wartości dla nowych posiedzeń</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Reguła kworum</label>
            <select className="input" value={s.defaultQuorumRule} onChange={(e) => update("defaultQuorumRule", e.target.value as QuorumRule)}>
              {Object.entries(QUORUM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Wartość (% lub liczba)</label>
            <input
              type="number"
              className="input"
              value={s.defaultQuorumValue ?? ""}
              onChange={(e) => update("defaultQuorumValue", e.target.value === "" ? null : parseFloat(e.target.value))}
              placeholder="dla PERCENTAGE / COUNT"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">Domyślny typ większości</label>
            <select className="input" value={s.defaultMajorityKind} onChange={(e) => update("defaultMajorityKind", e.target.value as MajorityKind)}>
              <option value="SIMPLE">Zwykła</option>
              <option value="ABSOLUTE">Bezwzględna</option>
              <option value="QUALIFIED_TWO_THIRDS">Kwalifikowana 2/3</option>
              <option value="QUALIFIED_THREE_FIFTHS">Kwalifikowana 3/5</option>
            </select>
          </div>
          <div>
            <label className="label">Domyślny mianownik</label>
            <select
              className="input"
              value={s.defaultMajorityBase}
              onChange={(e) => update("defaultMajorityBase", e.target.value as MajorityBase)}
              disabled={s.defaultMajorityKind === "SIMPLE"}
            >
              <option value="OF_VOTERS">Od głosujących</option>
              <option value="OF_PRESENT">Od obecnych</option>
              <option value="OF_FULL_BODY">Od pełnego składu</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">Domyślna widoczność głosowań</label>
            <select className="input" value={s.defaultVoteVisibility} onChange={(e) => update("defaultVoteVisibility", e.target.value as VoteVisibility)}>
              <option value="OPEN">Jawne</option>
              <option value="SECRET">Tajne</option>
            </select>
          </div>
          <div></div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">Tryb listy obecności</label>
            <select className="input" value={s.defaultAttendanceMode} onChange={(e) => update("defaultAttendanceMode", e.target.value as AttendanceMode)}>
              <option value="MANUAL">Operator ręcznie</option>
              <option value="SELF_CONFIRMATION">Samodzielne potwierdzenie</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 mt-4 cursor-pointer" style={{ display: "none" }}>
          {/* Funkcja związana z ekranem prezentacyjnym - ukryta do czasu jego implementacji */}
          <input type="checkbox" checked={s.autoPublishResults} onChange={(e) => update("autoPublishResults", e.target.checked)} />
          <span>Publikuj wyniki głosowań automatycznie po zamknięciu</span>
        </label>
      </div>

      {/* ─── PREZENTACJA ─────────────────────────────────────────── */}
      <div className="border-t border-[var(--color-rule-soft)] pt-6">
        <h2 className="text-sm font-semibold mb-4">Prezentacja (ekran sali)</h2>

        <div className="mb-5 space-y-2">
          <div className="text-xs mb-1" style={{ color: "var(--color-ink-3)" }}>
            Domyślne dla nowych posiedzeń (można zmienić per posiedzenie w panelu prezentacji):
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={s.defaultShowCastCount} onChange={(e) => update("defaultShowCastCount", e.target.checked)} />
            <span>Pokaż licznik oddanych głosów w trakcie głosowania</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={s.defaultShowByName} onChange={(e) => update("defaultShowByName", e.target.checked)} />
            <span>Pokazuj imienne wyniki głosowań jawnych (tablica)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={s.defaultShowIndividualVotes} onChange={(e) => update("defaultShowIndividualVotes", e.target.checked)} />
            <span>Pokazuj indywidualne stanowiska (za / przeciw / wstrzym.)</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Czcionka prezentacji</label>
            <select className="input" value={s.presentationFont} onChange={(e) => update("presentationFont", e.target.value)}>
              <option value="Inter">Inter</option>
              <option value="Lato">Lato</option>
              <option value="Roboto">Roboto</option>
              <option value="DM Sans">DM Sans</option>
              <option value="Source Sans Pro">Source Sans Pro</option>
              <option value="Outfit">Outfit</option>
              <option value="Open Sans">Open Sans</option>
              <option value="Segoe UI">Segoe UI (Windows)</option>
            </select>
          </div>
          <div>
            <label className="label">Kolor nagłówka</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={s.presentationHeaderColor}
                onChange={(e) => update("presentationHeaderColor", e.target.value)}
                style={{ width: 44, height: 38, padding: 2, border: "1px solid var(--color-rule)", borderRadius: 4, cursor: "pointer" }}
              />
              <input
                className="input" style={{ maxWidth: 130 }}
                value={s.presentationHeaderColor}
                onChange={(e) => update("presentationHeaderColor", e.target.value)}
                placeholder="#0B2A4A"
              />
              <button type="button" className="btn btn-sm" onClick={() => update("presentationHeaderColor", "#FFFFFF")}>
                Biały (bez koloru)
              </button>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Domyślnie ciemny morski granat. Biały = pasek bez koloru.</p>
          </div>
        </div>

        <div className="mt-4">
          <label className="label">Logo w nagłówku (opcjonalne)</label>
          <div className="flex items-center gap-3">
            {s.presentationLogoUrl && (
              <img src={s.presentationLogoUrl} alt="logo" style={{ height: 40, width: "auto", objectFit: "contain", border: "1px solid var(--color-rule-soft)", borderRadius: 4, padding: 2 }} />
            )}
            <label className="btn" style={{ cursor: pending ? "default" : "pointer" }}>
              {s.presentationLogoUrl ? "Zmień logo…" : "Wybierz plik…"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                disabled={pending}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2_000_000) { alert("Logo za duże (max 2 MB)."); return; }
                  const fd = new FormData();
                  fd.append("file", file);
                  const r = await fetch("/api/settings/logo", { method: "POST", body: fd });
                  if (!r.ok) { alert(await r.text()); return; }
                  const { url } = await r.json();
                  update("presentationLogoUrl", url);
                }}
              />
            </label>
            {s.presentationLogoUrl && (
              <button type="button" className="btn btn-sm" onClick={async () => {
                await fetch("/api/settings/logo", { method: "DELETE" });
                update("presentationLogoUrl", null);
              }}>Usuń logo</button>
            )}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Logo zastępuje pionowy pasek akcentu w nagłówku. PNG/JPG/SVG/WEBP, max 2 MB. Zapisywane na serwerze.</p>
        </div>
      </div>

      {/* ─── TRANSMISJA (NAKŁADKA OBS) ─────────────────────────────── */}
      <div className="border-t border-[var(--color-rule-soft)] pt-6">
        <h2 className="text-sm font-semibold mb-4">Transmisja (nakładka OBS)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Czcionka transmisji</label>
            <select className="input" value={s.overlayFont} onChange={(e) => update("overlayFont", e.target.value)}>
              <option value="Inter">Inter</option>
              <option value="Lato">Lato</option>
              <option value="Roboto">Roboto</option>
              <option value="DM Sans">DM Sans</option>
              <option value="Source Sans Pro">Source Sans Pro</option>
              <option value="Outfit">Outfit</option>
              <option value="Open Sans">Open Sans</option>
              <option value="Segoe UI">Segoe UI (Windows)</option>
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Niezależna od czcionki prezentacji.</p>
          </div>
          <div>
            <label className="label">Wyniki głosowania na transmisji</label>
            <select className="input" value={s.overlayResultsMode} onChange={(e) => update("overlayResultsMode", e.target.value)}>
              <option value="BARS">Poziome paski (podsuma)</option>
              <option value="BOARD">Tablica jak na prezentacji</option>
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Sposób pokazywania wyników po zamknięciu głosowania.</p>
          </div>
          <div>
            <label className="label">Tablica na transmisji - kiedy</label>
            <select className="input" value={s.overlayBoardTiming} onChange={(e) => update("overlayBoardTiming", e.target.value)}>
              <option value="AFTER_CLOSE">Dopiero po zamknięciu głosowania</option>
              <option value="FROM_START">Już od rozpoczęcia głosowania</option>
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Dotyczy trybu „Tablica jak na prezentacji".</p>
          </div>
        </div>
        <label className="flex items-start gap-2 cursor-pointer mt-4">
          <input type="checkbox" className="mt-1" checked={s.overlayShowSpeechClock} onChange={(e) => update("overlayShowSpeechClock", e.target.checked)} />
          <span>
            Pokazuj licznik czasu wypowiedzi na transmisji
            <span className="block text-xs" style={{ color: "var(--color-ink-3)" }}>Widoczny przy mówcy, gdy wystąpienie ma ustawiony limit czasu.</span>
          </span>
        </label>

        <div className="mt-5">
          <label className="label">Kolory teł pasków (prezentacja i transmisja)</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1">
            {([
              ["colorSessionBar", "Nazwa posiedzenia"],
              ["colorItemBar", "Punkt porządku"],
              ["colorSpeakerBar", "Mówca"],
              ["colorVoteBar", "Głosowanie"],
            ] as const).map(([key, lbl]) => (
              <div key={key}>
                <div className="text-xs mb-1" style={{ color: "var(--color-ink-3)" }}>{lbl}</div>
                <div className="flex items-center gap-2">
                  <input type="color" value={s[key]} onChange={(e) => update(key, e.target.value)} style={{ width: 40, height: 32, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                  <input className="input" style={{ fontSize: 12 }} value={s[key]} onChange={(e) => update(key, e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── ZACHOWANIE GŁOSOWAŃ ─────────────────────────────────── */}
      <div className="border-t border-[var(--color-rule-soft)] pt-6">
        <h2 className="text-sm font-semibold mb-4">Zachowanie głosowań</h2>
        <label className="flex items-start gap-2 cursor-pointer mb-3">
          <input type="checkbox" className="mt-1" checked={s.firstVoteFinalOpen} onChange={(e) => update("firstVoteFinalOpen", e.target.checked)} />
          <span>
            Pierwszy głos ostateczny - głosowania <strong>jawne</strong>
            <span className="block text-xs" style={{ color: "var(--color-ink-3)" }}>Po oddaniu głosu radny nie może go już zmienić. W głosowaniach <strong>tajnych</strong> głos jest zawsze jednorazowy (wynika z anonimowości) - niezależnie od tego ustawienia.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer mb-3">
          <input type="checkbox" className="mt-1" checked={s.autoAdHocOnFormalMotion} onChange={(e) => update("autoAdHocOnFormalMotion", e.target.checked)} />
          <span>
            Automatyczne głosowanie przy wniosku formalnym
            <span className="block text-xs" style={{ color: "var(--color-ink-3)" }}>Rozpoczęcie wystąpienia „wniosek formalny" tworzy głosowanie ad hoc „wniosek formalny: Nazwisko Imię".</span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={s.speechOvertimeSound} onChange={(e) => update("speechOvertimeSound", e.target.checked)} />
          <span>
            Sygnał dźwiękowy po przekroczeniu czasu wypowiedzi
            <span className="block text-xs" style={{ color: "var(--color-ink-3)" }}>Prezentacja odtwarza trzy gongi, gdy mówca przekroczy limit czasu.</span>
          </span>
        </label>
      </div>

      <div className="border-t border-[var(--color-rule-soft)] pt-6">
        <h3 className="text-sm font-semibold mb-1">Domyślne limity czasu wypowiedzi</h3>
        <p className="text-xs mb-3" style={{ color: "var(--color-ink-3)" }}>
          W sekundach; puste = bez limitu. Stosowane przy nowych wystąpieniach; można je zmienić na bieżąco przy każdym mówcy.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Przemówienie</label>
            <input
              className="input" type="number" min={0} placeholder="bez limitu"
              value={s.defaultSpeechLimitSec ?? ""}
              onChange={(e) => update("defaultSpeechLimitSec", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Ad vocem</label>
            <input
              className="input" type="number" min={0} placeholder="bez limitu"
              value={s.defaultAdVocemLimitSec ?? ""}
              onChange={(e) => update("defaultAdVocemLimitSec", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Wniosek formalny</label>
            <input
              className="input" type="number" min={0} placeholder="bez limitu"
              value={s.defaultFormalMotionLimitSec ?? ""}
              onChange={(e) => update("defaultFormalMotionLimitSec", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-rule-soft)] pt-6 flex items-center justify-end gap-3">
        {saved && <span className="text-sm" style={{ color: "var(--color-yes)" }}>✓ Zapisano</span>}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Zapisuję…" : "Zapisz ustawienia"}
        </button>
      </div>
    </form>
  );
}
