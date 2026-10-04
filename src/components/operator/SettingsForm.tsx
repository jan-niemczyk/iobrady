"use client";

import { useState, useTransition } from "react";
import type React from "react";
import { CardHeader } from "./ui";
import { RepresentationBoard } from "@/components/presentation/RepresentationBoard";
import { resolveBoardLogo } from "@/lib/board";
import { PRESENTATION_FONTS, fontStack } from "@/lib/presentationFonts";
import { ask, notify, notifyFailure, readUserError } from "@/lib/feedback";
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
  sessionIdleMinutes: number;
  logoutParticipantsOnMeetingClose: boolean;
  retentionAuditDays: number | null;
  retentionLoginDays: number | null;
  retentionEmailLogDays: number | null;
  presentationFont: string;
  presentationHeaderColor: string;
  /** Własny kolor planszy; null = kolor nagłówka. */
  boardColor: string | null;
  presentationLogoUrl: string | null;
  /** Białe logo na ciemne tła; null = wszędzie logo domyślne. */
  presentationLogoLightUrl: string | null;
  /** Czcionka planszy reprezentacyjnej; null = czcionka prezentacji. */
  boardFont: string | null;
  boardBackgroundUrl: string | null;
  boardLogoMode: string;
  boardLogoUrl: string | null;
  boardText: string | null;
  boardOverlayOpacity: number;
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
  defaultMaterialsVisibleToParticipants: boolean;
  defaultMaterialsPublic: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  /** Czy hasło SMTP jest zapisane - samo hasło nigdy nie trafia do przeglądarki (SA-11). */
  smtpPasswordSet: boolean;
  /** Nowe hasło SMTP do zapisania (puste = bez zmian). */
  smtpPassword?: string;
  /** Usuń zapisane hasło SMTP. */
  smtpPasswordClear?: boolean;
  smtpFrom: string | null;
}

const QUORUM_LABELS: Record<QuorumRule, string> = {
  MORE_THAN_HALF: "Więcej niż połowa składu",
  AT_LEAST_HALF: "Co najmniej połowa składu",
  PERCENTAGE: "Procent składu (PERCENTAGE)",
  COUNT: "Konkretna liczba osób (COUNT)",
  CUSTOM: "Reguła własna",
};

