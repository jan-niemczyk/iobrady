"use client";

import { useState, useTransition } from "react";
import { IconAuto, IconMessage, IconCheck, IconList, IconMic } from "@/components/ui/Icon";

interface DisplayState {
  mode: string;
  customMessage: string | null;
  messageOnOverlay?: boolean;
  messageObsStyle?: boolean;
  pinnedVoteId: string | null;
  pinVoteId?: string | null;
  breakUntil?: string | null;
  pinnedAgendaItemId: string | null;
  showCastCount: boolean;
  showByName: boolean;
  showIndividualVotes: boolean;
  candidatePage: number;
  candidateSort: string;
}

/**
 * Panel sterowania widokiem prezentacyjnym. Operator wybiera, co aktualnie pokazać
 * na ekranie sali. Tryb "AUTO" oznacza automatyczne reagowanie na stan posiedzenia
 * (aktywne głosowanie → punkt → ekran domyślny).
 *
 * Cała lista trybów to JEDEN ciągły `list-group list-group-flush` (bez własnych
 * marginesów/obramowań między pozycjami) - włącznie z rozwijanymi podlistami
 * (konkretny punkt, głosowanie, przerwa), żeby uniknąć mieszania stylów przycisków
 * w obrębie jednej karty.
 */
export function DisplayControlPanel({
  meetingId,
  state,
  agenda,
  votes,
  onUpdate,
}: {
  meetingId: string;
  state: DisplayState;
  agenda: { id: string; number: string; title: string }[];
  votes: { id: string; number: number | null; title: string; status: string; type?: string; optionsCount?: number; pinRequired?: boolean }[];
  onUpdate: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [pickAgendaOpen, setPickAgendaOpen] = useState(false);
  const [pickVoteOpen, setPickVoteOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [msgDraft, setMsgDraft] = useState(state.customMessage ?? "");
  // Ostatnie zamknięte głosowanie (do przycisku "Zdejmij z auto")
  const lastClosed = votes.find((v) => v.status === "CLOSED");
  const isBreak = state.mode === "BREAK";
  const pinVotes = votes.filter((v) => v.pinRequired && (v.status === "OPEN" || v.id === state.pinVoteId));

  function patch(body: Record<string, unknown>) {
    startTransition(async () => {
      const r = await fetch(`/api/meetings/${meetingId}/display`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        alert(`Błąd: ${await r.text()}`);
        return;
      }
      onUpdate();
    });
  }

  function startBreak(minutes: number) {
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    patch({ displayMode: "BREAK", breakUntil: until });
  }
  function startUntilTime(hhmm: string) {
    if (!/^\d{1,2}:\d{2}$/.test(hhmm)) { alert("Podaj godzinę w formacie GG:MM."); return; }
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); // jeśli minęła, to jutro
    patch({ displayMode: "BREAK", breakUntil: d.toISOString() });
  }
  function startOpenEnded() {
    patch({ displayMode: "BREAK", breakUntil: null });
  }

  const modeBadge = (m: string) => {
    if (m === "AUTO") return { label: "Automatyczny", color: "var(--color-ink-2)" };
    if (m === "DEFAULT") return { label: "Ekran domyślny", color: "var(--color-ink-2)" };
    if (m === "BLANK") return { label: "Pusty ekran", color: "var(--color-ink-3)" };
    if (m === "MESSAGE") return { label: "Komunikat", color: "var(--color-yes)" };
    if (m === "BREAK") return { label: "Przerwa", color: "var(--color-no)" };
    if (m === "PINNED_AGENDA") return { label: "Wpięty punkt", color: "var(--color-ink-2)" };
    if (m === "PINNED_VOTE") return { label: "Wpięte głosowanie", color: "var(--color-no)" };
    if (m === "SPEAKER_LIST") return { label: "Lista mówców", color: "var(--color-ink-2)" };
    if (m === "FORMAL_MOTIONS") return { label: "Wnioski formalne", color: "var(--color-ink-2)" };
    return { label: m, color: "var(--color-ink-3)" };
  };

  const b = modeBadge(state.mode);

  return (
    <div className="card">
      <div className="card-header d-flex align-items-center justify-content-between">
        <div>
          <div className="eyebrow">Ekran prezentacyjny</div>
          <div className="text-xs" style={{ color: b.color, fontWeight: 600 }}>{b.label}</div>
        </div>
        <a className="btn btn-outline-secondary btn-sm" href={`/display/${meetingId}`} target="_blank" rel="noreferrer">
          Otwórz podgląd
        </a>
      </div>

      <div className="card-body pb-2">
        <button
          className="btn btn-dark w-100"
          disabled={pending}
          onClick={() => patch({
            displayMode: "AUTO",
            displayPinnedVoteId: null,
            displayPinnedAgendaItemId: null,
            displayCustomMessage: null,
            dismissLastVoteId: lastClosed?.id ?? null,
          })}
          title="Powrót do widoku automatycznego - czyści wszystkie przypięte głosowania/punkty"
        >
          <IconAuto /> Wróć do trybu auto
        </button>
      </div>

      <div className="list-group list-group-flush">
        <button type="button" className={`list-group-item list-group-item-action${state.mode === "DEFAULT" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "DEFAULT" })}>
          ◴ Ekran domyślny (nazwa posiedzenia)
        </button>
        <button type="button" className={`list-group-item list-group-item-action${state.mode === "SPEAKER_LIST" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "SPEAKER_LIST" })}>
          <IconMic size={14} /> Lista mówców
        </button>
        <button type="button" className={`list-group-item list-group-item-action${state.mode === "FORMAL_MOTIONS" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "FORMAL_MOTIONS" })}>
          <IconMic size={14} /> Wnioski formalne
        </button>
        <button type="button" className={`list-group-item list-group-item-action${state.mode === "AGENDA_LIST" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "AGENDA_LIST" })}>
          <IconList size={14} /> Porządek obrad (lista)
        </button>

        {/* WPIĘTY PUNKT */}
        <button
          type="button"
          className={`list-group-item list-group-item-action${state.mode === "PINNED_AGENDA" ? " active" : ""}`}
          onClick={() => setPickAgendaOpen((v) => !v)}
        >
          <IconList size={14} /> Pokaż konkretny punkt
        </button>
        {pickAgendaOpen && (
          agenda.length === 0
            ? <div className="list-group-item text-body-secondary small">Brak punktów agendy</div>
            : agenda.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`list-group-item list-group-item-action small ps-4${state.pinnedAgendaItemId === a.id ? " active" : ""}`}
                disabled={pending}
                onClick={() => {
                  patch({ displayMode: "PINNED_AGENDA", displayPinnedAgendaItemId: a.id });
                  setPickAgendaOpen(false);
                }}
              >
                <span className="mono me-2 text-body-secondary">{a.number}.</span>
                <span className="text-truncate">{a.title}</span>
              </button>
            ))
        )}

        {/* WPIĘTE GŁOSOWANIE */}
        <button
          type="button"
          className={`list-group-item list-group-item-action${state.mode === "PINNED_VOTE" ? " active" : ""}`}
          onClick={() => setPickVoteOpen((v) => !v)}
        >
          <IconCheck /> Pokaż wyniki głosowania
        </button>
        {pickVoteOpen && (
          votes.filter((v) => v.status === "CLOSED").length === 0
            ? <div className="list-group-item text-body-secondary small">Brak zamkniętych głosowań</div>
            : votes.filter((v) => v.status === "CLOSED").map((v) => (
              <div key={v.id} className="list-group-item d-flex align-items-center gap-1 p-0">
                <button
                  type="button"
                  className={`list-group-item list-group-item-action small ps-4 border-0 flex-grow-1${state.pinnedVoteId === v.id ? " active" : ""}`}
                  disabled={pending}
                  onClick={() => {
                    patch({ displayMode: "PINNED_VOTE", displayPinnedVoteId: v.id });
                    setPickVoteOpen(false);
                  }}
                >
                  <span className="mono me-2 text-body-secondary">nr {v.number ?? "-"}</span>
                  <span className="text-truncate">{v.title}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger border-0 me-2"
                  disabled={pending}
                  title="Ukryj te wyniki z widoku auto (kolejne odsłony pokażą poprzednie/aktualny punkt)"
                  onClick={() => patch({
                    dismissLastVoteId: v.id,
                    // Jeśli aktualnie ukrywamy WŁAŚNIE to wpięte głosowanie - wracamy do AUTO
                    ...(state.pinnedVoteId === v.id ? { displayMode: "AUTO", displayPinnedVoteId: null } : {}),
                  })}
                >
                  Ukryj
                </button>
              </div>
            ))
        )}

        {/* PRZERWA W OBRADACH - osobny tryb; zasłania ekran/transmisję; z licznikiem */}
        <button
          type="button"
          className={`list-group-item list-group-item-action${isBreak ? " active" : ""}`}
          onClick={() => setBreakOpen((v) => !v)}
        >
          Przerwa w obradach
        </button>
        {(breakOpen || isBreak) && (
          <div className="list-group-item">
            <div className="d-flex flex-column gap-2">
              <div className="btn-group" role="group">
                {[5, 10, 15, 30].map((min) => (
                  <button key={min} type="button" className="btn btn-outline-secondary btn-sm" disabled={pending} onClick={() => startBreak(min)}>{min} min</button>
                ))}
              </div>
              <div className="input-group input-group-sm">
                <BreakTimeInput onSubmit={startUntilTime} pending={pending} />
              </div>
              <div className="input-group input-group-sm">
                <BreakMinutesInput onSubmit={(n) => startBreak(n)} pending={pending} />
              </div>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={pending} onClick={startOpenEnded}>Przerwa bez licznika</button>
              {isBreak && (
                <div className="d-flex align-items-center justify-content-between">
                  <span className="small text-body-secondary">
                    {state.breakUntil ? `Wznowienie: ${new Date(state.breakUntil).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}` : "Przerwa bez licznika"}
                  </span>
                  <button type="button" className="btn btn-outline-danger btn-sm" disabled={pending} onClick={() => patch({ displayMode: "AUTO", breakUntil: null })}>Zakończ przerwę</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tryb „pokaż PIN" - tylko dla głosowań zabezpieczonych PIN-em; nie trafia na transmisję */}
        {pinVotes.length > 0 && (
          <>
            <div className="list-group-item text-uppercase text-body-secondary small fw-semibold bg-body-tertiary">Pokaż PIN na sali</div>
            {pinVotes.map((v) => {
              const active = state.pinVoteId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={`list-group-item list-group-item-action small${active ? " active" : ""}`}
                  disabled={pending}
                  onClick={() => patch({ displayPinVoteId: active ? null : v.id })}
                >
                  <span className="mono me-2 text-body-secondary">nr {v.number ?? "-"}</span>
                  <span className="text-truncate">{active ? "PIN pokazany - kliknij, by ukryć" : `Pokaż PIN: ${v.title}`}</span>
                </button>
              );
            })}
          </>
        )}

        <button
          type="button"
          className={`list-group-item list-group-item-action${state.mode === "BLANK" ? " active" : ""}`}
          disabled={pending}
          onClick={() => patch({ displayMode: "BLANK" })}
        >
          ⬛ Wyczyść ekran (pusty)
        </button>
      </div>

      {/* KOMUNIKAT TEKSTOWY - osobny tryb */}
      <div className="card-body border-top">
        <textarea
          className="form-control mb-2"
          placeholder="Treść komunikatu (np. Zaraz wznawiamy obrady)"
          value={msgDraft}
          onChange={(e) => setMsgDraft(e.target.value)}
          style={{ minHeight: 60 }}
        />
        <button
          type="button"
          className={`btn btn-outline-secondary w-100${state.mode === "MESSAGE" ? " active" : ""}`}
          disabled={pending || !msgDraft.trim()}
          onClick={() => patch({ displayMode: "MESSAGE", displayCustomMessage: msgDraft })}
        >
          <IconMessage /> Wyświetl komunikat
        </button>
        <div className="form-check mt-2">
          <input
            type="checkbox"
            className="form-check-input"
            id="dcpMessageOverlay"
            checked={state.messageOnOverlay ?? true}
            onChange={(e) => patch({ displayMessageOnOverlay: e.target.checked })}
          />
          <label className="form-check-label small" htmlFor="dcpMessageOverlay">Pokaż komunikat także na transmisji (OBS)</label>
        </div>
        <div className="form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id="dcpMessageObsStyle"
            checked={state.messageObsStyle ?? false}
            onChange={(e) => patch({ displayMessageObsStyle: e.target.checked })}
          />
          <label className="form-check-label small" htmlFor="dcpMessageObsStyle">Na prezentacji pokaż komunikat w stylu transmisji (kolorowe tło)</label>
        </div>
      </div>

      {/* OPCJE */}
      <div className="card-body border-top pt-2">
        <div className="form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id="dcpShowCastCount"
            checked={state.showCastCount}
            onChange={(e) => patch({ displayShowCastCount: e.target.checked })}
          />
          <label className="form-check-label small" htmlFor="dcpShowCastCount">Pokaż licznik oddanych głosów w trakcie głosowania</label>
        </div>
        <div className="form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id="dcpShowByName"
            checked={state.showByName}
            onChange={(e) => patch({ displayShowByName: e.target.checked })}
          />
          <label className="form-check-label small" htmlFor="dcpShowByName">Pokazuj imienne wyniki głosowań jawnych (tablica)</label>
        </div>
        {state.showByName && (
          <div className="form-check ps-5">
            <input
              type="checkbox"
              className="form-check-input"
              id="dcpShowIndividual"
              checked={state.showIndividualVotes}
              onChange={(e) => patch({ displayShowIndividualVotes: e.target.checked })}
            />
            <label className="form-check-label small" htmlFor="dcpShowIndividual">Pokazuj indywidualne stanowiska (za/przeciw/wstrz.)</label>
          </div>
        )}
      </div>
    </div>
  );
}

// Pole "do godz. GG:MM" z autoformatowaniem (wstawia dwukropek po 2 cyfrach) - osobny
// komponent, żeby mieć własny lokalny stan tekstu bez przenoszenia go do rodzica.
function BreakTimeInput({ onSubmit, pending }: { onSubmit: (hhmm: string) => void; pending: boolean }) {
  const [value, setValue] = useState("");
  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setValue(digits.length >= 3 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
  }
  return (
    <>
      <input className="form-control" placeholder="do godz. GG:MM" value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" />
      <button className="btn btn-outline-secondary" disabled={pending || !value} onClick={() => onSubmit(value)}>Ustaw</button>
    </>
  );
}

function BreakMinutesInput({ onSubmit, pending }: { onSubmit: (minutes: number) => void; pending: boolean }) {
  const [value, setValue] = useState("");
  return (
    <>
      <input className="form-control" placeholder="minut z palca" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" />
      <button className="btn btn-outline-secondary" disabled={pending || !value} onClick={() => { onSubmit(Number(value)); setValue(""); }}>Ustaw</button>
    </>
  );
}
