"use client";

import { screenUrl } from "@/lib/screenUrl";
import { CardHeader } from "@/components/operator/ui";
import { useState, useTransition } from "react";
import { notify, notifyFailure } from "@/lib/feedback";
import { IconAuto, IconMessage, IconCheck, IconList, IconMic } from "@/components/ui/Icon";

interface DisplayState {
  mode: string;
  boardVisible?: boolean;
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
  meetingId, displayToken,
  state,
  agenda,
  votes,
  onUpdate,
}: {
  meetingId: string;
  displayToken?: string | null;
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

  function patch(body: Record<string, unknown>, success?: string) {
    startTransition(async () => {
      const r = await fetch(`/api/meetings/${meetingId}/display`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        await notifyFailure(r);
        return;
      }
      if (success) notify.success(success);
      onUpdate();
    });
  }

  function startBreak(minutes: number) {
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    patch({ displayMode: "BREAK", breakUntil: until });
  }
  function startUntilTime(hhmm: string) {
    if (!/^\d{1,2}:\d{2}$/.test(hhmm)) { notify.error("Podaj godzinę w formacie GG:MM."); return; }
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
    if (m === "AUTO") return { label: "Automatyczny", cls: "text-body-secondary" };
    if (m === "DEFAULT") return { label: "Ekran domyślny", cls: "text-body-secondary" };
    if (m === "BLANK") return { label: "Pusty ekran", cls: "text-body-secondary" };
    if (m === "MESSAGE") return { label: "Komunikat", cls: "text-success" };
    if (m === "BREAK") return { label: "Przerwa", cls: "text-danger" };
    if (m === "PINNED_AGENDA") return { label: "Wpięty punkt", cls: "text-body-secondary" };
    if (m === "PINNED_VOTE") return { label: "Wpięte głosowanie", cls: "text-danger" };
    if (m === "SPEAKER_LIST") return { label: "Lista mówców", cls: "text-body-secondary" };
    if (m === "FORMAL_MOTIONS") return { label: "Wnioski formalne", cls: "text-body-secondary" };
    if (m === "AGENDA_LIST") return { label: "Porządek obrad", cls: "text-body-secondary" };
    if (m === "ATTENDANCE") return { label: "Lista obecności", cls: "text-body-secondary" };
    return { label: m, cls: "text-body-secondary" };
  };

  const b = modeBadge(state.mode);

  return (
    <div className="card">
      <CardHeader
        title="Ekran prezentacyjny"
        sub={<span>Tryb: <span className={`fw-semibold ${b.cls}`}>{b.label}</span>{state.boardVisible && <span className="text-warning-emphasis"> - przykryty planszą</span>}</span>}
        right={
          <a className="btn btn-sm" href={screenUrl("display", meetingId, displayToken)} target="_blank" rel="noreferrer">
            Otwórz podgląd
          </a>
        }
      />

      {/* Plansza reprezentacyjna: przykrywa cały ekran prezentacji; nie zmienia trybu ani obrad,
          więc po ukryciu prezentacja pokazuje aktualny stan. */}
      <div className="card-body pb-0">
        <div
          className={`border rounded-2 p-2 d-flex flex-column gap-2 ${state.boardVisible ? "border-warning bg-warning-subtle" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div className="small">
            <span className="fw-semibold">Plansza reprezentacyjna: </span>
            {state.boardVisible
              ? <span className="fw-semibold text-warning-emphasis">wyświetlana na ekranie sali</span>
              : <span className="text-body-secondary">ukryta</span>}
          </div>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm flex-fill justify-content-center"
              disabled={pending || !!state.boardVisible}
              aria-pressed={!!state.boardVisible}
              onClick={() => patch({ displayBoardVisible: true }, "Plansza reprezentacyjna jest wyświetlana.")}
            >
              Pokaż planszę
            </button>
            <button
              type="button"
              className="btn btn-sm flex-fill justify-content-center"
              disabled={pending || !state.boardVisible}
              onClick={() => patch({ displayBoardVisible: false }, "Plansza reprezentacyjna została ukryta.")}
            >
              Ukryj planszę
            </button>
          </div>
        </div>
      </div>

      <div className="card-body pb-2">
        <button
          className="btn btn-primary w-100 justify-content-center"
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
          <span className="dcp-ico" aria-hidden>◴</span> Ekran domyślny (nazwa posiedzenia)
        </button>
        <button type="button" className={`list-group-item list-group-item-action${state.mode === "SPEAKER_LIST" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "SPEAKER_LIST" })}>
          <span className="dcp-ico" aria-hidden><IconMic size={14} /></span> Lista mówców
        </button>
        <button type="button" className={`list-group-item list-group-item-action${state.mode === "FORMAL_MOTIONS" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "FORMAL_MOTIONS" })}>
          <span className="dcp-ico" aria-hidden><IconMic size={14} /></span> Wnioski formalne
        </button>
        <button type="button" className={`list-group-item list-group-item-action${state.mode === "AGENDA_LIST" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "AGENDA_LIST" })}>
          <span className="dcp-ico" aria-hidden><IconList size={14} /></span> Porządek obrad (lista)
        </button>
        <button type="button" className={`list-group-item list-group-item-action${state.mode === "ATTENDANCE" ? " active" : ""}`} disabled={pending} onClick={() => patch({ displayMode: "ATTENDANCE" })}>
          <span className="dcp-ico" aria-hidden><IconCheck /></span> Lista obecności
        </button>

        {/* WPIĘTY PUNKT */}
        <button
          type="button"
          className={`list-group-item list-group-item-action${state.mode === "PINNED_AGENDA" ? " active" : ""}`}
          onClick={() => setPickAgendaOpen((v) => !v)}
        >
          <span className="dcp-ico" aria-hidden><IconList size={14} /></span> Pokaż konkretny punkt
        </button>
        {pickAgendaOpen && (
          <div className="list-group-item p-0 bg-body-tertiary">
            {agenda.length === 0
              ? <div className="px-3 py-2 text-body-secondary small">Brak punktów agendy</div>
              : agenda.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`dcp-pick${state.pinnedAgendaItemId === a.id ? " active" : ""}`}
                  disabled={pending}
                  onClick={() => {
                    patch({ displayMode: "PINNED_AGENDA", displayPinnedAgendaItemId: a.id });
                    setPickAgendaOpen(false);
                  }}
                >
                  <span className="dcp-pick-num">{a.number ? `${a.number}.` : "-"}</span>
                  <span className="dcp-pick-title">{a.title}</span>
                </button>
              ))}
          </div>
        )}

        {/* WPIĘTE GŁOSOWANIE */}
        <button
          type="button"
          className={`list-group-item list-group-item-action${state.mode === "PINNED_VOTE" ? " active" : ""}`}
          onClick={() => setPickVoteOpen((v) => !v)}
        >
          <span className="dcp-ico" aria-hidden><IconCheck /></span> Pokaż wyniki głosowania
        </button>
        {pickVoteOpen && (
          <div className="list-group-item p-0 bg-body-tertiary">
            {votes.filter((v) => v.status === "CLOSED").length === 0
              ? <div className="px-3 py-2 text-body-secondary small">Brak zamkniętych głosowań</div>
              : votes.filter((v) => v.status === "CLOSED").map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`dcp-pick${state.pinnedVoteId === v.id ? " active" : ""}`}
                  disabled={pending}
                  onClick={() => {
                    patch({ displayMode: "PINNED_VOTE", displayPinnedVoteId: v.id });
                    setPickVoteOpen(false);
                  }}
                >
                  <span className="dcp-pick-num">nr {v.number ?? "-"}</span>
                  <span className="dcp-pick-title">{v.title}</span>
                </button>
              ))}
          </div>
        )}

        {/* PRZERWA W OBRADACH - osobny tryb; zasłania ekran/transmisję; z licznikiem */}
        <button
          type="button"
          className={`list-group-item list-group-item-action${isBreak ? " active" : ""}`}
          onClick={() => setBreakOpen((v) => !v)}
        >
          <span className="dcp-ico" aria-hidden>⏸</span> Przerwa w obradach
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
            <div className="list-group-item small fw-semibold text-body-secondary bg-body-tertiary">Pokaż PIN na sali</div>
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
          <span className="dcp-ico" aria-hidden>▪</span> Wyczyść ekran (pusty)
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
          className={`btn w-100 justify-content-center${state.mode === "MESSAGE" ? " active" : ""}`}
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
      <div className="card-body border-top">
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
