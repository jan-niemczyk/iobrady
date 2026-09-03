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
      <div className="px-5 py-3 border-b border-[var(--color-rule)] flex items-center justify-between">
        <div>
          <div className="eyebrow">Ekran prezentacyjny</div>
          <div className="text-xs" style={{ color: b.color, fontWeight: 600 }}>{b.label}</div>
        </div>
        <a
          className="btn"
          style={{ padding: "4px 10px", fontSize: 11 }}
          href={`/display/${meetingId}`}
          target="_blank"
          rel="noreferrer"
        >
          Otwórz podgląd
        </a>
      </div>

      <div className="p-4 space-y-2">
        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", textAlign: "center", fontWeight: 700 }}
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

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontWeight: state.mode === "DEFAULT" ? 600 : 400 }}
          disabled={pending}
          onClick={() => patch({ displayMode: "DEFAULT" })}
        >
          ◴ Ekran domyślny (nazwa posiedzenia)
        </button>

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontWeight: state.mode === "SPEAKER_LIST" ? 600 : 400 }}
          disabled={pending}
          onClick={() => patch({ displayMode: "SPEAKER_LIST" })}
        >
          <IconMic size={14} /> Lista mówców
        </button>

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontWeight: state.mode === "FORMAL_MOTIONS" ? 600 : 400 }}
          disabled={pending}
          onClick={() => patch({ displayMode: "FORMAL_MOTIONS" })}
        >
          <IconMic size={14} /> Wnioski formalne
        </button>

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontWeight: state.mode === "AGENDA_LIST" ? 600 : 400 }}
          disabled={pending}
          onClick={() => patch({ displayMode: "AGENDA_LIST" })}
        >
          <IconList size={14} /> Porządek obrad (lista)
        </button>

        {/* WPIĘTY PUNKT */}
        <div>
          <button
            className="btn"
            style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontWeight: state.mode === "PINNED_AGENDA" ? 600 : 400 }}
            onClick={() => setPickAgendaOpen((v) => !v)}
          >
            <IconList size={14} /> Pokaż konkretny punkt
          </button>
          {pickAgendaOpen && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto p-2 border border-[var(--color-rule-soft)]">
              {agenda.length === 0 && <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>Brak punktów agendy</div>}
              {agenda.map((a) => (
                <button
                  key={a.id}
                  className="btn"
                  style={{ width: "100%", justifyContent: "flex-start", padding: "4px 8px", fontSize: 11, fontWeight: state.pinnedAgendaItemId === a.id ? 600 : 400 }}
                  disabled={pending}
                  onClick={() => {
                    patch({ displayMode: "PINNED_AGENDA", displayPinnedAgendaItemId: a.id });
                    setPickAgendaOpen(false);
                  }}
                >
                  <span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>{a.number}.</span>
                  <span className="truncate">{a.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* WPIĘTE GŁOSOWANIE */}
        <div>
          <button
            className="btn"
            style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontWeight: state.mode === "PINNED_VOTE" ? 600 : 400 }}
            onClick={() => setPickVoteOpen((v) => !v)}
          >
            <IconCheck /> Pokaż wyniki głosowania
          </button>
          {pickVoteOpen && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto p-2 border border-[var(--color-rule-soft)]">
              {votes.filter((v) => v.status === "CLOSED").length === 0 && (
                <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>Brak zamkniętych głosowań</div>
              )}
              {votes.filter((v) => v.status === "CLOSED").map((v) => (
                <div key={v.id} className="flex items-center gap-1">
                  <button
                    className="btn"
                    style={{ flex: 1, justifyContent: "flex-start", padding: "4px 8px", fontSize: 11, fontWeight: state.pinnedVoteId === v.id ? 600 : 400 }}
                    disabled={pending}
                    onClick={() => {
                      patch({ displayMode: "PINNED_VOTE", displayPinnedVoteId: v.id });
                      setPickVoteOpen(false);
                    }}
                  >
                    <span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>nr {v.number ?? "-"}</span>
                    <span className="truncate">{v.title}</span>
                  </button>
                  <button
                    className="btn"
                    style={{ padding: "4px 8px", fontSize: 11, color: "var(--color-no)" }}
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
          <div className="mt-2">
            <div className="label mb-1" style={{ fontSize: 11 }}>Pokaż PIN na sali</div>
            <div className="space-y-1">
              {votes.filter((v) => v.pinRequired && (v.status === "OPEN" || v.id === state.pinVoteId)).map((v) => {
                const active = state.pinVoteId === v.id;
                return (
                  <button
                    key={v.id}
                    className="btn"
                    style={{ width: "100%", justifyContent: "flex-start", padding: "6px 8px", fontSize: 11, fontWeight: active ? 600 : 400, borderColor: active ? "var(--color-accent)" : undefined }}
                    disabled={pending}
                    onClick={() => patch({ displayPinVoteId: active ? null : v.id })}
                  >
                    <span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>nr {v.number ?? "-"}</span>
                    <span className="truncate">{active ? "PIN pokazany - kliknij, by ukryć" : `Pokaż PIN: ${v.title}`}</span>
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
            className="input"
            placeholder="Treść komunikatu (np. Zaraz wznawiamy obrady)"
            value={msgDraft}
            onChange={(e) => setMsgDraft(e.target.value)}
            style={{ minHeight: 60, fontSize: 12 }}
          />
          <button
            className="btn"
            style={{ width: "100%", marginTop: 4, fontWeight: state.mode === "MESSAGE" ? 600 : 400 }}
            disabled={pending || !msgDraft.trim()}
            onClick={() => patch({ displayMode: "MESSAGE", displayCustomMessage: msgDraft })}
          >
            <IconMessage /> Wyświetl komunikat
          </button>
          <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer" style={{ color: "var(--color-ink-2)" }}>
            <input
              type="checkbox"
              checked={state.messageOnOverlay ?? true}
              onChange={(e) => patch({ displayMessageOnOverlay: e.target.checked })}
            />
            Pokaż komunikat także na transmisji (OBS)
          </label>
          <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer" style={{ color: "var(--color-ink-2)" }}>
            <input
              type="checkbox"
              checked={state.messageObsStyle ?? false}
              onChange={(e) => patch({ displayMessageObsStyle: e.target.checked })}
            />
            Na prezentacji pokaż komunikat w stylu transmisji (kolorowe tło)
          </label>
        </div>

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", fontWeight: state.mode === "BLANK" ? 600 : 400 }}
          disabled={pending}
          onClick={() => patch({ displayMode: "BLANK" })}
        >
          ⬛ Wyczyść ekran (pusty)
        </button>

        {/* OPCJE */}
        <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer" style={{ color: "var(--color-ink-2)" }}>
          <input
            type="checkbox"
            checked={state.showCastCount}
            onChange={(e) => patch({ displayShowCastCount: e.target.checked })}
          />
          Pokaż licznik oddanych głosów w trakcie głosowania
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--color-ink-2)" }}>
          <input
            type="checkbox"
            checked={state.showByName}
            onChange={(e) => patch({ displayShowByName: e.target.checked })}
          />
          Pokazuj imienne wyniki głosowań jawnych (tablica)
        </label>
        {state.showByName && (
          <label className="flex items-center gap-2 text-xs cursor-pointer pl-5" style={{ color: "var(--color-ink-2)" }}>
            <input
              type="checkbox"
              checked={state.showIndividualVotes}
              onChange={(e) => patch({ displayShowIndividualVotes: e.target.checked })}
            />
            Pokazuj indywidualne stanowiska (za/przeciw/wstrz.)
          </label>
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
    <div style={{ border: "1px solid var(--color-rule-soft)", padding: 8 }}>
      <div className="flex items-center justify-between">
        <button type="button" className="text-sm font-medium flex items-center gap-1" style={{ fontWeight: isBreak ? 600 : 400 }} onClick={() => setExpanded((v) => !v)}>
          <span style={{ opacity: 0.5, fontSize: 11 }}>{expanded || isBreak ? "▾" : "▸"}</span> Przerwa w obradach
        </button>
        {isBreak && (
          <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} disabled={pending} onClick={() => patch({ displayMode: "AUTO", breakUntil: null })}>Zakończ</button>
        )}
      </div>
      {(expanded || isBreak) && (
        <div className="mt-2">
      <div className="flex flex-wrap gap-1 mb-2">
        {[5, 10, 15, 30].map((min) => (
          <button key={min} className="btn" style={{ padding: "3px 10px", fontSize: 12 }} disabled={pending} onClick={() => startBreak(min)}>{min} min</button>
        ))}
      </div>
      <div className="flex items-center gap-1 mb-2">
        <input
          className="input"
          placeholder="do godz. GG:MM"
          value={customTime}
          onChange={(e) => onTimeChange(e.target.value)}
          inputMode="numeric"
          style={{ fontSize: 12, maxWidth: 120 }}
        />
        <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} disabled={pending || !customTime} onClick={() => startUntilTime(customTime)}>Ustaw</button>
      </div>
      <div className="flex items-center gap-1 mb-2">
        <input
          className="input"
          placeholder="minut z palca"
          value={customMin}
          onChange={(e) => setCustomMin(e.target.value.replace(/\D/g, "").slice(0, 3))}
          inputMode="numeric"
          style={{ fontSize: 12, maxWidth: 120 }}
        />
        <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} disabled={pending || !customMin} onClick={() => { startBreak(Number(customMin)); setCustomMin(""); }}>Ustaw</button>
      </div>
      <button className="btn" style={{ width: "100%", padding: "3px 10px", fontSize: 12 }} disabled={pending} onClick={startOpenEnded}>Przerwa bez licznika</button>
      {isBreak && state.breakUntil && (
        <div className="text-xs mt-2" style={{ color: "var(--color-ink-3)" }}>
          Wznowienie: {new Date(state.breakUntil).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
