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
  const [msgDraft, setMsgDraft] = useState(state.customMessage ?? "");
  // Ostatnie zamknięte głosowanie (do przycisku "Zdejmij z auto")
  const lastClosed = votes.find((v) => v.status === "CLOSED");

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
        <a
          className="btn btn-outline-secondary btn-sm"
          href={`/display/${meetingId}`}
          target="_blank"
          rel="noreferrer"
        >
          Otwórz podgląd
        </a>
      </div>

      <div className="card-body d-flex flex-column gap-2">
        <button
          className="btn btn-dark"
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

        <div className="list-group">
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
          <button type="button" className={`list-group-item list-group-item-action${state.mode === "BLANK" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "BLANK" })}>
            ⬛ Wyczyść ekran (pusty)
          </button>
        </div>

        {/* WPIĘTY PUNKT */}
        <div>
          <button
            type="button"
            className={`btn btn-outline-secondary w-100 text-start${state.mode === "PINNED_AGENDA" ? " active" : ""}`}
            onClick={() => setPickAgendaOpen((v) => !v)}
          >
            <IconList size={14} /> Pokaż konkretny punkt
          </button>
          {pickAgendaOpen && (
            <div className="list-group mt-2" style={{ maxHeight: 192, overflowY: "auto" }}>
              {agenda.length === 0 && <div className="text-body-secondary small p-2">Brak punktów agendy</div>}
              {agenda.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`list-group-item list-group-item-action small${state.pinnedAgendaItemId === a.id ? " active" : ""}`}
                  disabled={pending}
                  onClick={() => {
                    patch({ displayMode: "PINNED_AGENDA", displayPinnedAgendaItemId: a.id });
                    setPickAgendaOpen(false);
                  }}
                >
                  <span className="mono me-2 text-body-secondary">{a.number}.</span>
                  <span className="text-truncate">{a.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* WPIĘTE GŁOSOWANIE */}
        <div>
          <button
            type="button"
            className={`btn btn-outline-secondary w-100 text-start${state.mode === "PINNED_VOTE" ? " active" : ""}`}
            onClick={() => setPickVoteOpen((v) => !v)}
          >
            <IconCheck /> Pokaż wyniki głosowania
          </button>
          {pickVoteOpen && (
            <div className="list-group mt-2" style={{ maxHeight: 192, overflowY: "auto" }}>
              {votes.filter((v) => v.status === "CLOSED").length === 0 && (
                <div className="text-body-secondary small p-2">Brak zamkniętych głosowań</div>
              )}
              {votes.filter((v) => v.status === "CLOSED").map((v) => (
                <div key={v.id} className="list-group-item d-flex align-items-center gap-1 p-0">
                  <button
                    type="button"
                    className={`btn btn-sm flex-grow-1 text-start border-0 rounded-0${state.pinnedVoteId === v.id ? " active" : ""}`}
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
                    className="btn btn-sm btn-outline-danger border-0 me-1"
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
              ))}
            </div>
          )}
        </div>

        {/* Tryb „pokaż PIN" - tylko dla głosowań zabezpieczonych PIN-em; nie trafia na transmisję */}
        {votes.some((v) => v.pinRequired && (v.status === "OPEN" || v.id === state.pinVoteId)) && (
          <div>
            <div className="form-label mb-1">Pokaż PIN na sali</div>
            <div className="list-group">
              {votes.filter((v) => v.pinRequired && (v.status === "OPEN" || v.id === state.pinVoteId)).map((v) => {
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
            </div>
          </div>
        )}

        {/* PRZERWA W OBRADACH - osobny tryb; zasłania ekran/transmisję; z licznikiem */}
        <BreakControl state={state} patch={patch} pending={pending} />

        {/* KOMUNIKAT TEKSTOWY - osobny tryb */}
        <div>
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

        {/* STEROWANIE STRONAMI - widoczne, gdy na ekranie jest głosowanie typu LISTA lub PAKIET */}
        {/* Strzałki przełączania stron listy/pakietu przeniesione do okna wyników głosowania
            (tam, gdzie operator faktycznie steruje wynikiem) - tutaj usunięte, by nie dublować. */}
      </div>
    </div>
  );
}

// Sterowanie przerwą z licznikiem: szybkie długości lub godzina wznowienia (z palca).
function BreakControl({
  state, patch, pending,
}: {
  state: { mode: string; breakUntil?: string | null };
  patch: (body: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [customTime, setCustomTime] = useState("");
  const [customMin, setCustomMin] = useState("");
  const [expanded, setExpanded] = useState(false);
  const isBreak = state.mode === "BREAK";

  // Autoformat: użytkownik wpisuje cyfry, sami wstawiamy dwukropek po 2 cyfrach (GG:MM).
  function onTimeChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    let out = digits;
    if (digits.length >= 3) out = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    setCustomTime(out);
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

  return (
    <div className="border rounded">
      <div className="d-flex align-items-center justify-content-between px-2 py-1">
        <button type="button" className="btn btn-link btn-sm text-decoration-none px-0" style={{ fontWeight: isBreak ? 600 : 400 }} onClick={() => setExpanded((v) => !v)}>
          Przerwa w obradach
        </button>
        {isBreak && (
          <button className="btn btn-outline-secondary btn-sm" disabled={pending} onClick={() => patch({ displayMode: "AUTO", breakUntil: null })}>Zakończ</button>
        )}
      </div>
      <div className={`collapse ${expanded || isBreak ? "show" : ""}`}>
        <div className="p-2 pt-0 d-flex flex-column gap-2">
          <div className="btn-group" role="group">
            {[5, 10, 15, 30].map((min) => (
              <button key={min} type="button" className="btn btn-outline-secondary btn-sm" disabled={pending} onClick={() => startBreak(min)}>{min} min</button>
            ))}
          </div>
          <div className="input-group input-group-sm">
            <input
              className="form-control"
              placeholder="do godz. GG:MM"
              value={customTime}
              onChange={(e) => onTimeChange(e.target.value)}
              inputMode="numeric"
            />
            <button className="btn btn-outline-secondary" disabled={pending || !customTime} onClick={() => startUntilTime(customTime)}>Ustaw</button>
          </div>
          <div className="input-group input-group-sm">
            <input
              className="form-control"
              placeholder="minut z palca"
              value={customMin}
              onChange={(e) => setCustomMin(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
            />
            <button className="btn btn-outline-secondary" disabled={pending || !customMin} onClick={() => { startBreak(Number(customMin)); setCustomMin(""); }}>Ustaw</button>
          </div>
          <button className="btn btn-outline-secondary btn-sm" disabled={pending} onClick={startOpenEnded}>Przerwa bez licznika</button>
          {isBreak && state.breakUntil && (
            <div className="small text-body-secondary">
              Wznowienie: {new Date(state.breakUntil).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