export function SettingsForm({ initial }: { initial: Settings }) {
  // Tekst planszy: dopóki nie ustawiony - nazwa organizacji jako punkt wyjścia.
  const [s, setS] = useState({ ...initial, boardText: initial.boardText ?? initial.organizationName });
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
      if (!r.ok) { await notifyFailure(r); return; }
      // Hasło SMTP po zapisie nie wraca do formularza - tylko informacja, czy jest ustawione.
      setS((prev) => ({
        ...prev,
        smtpPasswordSet: prev.smtpPasswordClear ? false : prev.smtpPassword ? true : prev.smtpPasswordSet,
        smtpPassword: "", smtpPasswordClear: false,
      }));
      notify.success("Zmiany zapisano.");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="d-flex flex-column gap-4">
      <Section title="Organizacja">
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label" htmlFor="set-org">Nazwa organizacji</label>
            <input id="set-org" className="form-control" value={s.organizationName} onChange={(e) => update("organizationName", e.target.value)} />
            <div className="form-text">Wyświetlana w nagłówkach raportów i protokołów.</div>
          </div>
          <div className="col-12">
            <Check id="set-groups" checked={s.groupsEnabled} onChange={(v) => update("groupsEnabled", v)}
              label="Włącz kluby / koła" hint="Gdy wyłączone - uczestnicy są listowani bez przynależności grupowej." />
          </div>
        </div>
      </Section>

      <Section title="Domyślne wartości dla nowych posiedzeń">
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-qrule">Reguła kworum</label>
            <select id="set-qrule" className="form-select" value={s.defaultQuorumRule} onChange={(e) => update("defaultQuorumRule", e.target.value as QuorumRule)}>
              {Object.entries(QUORUM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-qval">Wartość (% lub liczba)</label>
            <input
              id="set-qval"
              type="number"
              className="form-control"
              value={s.defaultQuorumValue ?? ""}
              onChange={(e) => update("defaultQuorumValue", e.target.value === "" ? null : parseFloat(e.target.value))}
              placeholder="dla PERCENTAGE / COUNT"
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-mkind">Domyślny typ większości</label>
            <select id="set-mkind" className="form-select" value={s.defaultMajorityKind} onChange={(e) => update("defaultMajorityKind", e.target.value as MajorityKind)}>
              <option value="SIMPLE">Zwykła</option>
              <option value="ABSOLUTE">Bezwzględna</option>
              <option value="QUALIFIED_TWO_THIRDS">Kwalifikowana 2/3</option>
              <option value="QUALIFIED_THREE_FIFTHS">Kwalifikowana 3/5</option>
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-mbase">Domyślny mianownik</label>
            <select
              id="set-mbase"
              className="form-select"
              value={s.defaultMajorityBase}
              onChange={(e) => update("defaultMajorityBase", e.target.value as MajorityBase)}
              disabled={s.defaultMajorityKind === "SIMPLE"}
            >
              <option value="OF_VOTERS">Od głosujących</option>
              <option value="OF_PRESENT">Od obecnych</option>
              <option value="OF_FULL_BODY">Od pełnego składu</option>
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-vis">Domyślna widoczność głosowań</label>
            <select id="set-vis" className="form-select" value={s.defaultVoteVisibility} onChange={(e) => update("defaultVoteVisibility", e.target.value as VoteVisibility)}>
              <option value="OPEN">Jawne</option>
              <option value="SECRET">Tajne</option>
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-att">Tryb listy obecności</label>
            <select id="set-att" className="form-select" value={s.defaultAttendanceMode} onChange={(e) => update("defaultAttendanceMode", e.target.value as AttendanceMode)}>
              <option value="MANUAL">Operator ręcznie</option>
              <option value="SELF_CONFIRMATION">Samodzielne potwierdzenie</option>
            </select>
          </div>
        </div>

      </Section>

      {/* ─── PREZENTACJA ─────────────────────────────────────────── */}
      <Section title="Prezentacja (ekran sali)">
        <p className="small text-body-secondary mb-2">
          Domyślne dla nowych posiedzeń (można zmienić per posiedzenie w panelu prezentacji):
        </p>
        <div className="d-flex flex-column gap-2 mb-4">
          <Check id="set-castcount" checked={s.defaultShowCastCount} onChange={(v) => update("defaultShowCastCount", v)}
            label="Pokaż licznik oddanych głosów w trakcie głosowania" />
          <Check id="set-byname" checked={s.defaultShowByName} onChange={(v) => update("defaultShowByName", v)}
            label="Pokazuj imienne wyniki głosowań jawnych (tablica)" />
          <Check id="set-indiv" checked={s.defaultShowIndividualVotes} onChange={(v) => update("defaultShowIndividualVotes", v)}
            label="Pokazuj indywidualne stanowiska (za / przeciw / wstrzym.)" />
        </div>

        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-pfont">Czcionka prezentacji</label>
            <select id="set-pfont" className="form-select" value={s.presentationFont} onChange={(e) => update("presentationFont", e.target.value)}>
              {PRESENTATION_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-hcolor">Kolor nagłówka</label>
            <div className="d-flex align-items-center gap-2">
              <input
                type="color"
                className="form-control form-control-color flex-shrink-0"
                aria-label="Kolor nagłówka"
                value={s.presentationHeaderColor}
                onChange={(e) => update("presentationHeaderColor", e.target.value)}
              />
              <input
                id="set-hcolor"
                className="form-control" style={{ maxWidth: 130 }}
                value={s.presentationHeaderColor}
                onChange={(e) => update("presentationHeaderColor", e.target.value)}
                placeholder="#0B2A4A"
              />
              <button type="button" className="btn btn-sm" onClick={() => update("presentationHeaderColor", "#FFFFFF")}>
                Biały (bez koloru)
              </button>
            </div>
            <div className="form-text">Domyślnie ciemny morski granat. Biały = pasek bez koloru.</div>
          </div>

          <div className="col-12">
            <label className="form-label">Logo w nagłówku <span className="fw-normal text-body-secondary">(opcjonalne)</span></label>
            <div className="d-flex align-items-center flex-wrap gap-2">
              {s.presentationLogoUrl && (
                <img src={s.presentationLogoUrl} alt="logo" className="border rounded p-1 bg-white" style={{ height: 40, width: "auto", objectFit: "contain" }} />
              )}
              <label className={`btn${pending ? " disabled" : ""}`}>
                {s.presentationLogoUrl ? "Zmień logo…" : "Wybierz plik…"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="d-none"
                  disabled={pending}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2_000_000) { notify.error("Plik logo jest za duży (maks. 2 MB)."); return; }
                    const fd = new FormData();
                    fd.append("file", file);
                    const r = await fetch("/api/settings/logo", { method: "POST", body: fd });
                    if (!r.ok) { await notifyFailure(r); return; }
                    const { url } = await r.json();
                    update("presentationLogoUrl", url);
                  }}
                />
              </label>
              {s.presentationLogoUrl && (
                <button type="button" className="btn btn-outline-danger" onClick={async () => {
                  await fetch("/api/settings/logo", { method: "DELETE" });
                  update("presentationLogoUrl", null);
                }}>Usuń logo</button>
              )}
            </div>
            <div className="form-text">Logo zastępuje pionowy pasek akcentu w nagłówku. PNG/JPG/SVG/WEBP, max 2 MB. Zapisywane na serwerze.</div>
          </div>

          <div className="col-12">
            <label className="form-label">Logo białe (na ciemne tła) <span className="fw-normal text-body-secondary">(opcjonalne)</span></label>
            <div className="d-flex align-items-center flex-wrap gap-2">
              {s.presentationLogoLightUrl && (
                <img src={s.presentationLogoLightUrl} alt="białe logo" className="border rounded p-1" style={{ height: 40, width: "auto", objectFit: "contain", background: "#0B2A4A" }} />
              )}
              <label className={`btn${pending ? " disabled" : ""}`}>
                {s.presentationLogoLightUrl ? "Zmień białe logo…" : "Wybierz plik…"}
                <input
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  className="d-none"
                  disabled={pending}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > 2_000_000) { notify.error("Plik logo jest za duży (maks. 2 MB)."); return; }
                    const fd = new FormData();
                    fd.append("file", file);
                    const r = await fetch("/api/settings/logo?variant=light", { method: "POST", body: fd });
                    if (!r.ok) { await notifyFailure(r); return; }
                    const { url } = await r.json();
                    update("presentationLogoLightUrl", url);
                  }}
                />
              </label>
              {s.presentationLogoLightUrl && (
                <button type="button" className="btn btn-outline-danger" onClick={async () => {
                  await fetch("/api/settings/logo?variant=light", { method: "DELETE" });
                  update("presentationLogoLightUrl", null);
                }}>Usuń białe logo</button>
              )}
            </div>
            <div className="form-text">Używane automatycznie tam, gdzie tło jest ciemne: nagłówek w ciemnym kolorze, przerwa, komunikat, plansza reprezentacyjna (logo organizacji), ekrany przerwy na transmisji. Bez tego pliku wszędzie jest logo powyżej. PNG/SVG/WEBP z przezroczystością, maks. 2 MB.</div>
          </div>
        </div>
      </Section>

      {/* ─── PLANSZA REPREZENTACYJNA ─────────────────────────────────── */}
      <BoardSection s={s} update={update} pending={pending} />

      {/* ─── TRANSMISJA (NAKŁADKA OBS) ─────────────────────────────── */}
      <Section title="Transmisja (nakładka OBS)">
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-ofont">Czcionka transmisji</label>
            <select id="set-ofont" className="form-select" value={s.overlayFont} onChange={(e) => update("overlayFont", e.target.value)}>
              {PRESENTATION_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <div className="form-text">Niezależna od czcionki prezentacji.</div>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-ores">Wyniki głosowania na transmisji</label>
            <select id="set-ores" className="form-select" value={s.overlayResultsMode} onChange={(e) => update("overlayResultsMode", e.target.value)}>
              <option value="BARS">Poziome paski (podsuma)</option>
              <option value="BOARD">Tablica jak na prezentacji</option>
            </select>
            <div className="form-text">Sposób pokazywania wyników po zamknięciu głosowania.</div>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="set-otiming">Tablica na transmisji - kiedy</label>
            <select id="set-otiming" className="form-select" value={s.overlayBoardTiming} onChange={(e) => update("overlayBoardTiming", e.target.value)}>
              <option value="AFTER_CLOSE">Dopiero po zamknięciu głosowania</option>
              <option value="FROM_START">Już od rozpoczęcia głosowania</option>
            </select>
            <div className="form-text">Dotyczy trybu „Tablica jak na prezentacji".</div>
          </div>
          <div className="col-12">
            <Check id="set-oclock" checked={s.overlayShowSpeechClock} onChange={(v) => update("overlayShowSpeechClock", v)}
              label="Pokazuj licznik czasu wypowiedzi na transmisji"
              hint="Widoczny przy mówcy, gdy wystąpienie ma ustawiony limit czasu." />
          </div>
        </div>

        <h3 className="h6 mt-4 mb-2">Kolory teł pasków (prezentacja i transmisja)</h3>
        <div className="row g-3">
          {([
            ["colorSessionBar", "Nazwa posiedzenia"],
            ["colorItemBar", "Punkt porządku"],
            ["colorSpeakerBar", "Mówca"],
            ["colorVoteBar", "Głosowanie"],
          ] as const).map(([key, lbl]) => (
            <div key={key} className="col-6 col-md-3">
              <label className="form-label small mb-1" htmlFor={`set-${key}`}>{lbl}</label>
              <div className="d-flex align-items-center gap-2">
                <input type="color" className="form-control form-control-color form-control-sm flex-shrink-0" aria-label={lbl} value={s[key]} onChange={(e) => update(key, e.target.value)} />
                <input id={`set-${key}`} className="form-control form-control-sm" value={s[key]} onChange={(e) => update(key, e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── ZACHOWANIE GŁOSOWAŃ ─────────────────────────────────── */}
      <Section title="Zachowanie głosowań">
        <div className="d-flex flex-column gap-3">
          <Check id="set-firstfinal" checked={s.firstVoteFinalOpen} onChange={(v) => update("firstVoteFinalOpen", v)}
            label={<>Pierwszy głos ostateczny - głosowania <strong>jawne</strong></>}
            hint={<>Po oddaniu głosu radny nie może go już zmienić. W głosowaniach <strong>tajnych</strong> głos jest zawsze jednorazowy (wynika z anonimowości) - niezależnie od tego ustawienia.</>} />
          <Check id="set-adhoc" checked={s.autoAdHocOnFormalMotion} onChange={(v) => update("autoAdHocOnFormalMotion", v)}
            label="Automatyczne głosowanie przy wniosku formalnym"
            hint={<>Rozpoczęcie wystąpienia „wniosek formalny" tworzy głosowanie ad hoc „wniosek formalny: Nazwisko Imię".</>} />
          <Check id="set-gong" checked={s.speechOvertimeSound} onChange={(v) => update("speechOvertimeSound", v)}
            label="Sygnał dźwiękowy po przekroczeniu czasu wypowiedzi"
            hint="Prezentacja odtwarza łagodny gong (trzy uderzenia, ok. 3 s), gdy mówca przekroczy limit czasu." />
        </div>
      </Section>

      <Section title="Domyślne limity czasu wypowiedzi" sub="W sekundach; puste = bez limitu. Stosowane przy nowych wystąpieniach; można je zmienić na bieżąco przy każdym mówcy.">
        <div className="row g-3">
          {([
            ["defaultSpeechLimitSec", "Przemówienie"],
            ["defaultAdVocemLimitSec", "Ad vocem"],
            ["defaultFormalMotionLimitSec", "Wniosek formalny"],
          ] as const).map(([key, lbl]) => (
            <div key={key} className="col-12 col-sm-4">
              <label className="form-label" htmlFor={`set-${key}`}>{lbl}</label>
              <input
                id={`set-${key}`}
                className="form-control" type="number" min={0} placeholder="bez limitu"
                value={s[key] ?? ""}
                onChange={(e) => update(key, e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Materiały posiedzeń" sub="Wartości domyślne przy wgrywaniu materiału - edytowalne indywidualnie przy każdym pliku.">
        <div className="d-flex flex-column gap-2">
          <Check id="set-matp" checked={s.defaultMaterialsVisibleToParticipants} onChange={(v) => update("defaultMaterialsVisibleToParticipants", v)}
            label="Domyślnie widoczne dla radnych" />
          <Check id="set-matpub" checked={s.defaultMaterialsPublic} onChange={(v) => update("defaultMaterialsPublic", v)}
            label="Domyślnie publiczne (widok publiczny posiedzenia)" />
        </div>
      </Section>

      <SmtpSection s={s} update={update} />

      <SecuritySection s={s} update={update} />

      <div className="card position-sticky bottom-0 z-1">
        <div className="card-body py-2 d-flex align-items-center justify-content-end gap-3">
          {saved && <span className="small text-success">✓ Zapisano</span>}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Zapisuję…" : "Zapisz ustawienia"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Sekcja formularza ustawień - karta z nagłówkiem. */
// Plansza reprezentacyjna: zdjęcie tła, logo, tekst, krycie nakładki i podgląd na żywo.
// Kolor planszy = kolor nagłówka prezentacji (bez osobnego wyboru koloru).
function BoardSection({ s, update, pending }: {
  s: Settings;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  pending: boolean;
}) {
  const [busy, setBusy] = useState<"background" | "logo" | null>(null);

  async function upload(kind: "background" | "logo", file: File) {
    const limit = kind === "background" ? 8_000_000 : 2_000_000;
    if (file.size > limit) { notify.error(kind === "background" ? "Zdjęcie jest za duże (maks. 8 MB)." : "Logo jest za duże (maks. 2 MB)."); return; }
    setBusy(kind);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/settings/board-image?kind=${kind}`, { method: "POST", body: fd });
      if (!r.ok) { await notifyFailure(r); return; }
      const { url } = await r.json();
      update(kind === "background" ? "boardBackgroundUrl" : "boardLogoUrl", url);
      notify.success(kind === "background" ? "Zdjęcie tła zostało zapisane." : "Logo planszy zostało zapisane.");
    } catch (e) {
      await notifyFailure(e);
    } finally {
      setBusy(null);
    }
  }

  async function removeFile(kind: "background" | "logo") {
    const ok = await ask({
      title: kind === "background" ? "Usunąć zdjęcie tła?" : "Usunąć logo planszy?",
      message: kind === "background" ? "Plansza będzie miała jednolite tło w kolorze nagłówka." : "Plik wariantu logo zostanie usunięty.",
      confirmLabel: "Usuń", danger: true,
    });
    if (!ok) return;
    setBusy(kind);
    try {
      const r = await fetch(`/api/settings/board-image?kind=${kind}`, { method: "DELETE" });
      if (!r.ok) { await notifyFailure(r); return; }
      update(kind === "background" ? "boardBackgroundUrl" : "boardLogoUrl", null);
      notify.success(kind === "background" ? "Zdjęcie tła zostało usunięte." : "Logo planszy zostało usunięte.");
    } catch (e) {
      await notifyFailure(e);
    } finally {
      setBusy(null);
    }
  }

  const logo = resolveBoardLogo(s.boardLogoMode, s.presentationLogoUrl, s.boardLogoUrl, s.presentationLogoLightUrl);
  const disabled = pending || busy !== null;

  return (
    <Section title="Plansza reprezentacyjna">
      <p className="small text-body-secondary">
        Ekran pokazywany na prezentacji na żądanie (pozycja „Plansza reprezentacyjna” na liście trybów ekranu w panelu posiedzenia).
        Kolor planszy: kolor nagłówka prezentacji albo własny (poniżej). Tekst, kolor, tryb logo i krycie zapisuje przycisk „Zapisz”; pliki zapisują się od razu.
      </p>
      <div className="row g-4">
        <div className="col-12 col-lg-6 d-flex flex-column gap-3">
          <div>
            <div className="form-label">Zdjęcie tła</div>
            <div className="d-flex align-items-center flex-wrap gap-2">
              <label className={`btn${disabled ? " disabled" : ""}`}>
                {busy === "background" ? "Wgrywanie…" : s.boardBackgroundUrl ? "Wymień zdjęcie…" : "Wybierz zdjęcie…"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="d-none" disabled={disabled}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload("background", f); }} />
              </label>
              {s.boardBackgroundUrl && (
                <button type="button" className="btn btn-outline-danger" disabled={disabled} onClick={() => removeFile("background")}>Usuń zdjęcie</button>
              )}
            </div>
            <div className="form-text">JPG, PNG lub WEBP, maks. 8 MB. Zdjęcie jest wyświetlane w skali szarości pod nakładką w kolorze nagłówka. Bez zdjęcia - jednolite tło.</div>
          </div>

          <fieldset>
            <legend className="form-label fs-6 mb-1">Logo</legend>
            {([
              ["ORG", "Logo organizacji (białe, jeśli wgrane; inaczej z nagłówka)"],
              ["CUSTOM", "Osobny wariant logo dla planszy (np. białe na przezroczystym tle)"],
              ["NONE", "Bez logo"],
            ] as const).map(([v, label]) => (
              <div className="form-check" key={v}>
                <input className="form-check-input" type="radio" name="board-logo" id={`board-logo-${v}`} checked={s.boardLogoMode === v}
                  onChange={() => update("boardLogoMode", v)} />
                <label className="form-check-label" htmlFor={`board-logo-${v}`}>{label}</label>
              </div>
            ))}
            {s.boardLogoMode === "ORG" && !s.presentationLogoUrl && (
              <div className="form-text">Organizacja nie ma jeszcze logo - plansza pokaże sam tekst.</div>
            )}
            {s.boardLogoMode === "CUSTOM" && (
              <div className="d-flex align-items-center flex-wrap gap-2 mt-2">
                <label className={`btn btn-sm${disabled ? " disabled" : ""}`}>
                  {busy === "logo" ? "Wgrywanie…" : s.boardLogoUrl ? "Wymień logo…" : "Wybierz plik logo…"}
                  <input type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg" className="d-none" disabled={disabled}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload("logo", f); }} />
                </label>
                {s.boardLogoUrl && (
                  <button type="button" className="btn btn-sm btn-outline-danger" disabled={disabled} onClick={() => removeFile("logo")}>Usuń logo</button>
                )}
                <div className="form-text w-100 mt-0">PNG/WEBP/SVG z przezroczystością lub JPG, maks. 2 MB. Proporcje i kolory logo pozostają bez zmian.</div>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="form-label fs-6 mb-1">Kolor planszy</legend>
            <div className="form-check">
              <input className="form-check-input" type="radio" name="board-color" id="board-color-header" checked={s.boardColor == null}
                onChange={() => update("boardColor", null)} />
              <label className="form-check-label" htmlFor="board-color-header">Kolor nagłówka prezentacji</label>
            </div>
            <div className="form-check">
              <input className="form-check-input" type="radio" name="board-color" id="board-color-custom" checked={s.boardColor != null}
                onChange={() => update("boardColor", s.boardColor ?? (/^#[0-9A-Fa-f]{6}$/.test(s.presentationHeaderColor) ? s.presentationHeaderColor : "#0B2A4A"))} />
              <label className="form-check-label" htmlFor="board-color-custom">Własny kolor</label>
            </div>
            {s.boardColor != null && (
              <div className="d-flex align-items-center gap-2 mt-2">
                <input
                  type="color" className="form-control form-control-color flex-shrink-0" aria-label="Własny kolor planszy"
                  value={s.boardColor} onChange={(e) => update("boardColor", e.target.value)}
                />
                <input
                  id="board-color" className="form-control" style={{ maxWidth: 130 }} aria-label="Własny kolor planszy (#RRGGBB)"
                  value={s.boardColor} onChange={(e) => update("boardColor", e.target.value)} placeholder="#0B2A4A"
                />
              </div>
            )}
            <div className="form-text">Zbyt jasny kolor jest automatycznie przyciemniany, żeby biały tekst był czytelny.</div>
          </fieldset>

          <div>
            <label className="form-label" htmlFor="board-font">Czcionka planszy</label>
            <select id="board-font" className="form-select" value={s.boardFont ?? ""} onChange={(e) => update("boardFont", e.target.value || null)}>
              <option value="">Jak prezentacja ({s.presentationFont})</option>
              {PRESENTATION_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label" htmlFor="board-text">Tekst pod logo</label>
            <textarea id="board-text" className="form-control" rows={4} maxLength={600}
              value={s.boardText ?? ""} onChange={(e) => update("boardText", e.target.value)} />
            <div className="form-text">Każdy wiersz pola to osobny wiersz na planszy. Zwykły tekst (bez formatowania).</div>
          </div>

          <div>
            <label className="form-label d-flex justify-content-between" htmlFor="board-opacity">
              <span>Intensywność nakładki koloru</span>
              <span className="mono">{s.boardOverlayOpacity}%</span>
            </label>
            <input id="board-opacity" type="range" className="form-range" min={0} max={100} step={5}
              value={s.boardOverlayOpacity} onChange={(e) => update("boardOverlayOpacity", Number(e.target.value))} />
            <div className="form-text">Dotyczy tylko tła ze zdjęciem; logo i tekst pozostają bez zmian.</div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="form-label">Podgląd</div>
          <div className="border rounded overflow-hidden" style={{ aspectRatio: "16 / 9", width: "100%" }}>
            <RepresentationBoard
              color={s.boardColor ?? s.presentationHeaderColor}
              backgroundUrl={s.boardBackgroundUrl}
              logoUrl={logo}
              text={s.boardText}
              overlayOpacity={s.boardOverlayOpacity}
              fontFamily={fontStack(s.boardFont ?? s.presentationFont)}
            />
          </div>
          <div className="form-text">Podgląd w proporcjach ekranu 16:9 - ten sam układ co na prezentacji.</div>
        </div>
      </div>
    </Section>
  );
}

function Section({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <CardHeader title={title} />
      <div className="card-body">
        {sub && <p className="small text-body-secondary mb-3">{sub}</p>}
        {children}
      </div>
    </section>
  );
}

/** Pole wyboru z etykietą i opcjonalnym opisem pod spodem. */
function Check({ id, checked, onChange, label, hint }: {
  id: string; checked: boolean; onChange: (v: boolean) => void;
  label: React.ReactNode; hint?: React.ReactNode;
}) {
  return (
    <div className="form-check mb-0">
      <input className="form-check-input" type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label className="form-check-label" htmlFor={id}>{label}</label>
      {hint && <div className="form-text mt-0">{hint}</div>}
    </div>
  );
}

function SmtpSection({ s, update }: {
  s: Settings;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}) {
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function sendTest() {
    setTestBusy(true); setTestResult(null);
    const r = await fetch("/api/settings/test-email", { method: "POST" });
    setTestBusy(false);
    setTestResult(r.ok ? "Wysłano testowy e-mail." : await readUserError(r));
  }

  return (
    <Section title="Poczta e-mail (SMTP)" sub="Konfiguracja skrzynki używanej do wysyłki e-maili (założenie konta, reset hasła na żądanie, wiadomości dotyczące posiedzeń).">
      <div className="row g-3">
        <div className="col-12 col-sm-8">
          <label className="form-label" htmlFor="smtp-host">Host SMTP</label>
          <input id="smtp-host" className="form-control" placeholder="smtp.example.com" value={s.smtpHost ?? ""} onChange={(e) => update("smtpHost", e.target.value || null)} />
        </div>
        <div className="col-12 col-sm-4">
          <label className="form-label" htmlFor="smtp-port">Port</label>
          <input id="smtp-port" className="form-control" type="number" placeholder="587" value={s.smtpPort ?? ""} onChange={(e) => update("smtpPort", e.target.value === "" ? null : Number(e.target.value))} />
        </div>
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="smtp-user">Użytkownik</label>
          <input id="smtp-user" className="form-control" value={s.smtpUser ?? ""} onChange={(e) => update("smtpUser", e.target.value || null)} />
        </div>
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="smtp-pass">Hasło</label>
          <input
            id="smtp-pass" className="form-control" type="password" autoComplete="new-password"
            placeholder={s.smtpPasswordSet && !s.smtpPasswordClear ? "zapisane - wpisz, aby zmienić" : ""}
            value={s.smtpPassword ?? ""}
            onChange={(e) => { update("smtpPassword", e.target.value); if (e.target.value) update("smtpPasswordClear", false); }}
          />
          {s.smtpPasswordSet && (
            <div className="form-check mt-1">
              <input className="form-check-input" type="checkbox" id="smtp-pass-clear" checked={!!s.smtpPasswordClear}
                onChange={(e) => { update("smtpPasswordClear", e.target.checked); if (e.target.checked) update("smtpPassword", ""); }} />
              <label className="form-check-label small" htmlFor="smtp-pass-clear">Usuń zapisane hasło</label>
            </div>
          )}
        </div>
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="smtp-from">Adres nadawcy</label>
          <input id="smtp-from" className="form-control" placeholder="iobrady@twoja-domena.pl" value={s.smtpFrom ?? ""} onChange={(e) => update("smtpFrom", e.target.value || null)} />
        </div>
        <div className="col-12 col-sm-6 d-flex align-items-sm-end">
          <div className="pb-sm-2">
            <Check id="smtp-secure" checked={s.smtpSecure} onChange={(v) => update("smtpSecure", v)} label="Połączenie szyfrowane (TLS/SSL)" />
          </div>
        </div>
      </div>
      <div className="mt-3 d-flex align-items-center flex-wrap gap-2">
        <button type="button" className="btn btn-sm" disabled={testBusy || !s.smtpHost} onClick={sendTest}>
          {testBusy ? "Wysyłanie…" : "Wyślij testowy e-mail"}
        </button>
        {testResult && <span className="small text-body-secondary">{testResult}</span>}
      </div>
      <div className="form-text">
        Uwaga: przycisk testowy wysyła na podstawie aktualnie WPISANYCH powyżej wartości dopiero
        po zapisaniu formularza - zapisz ustawienia przed testem.
      </div>
    </Section>
  );
}

// Bezpieczeństwo sesji i przechowywanie dzienników.
function SecuritySection({ s, update }: {
  s: Settings;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const days = (k: "retentionAuditDays" | "retentionLoginDays" | "retentionEmailLogDays", label: string, id: string) => (
    <div className="col-12 col-sm-4">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input
        id={id} className="form-control" type="number" min={30} placeholder="bez usuwania"
        value={s[k] ?? ""}
        onChange={(e) => update(k, e.target.value === "" ? null : Math.max(30, Number(e.target.value)))}
      />
    </div>
  );

  async function applyNow() {
    if (!(await ask({
      title: "Zastosować retencję teraz?",
      message: "Wpisy dzienników starsze niż zapisane okresy przechowywania zostaną trwale usunięte. Najpierw zapisz ustawienia.",
      confirmLabel: "Usuń starsze wpisy", danger: true,
    }))) return;
    setBusy(true);
    const r = await fetch("/api/settings/retention", { method: "POST" });
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    const d = await r.json();
    notify.success(`Usunięto: dziennik zdarzeń ${d.audit}, logowania ${d.login}, e-maile ${d.email}.`);
  }

  return (
    <Section title="Bezpieczeństwo sesji i dzienniki" sub="Limit bezczynności liczy wyłącznie aktywność użytkownika (klawiatura, mysz, dotyk) - odświeżanie danych i połączenie na żywo jej nie przedłużają.">
      <div className="row g-3">
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="sec-idle">Wylogowanie po bezczynności (minuty)</label>
          <input id="sec-idle" className="form-control" type="number" min={0} max={480}
            value={s.sessionIdleMinutes}
            onChange={(e) => update("sessionIdleMinutes", Math.min(480, Math.max(0, Number(e.target.value) || 0)))} />
          <div className="form-text">0 = wyłączone. Sesja i tak wygasa po 8 godzinach.</div>
        </div>
        <div className="col-12 col-sm-6 d-flex align-items-sm-end">
          <div className="pb-sm-2">
            <Check id="sec-logout-close" checked={s.logoutParticipantsOnMeetingClose} onChange={(v) => update("logoutParticipantsOnMeetingClose", v)}
              label="Wyloguj radnych po zamknięciu posiedzenia"
              hint="Nie dotyczy osób uczestniczących w innym trwającym posiedzeniu." />
          </div>
        </div>
        {days("retentionAuditDays", "Dziennik zdarzeń (dni)", "sec-ret-audit")}
        {days("retentionLoginDays", "Logowania i próby (dni)", "sec-ret-login")}
        {days("retentionEmailLogDays", "Wysłane e-maile (dni)", "sec-ret-email")}
      </div>
      <div className="form-text">
        Puste pole = wpisy nie są usuwane. Retencja działa raz na dobę; minimalny okres to 30 dni.
      </div>
      <div className="mt-2">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={applyNow}>
          {busy ? "Usuwanie…" : "Zastosuj retencję teraz"}
        </button>
      </div>
    </Section>
  );
}
