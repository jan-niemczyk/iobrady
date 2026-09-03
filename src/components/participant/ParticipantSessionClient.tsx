"use client";

import { useEffect, useState, useTransition, createContext, useContext, useCallback, useRef } from "react";
import { useHotkeys } from "@/lib/useHotkeys";
import type { AttendanceStatus, VoteType, VoteVisibility, MajorityType, MajorityKind, MajorityBase, VoteChoice } from "@prisma/client";

export interface ActiveVote {
  id: string;
  title: string;
  agendaItemTitle?: string | null;
  agendaItemNumber?: string | null;
  description?: string | null;
  type: VoteType;
  visibility: VoteVisibility;
  majority: MajorityType;
  majorityKind: MajorityKind;
  majorityBase: MajorityBase;
  minSelections: number | null;
  maxSelections: number | null;
  options: { id: string; order: number; label: string; positionNumber?: string | null; description?: string | null }[];
  alreadyVoted: boolean;
  myChoice: VoteChoice | null;
  mySelectedOptionIds: string[];
  /** pakiet: mój głos per pozycja */
  myPackageChoices?: { optionId: string; choice: VoteChoice }[];
  voteIsFinal?: boolean;
  /** PIN */
  pinRequired?: boolean;
  pinAuthorized?: boolean;
  /** pakiet */
  requireAllPositions?: boolean;
}

interface InitialState {
  participantId: string;
  meetingId: string;
  meetingName: string;
  meetingNumber: string;
  userName: string;
  userId: string;
  hasVotingRight: boolean;
  isChairperson?: boolean;
  canUseMiniDisplay?: boolean;
  hasPriorityRight?: boolean;
  excludedFromMeeting?: boolean;
  allowFormalMotions?: boolean;
  attendanceCheck?: { active: boolean; selfEnabled: boolean; myPresent: boolean } | null;
  isInvitedGuest: boolean;
  attendance: AttendanceStatus | null;
  attendanceOpen: boolean;
  currentAgendaItem: { number: string; title: string } | null;
  openMeetings?: { meetingId: string; name: string; number: string; hasVotingRight: boolean }[];
}

interface SpeakerEntry {
  id: string;
  userName: string;
  isMe: boolean;
  order: number;
  status: "WAITING" | "SPEAKING" | "FINISHED" | "WITHDRAWN";
  entryType: "REGULAR" | "FORMAL_MOTION" | "AD_VOCEM";
  timeLimitSec: number | null;
  timeAdjustmentSec: number;
  startedAt: string | null;
}

interface SpeakerListInfo {
  id: string;
  selfSignupEnabled: boolean;
  allowRegular: boolean;
  allowAdVocem: boolean;
  allowFormalMotion: boolean;
  visibleToParticipants: boolean;
  defaultTimeLimitSec: number | null;
  mySignedUp: boolean;
  entries: SpeakerEntry[];
}

interface FormalMotionEntry {
  id: string; userName: string; isMe: boolean; order: number;
  status: "WAITING" | "SPEAKING" | "FINISHED" | "WITHDRAWN";
  groupShort: string | null;
  timeLimitSec: number | null; timeAdjustmentSec: number; startedAt: string | null;
}
interface FormalMotionsInfo {
  listId: string;
  entries: FormalMotionEntry[];
}

interface LastClosedVote {
  id: string;
  title: string;
  type: VoteType;
  visibility: VoteVisibility;
  number: number | null;
  closedAt: string | null;
  resultYes: number;
  resultNo: number;
  resultAbstain: number;
  resultCastCount: number;
  resultPresentCount: number;
  resultPassed: boolean | null;
  myChoice: VoteChoice | null;
  /** Dla typu LIST - liczba głosów na każdego kandydata; dla PACKAGE - wyniki per pozycja */
  options: { id: string; order: number; label: string; resultCount: number; positionNumber?: string | null; resultYes?: number; resultNo?: number; resultAbstain?: number }[];
  requireAllPositions?: boolean;
}

interface SessionResponse extends Omit<InitialState, never> {
  activeVote: ActiveVote | null;
  lastClosedVote?: LastClosedVote | null;
  messages?: { id: string; content: string; publishedAt: string }[];
  speakerList?: SpeakerListInfo | null;
  formalMotions?: FormalMotionsInfo | null;
}

// ─── Toasty (kolorowe potwierdzenia oddania głosu) ────────────────────────────
type ToastTone = "yes" | "no" | "abstain" | "accent" | "neutral";
interface ToastItem { id: number; title: string; detail?: string; tone: ToastTone }
const ToastCtx = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

function toneColors(tone: ToastTone): { bg: string; fg: string; bar: string } {
  switch (tone) {
    case "yes": return { bg: "var(--color-yes-bg)", fg: "var(--color-yes)", bar: "var(--color-yes)" };
    case "no": return { bg: "var(--color-no-bg)", fg: "var(--color-no)", bar: "var(--color-no)" };
    case "abstain": return { bg: "var(--color-abstain-bg)", fg: "var(--color-abstain)", bar: "var(--color-abstain)" };
    case "accent": return { bg: "var(--color-paper-2)", fg: "var(--color-accent)", bar: "var(--color-accent)" };
    default: return { bg: "var(--color-paper-2)", fg: "var(--color-ink)", bar: "var(--color-ink-3)" };
  }
}

function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 16, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none", padding: "0 16px" }}>
      {toasts.map((t) => {
        const c = toneColors(t.tone);
        return (
          <div key={t.id} style={{
            pointerEvents: "auto", width: "100%", maxWidth: 460, background: c.bg, color: c.fg,
            borderLeft: `5px solid ${c.bar}`, borderRadius: 10, padding: "12px 16px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.18)", animation: "esog-toast-in 180ms ease-out",
          }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{t.title}</div>
            {t.detail && <div style={{ fontSize: 13, marginTop: 2, color: "var(--color-ink-2)" }}>{t.detail}</div>}
          </div>
        );
      })}
      <style>{`@keyframes esog-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

export function ParticipantSessionClient({ initial }: { initial: InitialState }) {
  const [state, setState] = useState<SessionResponse>({ ...initial, activeVote: null });
  const [pending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const pushToast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = ++toastSeq.current;
    setToasts((arr) => [...arr, { ...t, id }]);
    setTimeout(() => setToasts((arr) => arr.filter((x) => x.id !== id)), 4500);
  }, []);

  // Toast przy ROZPOCZĘCIU sprawdzenia obecności (przejście brak -> aktywne).
  // Dotyczy wyłącznie sprawdzenia obecności; kworum to osobny mechanizm (nie ustawia attendanceCheck.active).
  const prevAttendanceActive = useRef<boolean>(!!initial.attendanceCheck?.active);
  const firstAttendanceCheck = useRef(true);
  useEffect(() => {
    const active = !!state.attendanceCheck?.active;
    if (firstAttendanceCheck.current) {
      firstAttendanceCheck.current = false;
      prevAttendanceActive.current = active;
      return;
    }
    if (active && !prevAttendanceActive.current) {
      pushToast({ title: "Rozpoczęto sprawdzenie obecności", detail: state.attendanceCheck?.selfEnabled ? "Potwierdź swoją obecność." : "Obecność odnotowuje prowadzący.", tone: "accent" });
    }
    prevAttendanceActive.current = active;
  }, [state.attendanceCheck?.active, state.attendanceCheck?.selfEnabled, pushToast]);

  async function refetch() {
    try {
      const r = await fetch(`/api/me/session?m=${initial.meetingId}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        // Posiedzenie zamknięte / brak aktywnego -> przeładuj widok serwerowy (ekran „brak posiedzeń").
        if (!j?.meetingId) { window.location.reload(); return; }
        setState((s) => ({ ...s, ...j }));
      }
    } catch { /* */ }
  }

  useEffect(() => {
    // Pierwsze pobranie stanu
    refetch();

    // SSE - real-time eventy z serwera (push z backendu)
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource(`/api/meetings/${initial.meetingId}/stream`);
      es.onmessage = () => refetch();
      es.onerror = () => {
        es?.close();
        // odporność na zerwane SSE (proxy, sieć mobilna) - reconnect po 2s
        reconnectTimer = setTimeout(connect, 2000);
      };
    }
    connect();

    // Polling backstop co 3s - gwarantuje odświeżenie nawet gdy SSE nie dowiezie
    // eventu (np. zmiana statusu posiedzenia otwarte/zamknięte przy zerwanym SSE).
    const pollTimer = setInterval(refetch, 3000);

    // Odśwież gdy radny wraca na kartę (np. odblokował telefon)
    function onVis() { if (document.visibilityState === "visible") refetch(); }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refetch);

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refetch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.meetingId]);

  return (
    <ToastCtx.Provider value={pushToast}>
    <div className="px-5 py-8 max-w-[720px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-5 mb-6">
        <div className="eyebrow mb-2">Posiedzenie nr <span className="mono">{state.meetingNumber}</span></div>
        <h1 style={{ fontSize: 28, lineHeight: 1.1 }}>{state.meetingName}</h1>
        <div className="mt-3 flex items-center justify-between gap-2 text-sm" style={{ color: "var(--color-ink-2)" }}>
          <span className="flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-yes)", display: "inline-block" }} />
            Zalogowano jako <strong>{state.userName}</strong>
          </span>
          <a href="/account" className="btn" style={{ padding: "3px 10px", fontSize: 11 }}>Zmień hasło</a>
        </div>
        {state.canUseMiniDisplay && (
          <div className="mt-2">
            <a href="/session/mini" target="_blank" rel="noopener" className="btn" style={{ padding: "3px 10px", fontSize: 11, borderColor: "var(--color-accent)", color: "var(--color-accent)" }} title="Otwórz wąski widok 'wyświetlacz' (do nałożenia na stream/prezentację)">
              Otwórz wyświetlacz
            </a>
          </div>
        )}
      </header>

      {state.openMeetings && state.openMeetings.length > 1 && (
        <div className="mb-6">
          <div className="eyebrow mb-2">Twoje otwarte posiedzenia ({state.openMeetings.length})</div>
          <div className="flex flex-wrap gap-2">
            {state.openMeetings.map((m) => {
              const isCurrent = m.meetingId === state.meetingId;
              return (
                <a
                  key={m.meetingId}
                  href={`/session?m=${m.meetingId}`}
                  className="pill"
                  style={{
                    padding: "5px 12px", fontSize: 12, textDecoration: "none",
                    background: isCurrent ? "var(--color-ink)" : undefined,
                    color: isCurrent ? "var(--color-paper)" : undefined,
                    borderColor: isCurrent ? "var(--color-ink)" : undefined,
                  }}
                  title={m.hasVotingRight ? "Masz prawo głosu" : "Bez prawa głosu"}
                >
                  Nr {m.number} - {m.name}{!m.hasVotingRight && " (bez prawa)"}
                </a>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-px mb-6 border border-[var(--color-rule)] bg-[var(--color-rule)]">
        <div className="p-4" style={{ background: "var(--color-paper)" }}>
          <div className="eyebrow">Status</div>
          <div className="text-base font-medium mt-1">
            {state.hasVotingRight ? "Z prawem głosu" : state.isInvitedGuest ? "Gość" : "Bez prawa głosu"}
          </div>
        </div>
        <div className="p-4" style={{
          background: state.attendance === "PRESENT" ? "var(--color-yes-bg)" : "var(--color-paper)",
          color: state.attendance === "PRESENT" ? "var(--color-yes)" : undefined,
        }}>
          <div className="eyebrow" style={{ color: "inherit", opacity: 0.85 }}>Obecność</div>
          <div className="text-base font-medium mt-1">
            {state.attendance === "PRESENT" ? "Potwierdzona ✓" : "Nie potwierdzona"}
          </div>
        </div>
      </div>

      {state.currentAgendaItem && (
        <div className="card p-5 mb-6">
          <div className="eyebrow mb-2">Rozpatrywany punkt</div>
          <div className="flex items-baseline gap-3">
            <span className="mono text-sm" style={{ color: "var(--color-ink-3)" }}>{state.currentAgendaItem.number}</span>
            <span style={{ fontSize: 20, lineHeight: 1.2 }}>{state.currentAgendaItem.title}</span>
          </div>
        </div>
      )}

      {/* KOMUNIKATY OPERATORA */}
      {state.messages && state.messages.length > 0 && (
        <div className="card mb-6" style={{ borderColor: "var(--color-seal)", borderLeftWidth: 4 }}>
          <div className="px-4 py-2 border-b border-[var(--color-rule-soft)]">
            <span className="eyebrow" style={{ color: "var(--color-seal)" }}>
              Komunikaty operatora ({state.messages.length})
            </span>
          </div>
          <ul className="divide-y divide-[var(--color-rule-soft)]">
            {state.messages.map((m) => (
              <li key={m.id} className="px-4 py-2 text-sm flex items-start gap-3">
                <span className="mono text-xs shrink-0" style={{ color: "var(--color-ink-3)" }}>
                  {new Date(m.publishedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span>{m.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SPRAWDZENIE OBECNOŚCI - samodzielne potwierdzenie w migawce */}
      {state.attendanceCheck?.active && (
        <AttendanceConfirm
          meetingId={state.meetingId}
          userId={initial.userId}
          selfEnabled={state.attendanceCheck.selfEnabled}
          myPresent={state.attendanceCheck.myPresent}
          onUpdate={refetch}
        />
      )}

      {/* Nakładka głosowań PONAD wyborem posiedzenia - obsługuje też kilka głosowań naraz. */}
      <ActiveVotesOverlay showMeetingNames={(state.openMeetings?.length ?? 0) > 1} />

      {(() => {
        const voteActive = !!state.activeVote;
        const isPresent = state.attendance === "PRESENT";
        const quorumActive = state.activeVote && state.activeVote.type === "QUORUM";

        // Nieobecni (poza aktywnym głosowaniem kworum) nie widzą nic poza statusem obecności.
        if (!isPresent && !quorumActive) {
          return (
            <div className="text-sm" style={{ color: "var(--color-ink-3)" }}>
              Nie potwierdzono obecności. Poczekaj na sprawdzenie obecności przez prowadzącego - do tego czasu nie możesz głosować ani zapisywać się do dyskusji.
            </div>
          );
        }

        return (
          <>
            {state.activeVote ? (
              <div className="card p-5" style={{ color: "var(--color-ink-3)" }}>
                <p className="text-sm">Trwa głosowanie.</p>
                {state.isChairperson && (
                  <button
                    className="btn mt-3"
                    style={{ padding: "6px 14px", fontSize: 13, color: "var(--color-no)", borderColor: "var(--color-no)" }}
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm("Zamknąć głosowanie i policzyć wynik?")) return;
                      startTransition(async () => {
                        const r = await fetch(`/api/votes/${state.activeVote!.id}/close`, { method: "POST" });
                        if (!r.ok) alert(await r.text());
                        refetch();
                      });
                    }}
                  >
                    Zamknij głosowanie
                  </button>
                )}
              </div>
            ) : state.lastClosedVote ? (
              <LastResultsCard vote={state.lastClosedVote} />
            ) : (
              <div className="text-sm" style={{ color: "var(--color-ink-3)" }}>
                {state.hasVotingRight
                  ? "Czekaj na otwarcie głosowania przez operatora."
                  : "Uczestniczysz w posiedzeniu bez prawa głosu."}
              </div>
            )}

            {/* Poza głosowaniem: wniosek, lista mówców, zapisy - tylko dla obecnych, POD głosowaniem (D3). */}
            {!voteActive && isPresent && (
              <div className="mt-6">
                {state.allowFormalMotions && !state.excludedFromMeeting && (
                  <FormalMotionButton meetingId={state.meetingId} />
                )}
                {state.speakerList && (state.speakerList.visibleToParticipants || state.speakerList.entries.length > 0) && (
                  <SpeakerListView speakerList={state.speakerList} pending={pending} onUpdate={refetch} hasPriorityRight={state.hasPriorityRight} isChairperson={!!state.isChairperson} />
                )}
                {/* Kolejka wniosków formalnych - widoczna dla wszystkich; przewodniczący steruje. */}
                {state.formalMotions && state.formalMotions.entries.length > 0 && (
                  <FormalMotionsQueue formalMotions={state.formalMotions} isChairperson={!!state.isChairperson} pending={pending} onUpdate={refetch} />
                )}
                {!state.excludedFromMeeting && (
                  <SignupLists meetingId={state.meetingId} />
                )}
              </div>
            )}
          </>
        );
      })()}
    </div>
    <ToastHost toasts={toasts} />
    </ToastCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Karta do głosowania
// ─────────────────────────────────────────────────────────────────────────

export function VoteBallot({ vote, onCast }: { vote: ActiveVote; onCast: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(vote.mySelectedOptionIds);
  const pushToast = useContext(ToastCtx);

  // Komponent montowany z key={vote.id}, więc stan startowy ustawia się raz dla danego
  // głosowania. NIE synchronizujemy z pollingiem - inaczej refetch co 3s nadpisałby
  // niewysłane jeszcze zaznaczenia radnego pustą tablicą z serwera.

  function cast(payload: { choice?: string; selectedOptionIds?: string[]; packageChoices?: { optionId: string; choice: VoteChoice }[]; invalid?: boolean }) {
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/votes/${vote.id}/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) { setError(await r.text()); return; }
      showCastToast(payload);
      onCast();
    });
  }

  // Kolorowy toast z konkretnym oddanym głosem (także lista/pakiet).
  function showCastToast(payload: { choice?: string; selectedOptionIds?: string[]; packageChoices?: { optionId: string; choice: VoteChoice }[]; invalid?: boolean }) {
    // Tajne: NIE ujawniamy jak zagłosowano - wyłącznie neutralne potwierdzenie.
    if (vote.visibility === "SECRET") {
      pushToast({ title: "Oddano głos", detail: vote.title, tone: "neutral" });
      return;
    }
    if (payload.invalid) {
      pushToast({ title: "Oddano głos nieważny", detail: vote.title, tone: "neutral" });
      return;
    }
    if (vote.type === "QUORUM") {
      pushToast({ title: "Potwierdzono obecność", tone: "yes" });
      return;
    }
    if (vote.type === "STANDARD" && payload.choice) {
      const map: Record<string, { t: string; tone: ToastTone }> = {
        YES: { t: "ZA", tone: "yes" }, NO: { t: "PRZECIW", tone: "no" }, ABSTAIN: { t: "WSTRZYMUJĘ SIĘ", tone: "abstain" },
      };
      const m = map[payload.choice] ?? { t: payload.choice, tone: "accent" as ToastTone };
      pushToast({ title: `Oddano głos: ${m.t}`, detail: vote.title, tone: m.tone });
      return;
    }
    if (vote.type === "LIST") {
      const labels = vote.options.filter((o) => (payload.selectedOptionIds ?? []).includes(o.id)).map((o) => o.label);
      pushToast({
        title: "Oddano głos na listę",
        detail: labels.length ? `Wskazano: ${labels.join(", ")}` : "Brak wskazań",
        tone: "accent",
      });
      return;
    }
    if (vote.type === "PACKAGE" && payload.packageChoices) {
      const label: Record<string, string> = { YES: "za", NO: "przeciw", ABSTAIN: "wstrz." };
      const byOption = new Map(payload.packageChoices.map((c) => [c.optionId, c.choice as string]));
      const parts = vote.options.map((o, i) => `${o.positionNumber ?? i + 1}. ${label[byOption.get(o.id) ?? ""] ?? "-"}`);
      pushToast({ title: "Oddano głos w pakiecie", detail: parts.join(", "), tone: "accent" });
      return;
    }
    pushToast({ title: "Głos zapisany", detail: vote.title, tone: "accent" });
  }

  const isList = vote.type === "LIST";

  return (
    <div className="card slide-in" style={{ borderColor: "var(--color-live)", borderWidth: 2 }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background: "var(--color-no-bg)", borderColor: "var(--color-live)" }}>
        <span className="pill pill-live">
          Trwa głosowanie - {vote.visibility === "SECRET" ? "tajne" : "jawne"}
        </span>
      </div>
      <div className="p-6">
        {vote.agendaItemTitle && (
          <div className="mb-1" style={{ fontSize: 13, color: "var(--color-ink-3)" }}>
            {vote.agendaItemNumber ? `Punkt ${vote.agendaItemNumber}. ` : ""}{vote.agendaItemTitle}
          </div>
        )}
        <h2 style={{ fontSize: 22, lineHeight: 1.2 }} className="mb-2">{vote.title}</h2>
        {vote.description && (
          <p className="text-sm mb-5" style={{ color: "var(--color-ink-2)" }}>{vote.description}</p>
        )}

        {(() => {
          // "Pierwszy głos ostateczny": po oddaniu głosu chowamy panel głosowania w całości
          // (przyciski/lista niepotrzebne). Zostaje sam komunikat "Twój głos" poniżej.
          // Oddanie wykrywamy przez alreadyVoted (marker/ballot) lub zapamiętany wybór.
          const hasVoted = vote.alreadyVoted || vote.myChoice != null || vote.mySelectedOptionIds.length > 0;
          const hideBallot = !!vote.voteIsFinal && hasVoted;
          if (hideBallot) return null;
          // Bramka PIN: dopóki radny nie wpisze poprawnego PIN-u, przyciski głosowania są ukryte.
          if (vote.pinRequired && !vote.pinAuthorized) {
            return <PinGate voteId={vote.id} onAuthorized={onCast} />;
          }
          return vote.type === "QUORUM" ? (
            <QuorumBallot
              confirmed={vote.myChoice === "YES"}
              onCast={() => cast({ choice: "YES" })}
              pending={pending}
            />
          ) : vote.type === "PACKAGE" ? (
            <PackageBallot
              vote={vote}
              secret={vote.visibility === "SECRET"}
              onCast={(choices) => cast({ packageChoices: choices })}
              onInvalid={() => cast({ invalid: true })}
              pending={pending}
            />
          ) : !isList ? (
            <StandardBallot
              myChoice={vote.myChoice}
              secret={vote.visibility === "SECRET"}
              alreadyVoted={vote.alreadyVoted}
              onCast={(choice) => cast({ choice })}
              onInvalid={() => cast({ invalid: true })}
              pending={pending}
            />
          ) : (
            <ListBallot
              options={vote.options}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              min={vote.minSelections ?? 0}
              max={vote.maxSelections ?? vote.options.length}
              onCast={() => cast({ selectedOptionIds: selectedIds })}
              pending={pending}
              alreadyVoted={vote.alreadyVoted}
            />
          );
        })()}

        {error && (
          <div className="mt-4 px-3 py-2 text-sm" style={{ background: "var(--color-no-bg)", border: "1px solid var(--color-no)", color: "var(--color-no)" }}>
            {error}
          </div>
        )}

        {vote.alreadyVoted && vote.visibility === "OPEN" && vote.myChoice && vote.type !== "QUORUM" && (
          <div
            className="mt-5 px-4 py-3 text-center"
            style={{
              border: "2px solid var(--color-ink)",
              background: vote.myChoice === "YES" ? "var(--color-yes-bg)"
                : vote.myChoice === "NO" ? "var(--color-no-bg)"
                : "var(--color-abstain-bg)",
            }}
          >
            <div className="eyebrow" style={{ fontSize: 10 }}>Twój głos</div>
            <div className="text-lg font-medium" style={{
              color: vote.myChoice === "YES" ? "var(--color-yes)"
                : vote.myChoice === "NO" ? "var(--color-no)"
                : "var(--color-abstain)",
            }}>
              {vote.myChoice === "YES" ? "ZA" : vote.myChoice === "NO" ? "PRZECIW" : "WSTRZYMAŁEŚ SIĘ"}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
              {vote.voteIsFinal ? "Głos jest ostateczny - nie można go zmienić." : "Możesz zmienić swój głos do czasu zamknięcia głosowania."}
            </p>
          </div>
        )}

        {vote.alreadyVoted && vote.visibility === "OPEN" && isList && (
          <div
            className="mt-5 px-4 py-3 text-center"
            style={{ border: "2px solid var(--color-ink)", background: "var(--color-yes-bg)" }}
          >
            <div className="eyebrow" style={{ fontSize: 10 }}>Twój głos</div>
            <div className="text-lg font-medium" style={{ color: "var(--color-yes)" }}>
              Głos został oddany
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
              {vote.voteIsFinal ? "Głos jest ostateczny - nie można go zmienić." : "Możesz zmienić swój wybór do czasu zamknięcia głosowania."}
            </p>
          </div>
        )}

        {vote.alreadyVoted && vote.visibility === "SECRET" && (
          <div
            className="mt-5 px-4 py-3 text-center"
            style={{ border: "2px solid var(--color-ink)", background: "var(--color-paper-2)" }}
          >
            <div className="eyebrow" style={{ fontSize: 10 }}>Głosowanie tajne</div>
            <div className="text-lg font-medium" style={{ color: "var(--color-ink)" }}>
              Twój głos został oddany
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
              Wybór pozostaje anonimowy i nie jest nigdzie zapisywany.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StandardBallot({
  myChoice, secret, onCast, onInvalid, pending, locked,
}: {
  myChoice: VoteChoice | null;
  secret: boolean;
  alreadyVoted: boolean;
  locked?: boolean;
  onCast: (c: VoteChoice) => void;
  onInvalid: () => void;
  pending: boolean;
}) {
  const buttons: { choice: VoteChoice; label: string; cls: string; hk: string }[] = [
    { choice: "YES", label: "Za", cls: "btn-yes", hk: "Z" },
    { choice: "NO", label: "Przeciw", cls: "btn-no", hk: "P" },
    { choice: "ABSTAIN", label: "Wstrzymuję się", cls: "btn-abstain", hk: "W" },
  ];
  // Skróty: Z/P/W oddają głos od razu (auto-wysłanie). N - głos nieważny (tajne).
  const canVote = !pending && !locked;
  useHotkeys([
    { key: "z", enabled: canVote, action: () => onCast("YES"), description: "Głos: Za" },
    { key: "p", enabled: canVote, action: () => onCast("NO"), description: "Głos: Przeciw" },
    { key: "w", enabled: canVote, action: () => onCast("ABSTAIN"), description: "Głos: Wstrzymuję się" },
    { key: "o", enabled: canVote && secret, action: () => onInvalid(), description: "Głos nieważny (obecny)" },
  ], [canVote, secret]);
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="text-xs mb-1" style={{ color: "var(--color-ink-3)" }}>
      </div>
      {buttons.map((b) => {
        // W głosowaniu TAJNYM nigdy nie pokazujemy który przycisk został wybrany
        // (brak ptaszka, brak obramówki). W jawnym - pokazujemy.
        const isMine = !secret && myChoice === b.choice;
        return (
          <button
            key={b.choice}
            disabled={pending || locked}
            onClick={() => onCast(b.choice)}
            className={`btn ${b.cls} btn-xl`}
            style={{
              outline: isMine ? "3px solid var(--color-ink)" : undefined,
              outlineOffset: 2,
              opacity: pending ? 0.7 : 1,
            }}
          >
            {b.label} <span style={{ opacity: 0.6, fontSize: "0.8em" }}>({b.hk})</span>{isMine && " ✓"}
          </button>
        );
      })}
      {/* Głos nieważny (tylko tajne): przycisk OBECNY - liczy się do frekwencji i do oddanych
          głosów w trakcie, ale NIE do głosujących po zamknięciu (głos nieważny). */}
      {secret && (
        <button
          disabled={pending || locked}
          onClick={onInvalid}
          className="btn btn-xl"
          style={{ opacity: pending ? 0.7 : 1 }}
          title="Oddaj głos nieważny (liczy się obecność, głos nie jest ważny)"
        >
          Obecny
        </button>
      )}
    </div>
  );
}

function ListBallot({
  options, selectedIds, setSelectedIds, min, max, onCast, pending, alreadyVoted, locked,
}: {
  options: { id: string; order: number; label: string }[];
  selectedIds: string[];
  setSelectedIds: (s: string[]) => void;
  min: number; max: number;
  onCast: () => void;
  pending: boolean;
  alreadyVoted: boolean;
  locked?: boolean;
}) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((s) => s !== id));
    } else {
      if (selectedIds.length >= max) return; // przekroczono maks
      setSelectedIds([...selectedIds, id]);
    }
  }

  const remaining = max - selectedIds.length;
  const tooFew = selectedIds.length < min;

  // Model "sejmowy": lista z aktywną pozycją, którą przesuwamy strzałkami.
  // Domyślnie każda pozycja = "przeciw" (niezaznaczona). Z lub "+" zaznacza aktywną jako ZA,
  // "-" kasuje. O zatwierdza (biały przycisk jak na wyświetlaczu sejmowym).
  const [activeIdx, setActiveIdx] = useState(0);
  const canAct = !pending && !locked;
  const markActive = () => {
    const o = options[activeIdx];
    if (!o) return;
    if (!selectedIds.includes(o.id) && selectedIds.length >= max) return;
    if (!selectedIds.includes(o.id)) {
      setSelectedIds([...selectedIds, o.id]);
      // po zaznaczeniu przejdź do kolejnej pozycji (wygoda przy wyborze wielu)
      if (activeIdx < options.length - 1) setActiveIdx((i) => i + 1);
    }
  };
  const unmarkActive = () => {
    const o = options[activeIdx];
    if (!o) return;
    if (selectedIds.includes(o.id)) setSelectedIds(selectedIds.filter((s) => s !== o.id));
  };
  useHotkeys([
    { key: "ArrowDown", enabled: canAct, action: () => setActiveIdx((i) => Math.min(options.length - 1, i + 1)), description: "Następna pozycja" },
    { key: "ArrowUp", enabled: canAct, action: () => setActiveIdx((i) => Math.max(0, i - 1)), description: "Poprzednia pozycja" },
    { key: "z", enabled: canAct, action: markActive, description: "ZA dla aktywnej pozycji" },
    { key: "+", enabled: canAct, action: markActive, description: "ZA dla aktywnej pozycji" },
    { key: "=", enabled: canAct, action: markActive, description: "ZA dla aktywnej pozycji" },
    { key: "-", enabled: canAct, action: unmarkActive, description: "Kasuj wybór aktywnej pozycji" },
    { key: "o", enabled: canAct && !tooFew, action: onCast, description: "Zatwierdź i wyślij głos" },
  ], [canAct, tooFew, activeIdx, selectedIds.join(","), options.map((o) => o.id).join(",")]);

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: "var(--color-ink-3)" }}>
        Wybierz {min === max ? `dokładnie ${min}` : `od ${min} do ${max}`} opcji. <strong>Niezaznaczenie = głos przeciw danemu kandydatowi.</strong>
      </p>
      <ul className="border border-[var(--color-rule)] divide-y divide-[var(--color-rule-soft)]">
        {options.map((o, i) => {
          const checked = selectedIds.includes(o.id);
          const disabled = locked || (!checked && selectedIds.length >= max);
          const isActive = i === activeIdx;
          return (
            <li key={o.id} style={{ outline: isActive ? "2px solid var(--color-accent)" : "none", outlineOffset: -2 }}>
              <label
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${disabled ? "opacity-40" : "hover:bg-[var(--color-paper-2)]"}`}
                style={{ background: checked ? "var(--color-yes-bg)" : undefined }}
                onClick={() => setActiveIdx(i)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(o.id)}
                  style={{ width: 20, height: 20 }}
                />
                <span className="mono text-xs" style={{ color: "var(--color-ink-3)", width: 24 }}>{o.order}.</span>
                <span className="text-base flex-1">{o.label}</span>
                {checked && <span className="pill pill-ok" style={{ fontSize: 10 }}>ZA</span>}
                {!checked && <span className="pill pill-bad" style={{ fontSize: 10 }}>PRZECIW</span>}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between mt-4 text-xs" style={{ color: "var(--color-ink-3)" }}>
        <span>
          Zaznaczono: <span className="mono">{selectedIds.length}</span> / {max}
          {remaining > 0 && ` (pozostało ${remaining})`}
        </span>
        {tooFew && <span style={{ color: "var(--color-no)" }}>Wymagane co najmniej {min}</span>}
      </div>

      <button
        className="btn btn-primary btn-lg w-full mt-4"
        disabled={pending || tooFew || locked}
        onClick={onCast}
      >
        {locked ? "Głos oddany" : pending ? "Wysyłam…" : alreadyVoted ? "Aktualizuj głos" : "Zatwierdź i wyślij głos"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Widok listy mówców dla uczestnika
// ─────────────────────────────────────────────────────────────────────────

function SpeakerListView({
  speakerList, pending, onUpdate, hasPriorityRight, isChairperson,
}: {
  speakerList: SpeakerListInfo;
  pending: boolean;
  onUpdate: () => void;
  hasPriorityRight?: boolean;
  isChairperson?: boolean;
}) {
  const [signingUp, setSigningUp] = useState(false);

  // Akcje przewodniczącego (te same endpointy co operator; autoryzacja po fladze).
  const chairAct = async (url: string, method = "POST", body?: object) => {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) alert(await r.text());
    onUpdate();
  };

  const speaking = speakerList.entries.find((e) => e.status === "SPEAKING");
  const waiting = speakerList.entries.filter((e) => e.status === "WAITING");
  // Wszystkie aktualne zapisy zalogowanego uczestnika (może być w kilku kategoriach)
  const myEntries = speakerList.entries.filter((e) => e.isMe && (e.status === "WAITING" || e.status === "SPEAKING"));
  const myRegular = myEntries.find((e) => e.entryType === "REGULAR");
  const myFormal = myEntries.find((e) => e.entryType === "FORMAL_MOTION");
  const myAdVocem = myEntries.find((e) => e.entryType === "AD_VOCEM");

  async function signUp(entryType: "REGULAR" | "FORMAL_MOTION" | "AD_VOCEM", priority = false) {
    setSigningUp(true);
    const r = await fetch(`/api/speakerlists/${speakerList.id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryType, priority }),
    });
    setSigningUp(false);
    if (!r.ok) { alert(await r.text()); return; }
    onUpdate();
  }

  async function withdraw(entryId: string) {
    if (!window.confirm("Wycofać ten zapis?")) return;
    setSigningUp(true);
    const r = await fetch(`/api/speaker-entries/${entryId}/withdraw`, { method: "POST" });
    setSigningUp(false);
    if (!r.ok) { alert(await r.text()); return; }
    onUpdate();
  }

  // Skróty listy mówców (działają, gdy zapisy są otwarte i uczestnik nie pisze w polu):
  //  D - zgłoś się do dyskusji, Shift+D - dyskusja z priorytetem, A - ad vocem,
  //  F - wniosek formalny (w obrębie listy mówców). Powtórne naciśnięcie D/A/F wycofuje własny zapis.
  const canSign = !pending && !signingUp && speakerList.selfSignupEnabled;
  useHotkeys([
    { key: "d", enabled: canSign, description: "Dyskusja (zgłoś/wycofaj)", action: () => myRegular ? withdraw(myRegular.id) : signUp("REGULAR") },
    { key: "d", shift: true, enabled: canSign && !myRegular, description: "Dyskusja z priorytetem", action: () => signUp("REGULAR", true) },
    { key: "a", enabled: canSign, description: "Ad vocem (zgłoś/wycofaj)", action: () => myAdVocem ? withdraw(myAdVocem.id) : signUp("AD_VOCEM") },
    { key: "f", shift: true, enabled: canSign, description: "Wniosek formalny na liście mówców (zgłoś/wycofaj)", action: () => myFormal ? withdraw(myFormal.id) : signUp("FORMAL_MOTION") },
  ], [canSign, myRegular?.id, myAdVocem?.id, myFormal?.id]);

  return (
    <div className="card mb-6">
      <div className="px-4 py-3 border-b border-[var(--color-rule-soft)]">
        <div className="flex items-center justify-between mb-2">
          <span className="eyebrow">Lista mówców</span>
          {isChairperson && (
            <button
              className="btn"
              style={{ padding: "2px 8px", fontSize: 10 }}
              onClick={() => chairAct(`/api/speakerlists/${speakerList.id}`, "PATCH", { selfSignupEnabled: !speakerList.selfSignupEnabled })}
              title={speakerList.selfSignupEnabled ? "Zamknij zapisy uczestników" : "Otwórz zapisy uczestników"}
            >
              {speakerList.selfSignupEnabled ? "Zamknij zapisy" : "Otwórz zapisy"}
            </button>
          )}
        </div>
        {speakerList.selfSignupEnabled && (
          <div className="flex gap-2 flex-wrap text-xs">
            {!myRegular ? (
              speakerList.allowRegular && (
                <>
                  <button className="btn btn-primary" style={{ padding: "5px 10px", fontSize: 11 }} disabled={pending || signingUp} onClick={() => signUp("REGULAR")}>
                    + Zapisz się
                  </button>
                  {hasPriorityRight && (
                    <button className="btn" style={{ padding: "5px 10px", fontSize: 11, borderColor: "var(--color-yes)", color: "var(--color-yes)" }} disabled={pending || signingUp} onClick={() => signUp("REGULAR", true)} title="Zgłoś się z priorytetem - wskakujesz na początek kolejki">
                      + Priorytet
                    </button>
                  )}
                </>
              )
            ) : (
              <button className="btn" style={{ padding: "5px 10px", fontSize: 11 }} disabled={pending || signingUp} onClick={() => withdraw(myRegular.id)}>
                ✕ Wycofaj zapis
              </button>
            )}
            {!myFormal ? (
              speakerList.allowFormalMotion && (
                <button className="btn" style={{ padding: "3px 8px", fontSize: 10, borderColor: "var(--color-abstain)", color: "var(--color-abstain)" }} disabled={pending || signingUp} onClick={() => signUp("FORMAL_MOTION")} title="Wniosek formalny - najwyższy priorytet">
                  + Wniosek formalny
                </button>
              )
            ) : (
              <button className="btn" style={{ padding: "5px 10px", fontSize: 11 }} disabled={pending || signingUp} onClick={() => withdraw(myFormal.id)}>
                ✕ Wycofaj wniosek
              </button>
            )}
            {!myAdVocem ? (
              speakerList.allowAdVocem && (
                <button className="btn" style={{ padding: "5px 10px", fontSize: 11, borderColor: "var(--color-no)", color: "var(--color-no)" }} disabled={pending || signingUp} onClick={() => signUp("AD_VOCEM")} title="Ad vocem">
                  + Ad vocem
                </button>
              )
            ) : (
              <button className="btn" style={{ padding: "5px 10px", fontSize: 11 }} disabled={pending || signingUp} onClick={() => withdraw(myAdVocem.id)}>
                ✕ Wycofaj ad vocem
              </button>
            )}
          </div>
        )}
      </div>

      {speaking && (
        <div className="px-4 py-3 border-b flex items-start justify-between gap-3" style={{ background: "var(--color-no-bg)", borderColor: "var(--color-live)" }}>
          <div>
            <div className="text-xs eyebrow" style={{ color: "var(--color-no)" }}>Przemawia</div>
            <div className={`text-sm mt-1 ${speaking.isMe ? "font-semibold" : "font-medium"}`}>
              {speaking.userName}{speaking.isMe && " (Ty)"}
            </div>
            {isChairperson && (
              <div className="flex gap-1 mt-2">
                <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => chairAct(`/api/speaker-entries/${speaking.id}`, "PATCH", { addSeconds: -30 })}>−30s</button>
                <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => chairAct(`/api/speaker-entries/${speaking.id}`, "PATCH", { addSeconds: 30 })}>+30s</button>
                <button className="btn btn-primary" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => chairAct(`/api/speaker-entries/${speaking.id}/end`)}>Zakończ</button>
              </div>
            )}
          </div>
          <ParticipantSpeakerTimer entry={speaking} />
        </div>
      )}

      {waiting.length === 0 && !speaking ? (
        <div className="px-4 py-4 text-sm" style={{ color: "var(--color-ink-3)" }}>
          Brak zgłoszeń.
        </div>
      ) : (
        <ol className="divide-y divide-[var(--color-rule-soft)]">
          {waiting.map((e, idx) => (
            <li key={e.id} className={`px-4 py-2 flex items-center gap-2 text-sm ${e.isMe ? "font-semibold" : ""}`}>
              <span className="mono text-xs w-6 text-right shrink-0" style={{ color: "var(--color-ink-3)" }}>{idx + 1}.</span>
              <span className="flex-1 truncate">{e.userName}{e.isMe && " (Ty)"}</span>
              {e.entryType === "FORMAL_MOTION" && (
                <span className="pill shrink-0" style={{ background: "var(--color-abstain-bg)", color: "var(--color-abstain)", fontSize: 9 }}>WF</span>
              )}
              {e.entryType === "AD_VOCEM" && (
                <span className="pill shrink-0" style={{ background: "var(--color-no-bg)", color: "var(--color-no)", fontSize: 9 }}>AV</span>
              )}
              {isChairperson && (
                <>
                  <button className="btn btn-primary shrink-0" style={{ padding: "2px 8px", fontSize: 10 }} disabled={!!speaking} onClick={() => chairAct(`/api/speaker-entries/${e.id}/start`)} title="Udziel głosu">
                    Udziel
                  </button>
                  <button className="btn shrink-0" style={{ padding: "2px 8px", fontSize: 10, color: "var(--color-no)" }} onClick={() => { if (window.confirm(`Usunąć ${e.userName} z listy mówców?`)) chairAct(`/api/speaker-entries/${e.id}`, "DELETE"); }} title="Usuń z listy">
                    Usuń
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Timer aktualnie przemawiającego - widok uczestnika (tylko prezentacja).
function ParticipantSpeakerTimer({ entry }: { entry: SpeakerEntry }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);

  if (!entry.startedAt) return null;
  const elapsed = Math.floor((now - new Date(entry.startedAt).getTime()) / 1000);
  const limit = entry.timeLimitSec;
  const displaySec = limit != null ? limit - elapsed : elapsed;
  const over = displaySec < 0;

  return (
    <div className="text-right">
      <div className="num" style={{ fontSize: 22, lineHeight: 1, color: over ? "var(--color-no)" : "var(--color-ink)" }}>
        {formatDuration(displaySec)}
      </div>
      {limit != null && (
        <div className="text-xs mono mt-1" style={{ color: "var(--color-ink-3)" }}>
          limit: {formatDuration(limit)}
        </div>
      )}
    </div>
  );
}

function formatDuration(sec: number): string {
  const sign = sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${sign}${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Głosowanie typu KWORUM - jeden przycisk "OBECNY"
function QuorumBallot({
  confirmed, onCast, pending,
}: {
  confirmed: boolean;
  onCast: () => void;
  pending: boolean;
}) {
  // Skrót: O lub Enter potwierdza obecność (auto).
  const canConfirm = !pending && !confirmed;
  useHotkeys([
    { key: "o", enabled: canConfirm, action: onCast, description: "Potwierdź obecność (kworum)" },
    { key: "Enter", enabled: canConfirm, action: onCast, description: "Potwierdź obecność (kworum)" },
  ], [canConfirm]);
  return (
    <div className="grid grid-cols-1 gap-3">
      <button
        disabled={pending || confirmed}
        onClick={onCast}
        className="btn btn-yes btn-xl"
        style={{
          outline: confirmed ? "3px solid var(--color-ink)" : undefined,
          outlineOffset: 2,
          opacity: pending ? 0.6 : 1,
        }}
      >
        {confirmed ? "Obecność potwierdzona ✓" : "OBECNY"}
      </button>
      {confirmed && (
        <p className="text-xs text-center" style={{ color: "var(--color-ink-3)" }}>
          Twoja obecność została odnotowana. Możesz zaczekać na zakończenie głosowania.
        </p>
      )}
    </div>
  );
}

// Naprawiamy też wyświetlanie czasu w licznikach uczestnika - po przekroczeniu znak "-" włącznie z "00:00:00"

// Karta z wynikami ostatniego zamkniętego głosowania - widoczna gdy nic nie trwa
function LastResultsCard({ vote }: { vote: LastClosedVote }) {
  const myChoiceLabel = vote.type === "QUORUM" && vote.myChoice === "YES" ? "Potwierdziłeś obecność"
    : vote.myChoice === "YES" ? "Zagłosowałeś ZA"
    : vote.myChoice === "NO" ? "Zagłosowałeś PRZECIW"
    : vote.myChoice === "ABSTAIN" ? "Wstrzymałeś się"
    : null;
  return (
    <div className="card p-5">
      <div className="eyebrow mb-2">Wyniki ostatniego głosowania</div>
      <div className="mb-3">
        <div className="text-xs mono" style={{ color: "var(--color-ink-3)" }}>
          Nr {vote.number ?? "-"} - {vote.visibility === "SECRET" ? "Tajne" : "Jawne"}
        </div>
        <h3 className="text-base font-medium mt-1">{vote.title}</h3>
      </div>

      {vote.type === "STANDARD" ? (
        <div className="grid grid-cols-4 gap-2 text-center">
          <ResultCell label="ZA" value={vote.resultYes} />
          <ResultCell label="PRZECIW" value={vote.resultNo} />
          <ResultCell label="WSTRZ." value={vote.resultAbstain} />
          <ResultCell label="GŁOSOWAŁO" value={vote.resultCastCount} />
        </div>
      ) : vote.type === "QUORUM" ? (
        <div className="text-center">
          <div className="num" style={{ fontSize: 32 }}>{vote.resultCastCount}</div>
          <div className="eyebrow">obecnych</div>
        </div>
      ) : vote.type === "PACKAGE" ? (
        <PackageResultsBreakdown options={vote.options} requireAll={vote.requireAllPositions !== false} castCount={vote.resultCastCount} />
      ) : (
        // LIST - per kandydat + "głosujący" + "przeciw wszystkim"
        <ListResultsBreakdown options={vote.options} castCount={vote.resultCastCount} />
      )}

      {myChoiceLabel && (
        <p className="mt-4 text-sm font-medium text-center" style={{ color: "var(--color-ink-2)" }}>
          {myChoiceLabel}
        </p>
      )}
    </div>
  );
}

function ResultCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10 }}>{label}</div>
      <div className="num" style={{ fontSize: 22 }}>{value}</div>
    </div>
  );
}

// Wyniki pakietu u radnego: tabela pozycji z kolumnami Za/Przeciw/Wstrz.
function PackageResultsBreakdown({
  options, requireAll, castCount,
}: { options: { id: string; label: string; positionNumber?: string | null; resultYes?: number; resultNo?: number; resultAbstain?: number }[]; requireAll: boolean; castCount: number }) {
  return (
    <div>
      {requireAll && (
        <div className="text-sm mb-2" style={{ color: "var(--color-ink-2)" }}>
          Głosowało: <strong>{castCount}</strong>
        </div>
      )}
      <table style={{ width: "100%", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
            <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600 }}>Pozycja</th>
            {!requireAll && <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 600, color: "var(--color-ink-3)" }}>Gł.</th>}
            <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 600, color: "var(--color-yes)" }}>Za</th>
            <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 600, color: "var(--color-no)" }}>Prz.</th>
            <th style={{ textAlign: "center", padding: "4px 6px", fontWeight: 600, color: "var(--color-abstain)" }}>Ws.</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o, i) => {
            const y = o.resultYes ?? 0, n = o.resultNo ?? 0, a = o.resultAbstain ?? 0;
            return (
              <tr key={o.id} style={{ borderBottom: "1px solid var(--color-rule-soft)" }}>
                <td style={{ padding: "6px 0" }}>
                  <span className="mono mr-1" style={{ color: "var(--color-ink-3)" }}>{o.positionNumber ?? i + 1}.</span>{o.label}
                </td>
                {!requireAll && <td style={{ textAlign: "center", padding: "6px" }}>{y + n + a}</td>}
                <td style={{ textAlign: "center", padding: "6px", color: "var(--color-yes)", fontWeight: 600 }}>{y}</td>
                <td style={{ textAlign: "center", padding: "6px", color: "var(--color-no)", fontWeight: 600 }}>{n}</td>
                <td style={{ textAlign: "center", padding: "6px", color: "var(--color-abstain)", fontWeight: 600 }}>{a}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Wyniki dla głosowania na listę: per kandydat + osoby, które nie wybrały nikogo ("przeciw wszystkim")
function ListResultsBreakdown({
  options, castCount,
}: { options: { id: string; order: number; label: string; resultCount: number }[]; castCount: number }) {
  // "Przeciw wszystkim" - osoby które zagłosowały ale nikogo nie wybrały.
  // Heurystyka: castCount = liczba osób które oddały głos.
  // Suma resultCount przez osobę może być > liczby osób (jedna osoba może zaznaczyć wielu).
  // Liczbę osób co nic nie zaznaczyły obliczyć ciężko z tego widoku - serwer powinien to dać.
  // Na razie pokazujemy tylko per kandydat - "przeciw wszystkim" wymaga osobnego pola w API.
  const sorted = [...options].sort((a, b) => b.resultCount - a.resultCount);
  return (
    <div>
      <table style={{ width: "100%", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-rule)" }}>
            <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600 }}>Kandydat</th>
            <th style={{ textAlign: "right", padding: "4px 0", fontWeight: 600 }}>Głosów ZA</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o, i) => (
            <tr key={o.id} style={{ borderBottom: "1px solid var(--color-rule-soft)" }}>
              <td style={{ padding: "4px 0" }}>
                <span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>{i + 1}.</span>
                {o.label}
              </td>
              <td style={{ textAlign: "right", padding: "4px 0" }} className="num">{o.resultCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-xs text-center" style={{ color: "var(--color-ink-3)" }}>
        Głosowało: <span className="num">{castCount}</span>
      </div>
    </div>
  );
}


// ── Bramka PIN: klawiatura cyfrowa; poprawny PIN odblokowuje głosowanie ──
function PinGate({ voteId, onAuthorized }: { voteId: string; onAuthorized: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function press(d: string) {
    if (pin.length >= 4) return;
    setError(null);
    setPin((p) => p + d);
  }
  function backspace() { setError(null); setPin((p) => p.slice(0, -1)); }

  function submit(code: string) {
    startTransition(async () => {
      const r = await fetch(`/api/votes/${voteId}/pin-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: code }),
      });
      if (!r.ok) { setError(await r.text()); setPin(""); return; }
      onAuthorized();
    });
  }

  // auto-submit po 4 cyfrach
  if (pin.length === 4 && !pending && !error) submit(pin);

  return (
    <div className="text-center">
      <p className="text-sm mb-4" style={{ color: "var(--color-ink-2)" }}>
        Wprowadź 4-cyfrowy PIN wyświetlony na sali, aby odblokować głosowanie.
      </p>
      <div className="flex justify-center gap-3 mb-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            width: 44, height: 54, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, fontWeight: 700, border: "2px solid var(--color-rule)",
            background: pin.length > i ? "var(--color-paper-2)" : "transparent",
          }}>
            {pin.length > i ? "-" : ""}
          </div>
        ))}
      </div>
      {error && <div className="mb-3 text-sm" style={{ color: "var(--color-no)" }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 280, margin: "0 auto" }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="btn btn-lg" disabled={pending} onClick={() => press(d)} style={{ fontSize: 22, padding: "14px 0" }}>{d}</button>
        ))}
        <button type="button" className="btn btn-lg" disabled={pending} onClick={backspace} style={{ fontSize: 18, padding: "14px 0" }}>←</button>
        <button type="button" className="btn btn-lg" disabled={pending} onClick={() => press("0")} style={{ fontSize: 22, padding: "14px 0" }}>0</button>
        <button type="button" className="btn btn-lg" disabled style={{ padding: "14px 0", visibility: "hidden" }}></button>
      </div>
    </div>
  );
}

// ── Głosowanie pakietowe: dla każdej pozycji za/przeciw/wstrzym, jeden przycisk wysłania ──
function PackageBallot({
  vote, secret, onCast, onInvalid, pending,
}: {
  vote: ActiveVote;
  secret: boolean;
  onCast: (choices: { optionId: string; choice: VoteChoice }[]) => void;
  onInvalid: () => void;
  pending: boolean;
}) {
  const initial: Record<string, VoteChoice> = {};
  for (const c of vote.myPackageChoices ?? []) initial[c.optionId] = c.choice;
  const [choices, setChoices] = useState<Record<string, VoteChoice>>(initial);

  const set = (optionId: string, choice: VoteChoice) =>
    setChoices((p) => {
      // Ponowny klik w już wybraną opcję ODZNACZA ją (gdy ktoś niechcący kliknął lub nie głosuje w tej pozycji).
      if (p[optionId] === choice) {
        const next = { ...p };
        delete next[optionId];
        return next;
      }
      return { ...p, [optionId]: choice };
    });

  const requireAll = vote.requireAllPositions !== false;
  const answered = Object.keys(choices).length;
  const canSend = requireAll ? answered === vote.options.length : answered > 0;

  // Nawigacja klawiaturą: aktywna pozycja (strzałki góra/dół), Z/P/W ustawia głos aktywnej pozycji
  // i przechodzi do następnej; Enter wysyła cały pakiet.
  const [activeIdx, setActiveIdx] = useState(0);
  const setChoiceAndAdvance = (choice: VoteChoice) => {
    const o = vote.options[activeIdx];
    if (!o) return;
    set(o.id, choice);
    if (activeIdx < vote.options.length - 1) setActiveIdx((i) => i + 1);
  };
  useHotkeys([
    { key: "ArrowDown", enabled: !pending, action: () => setActiveIdx((i) => Math.min(vote.options.length - 1, i + 1)), description: "Następna pozycja" },
    { key: "ArrowUp", enabled: !pending, action: () => setActiveIdx((i) => Math.max(0, i - 1)), description: "Poprzednia pozycja" },
    { key: "z", enabled: !pending, action: () => setChoiceAndAdvance("YES"), description: "Aktywna pozycja: Za" },
    { key: "p", enabled: !pending, action: () => setChoiceAndAdvance("NO"), description: "Aktywna pozycja: Przeciw" },
    { key: "w", enabled: !pending, action: () => setChoiceAndAdvance("ABSTAIN"), description: "Aktywna pozycja: Wstrzymuję się" },
    { key: "o", enabled: !pending && canSend, action: () => onCast(Object.entries(choices).map(([optionId, choice]) => ({ optionId, choice }))), description: "Zatwierdź i wyślij pakiet" },
    { key: "Enter", enabled: !pending && canSend, action: () => onCast(Object.entries(choices).map(([optionId, choice]) => ({ optionId, choice }))), description: "Wyślij pakiet" },
  ], [pending, canSend, activeIdx, JSON.stringify(choices), vote.options.map((o) => o.id).join(",")]);

  const CHOICE_META: { key: VoteChoice; label: string; color: string; bg: string }[] = [
    { key: "YES", label: "ZA", color: "var(--color-yes)", bg: "var(--color-yes-bg)" },
    { key: "NO", label: "PRZECIW", color: "var(--color-no)", bg: "var(--color-no-bg)" },
    { key: "ABSTAIN", label: "WSTRZYMUJĘ SIĘ", color: "var(--color-abstain)", bg: "var(--color-abstain-bg)" },
  ];

  return (
    <div>
      <div className="text-xs mb-3" style={{ color: "var(--color-ink-3)" }}>
      </div>
      <div className="flex flex-col gap-4">
        {vote.options.map((o, idx) => (
          <div key={o.id} className="pb-3" style={{ borderBottom: idx < vote.options.length - 1 ? "1px solid var(--color-rule-soft)" : "none", outline: idx === activeIdx ? "2px solid var(--color-accent)" : "none", outlineOffset: 4, borderRadius: idx === activeIdx ? 4 : undefined }}>
            <div className="mb-2" style={{ fontWeight: 600 }}>
              {o.positionNumber ? `${o.positionNumber}. ` : `${idx + 1}. `}{o.label}
            </div>
            {o.description && <div className="text-sm mb-2" style={{ color: "var(--color-ink-2)" }}>{o.description}</div>}
            <div className="grid grid-cols-3 gap-2">
              {CHOICE_META.map((m) => {
                const active = choices[o.id] === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={pending}
                    onClick={() => set(o.id, m.key)}
                    className="btn"
                    style={{
                      padding: "12px 4px", fontSize: 12, fontWeight: 700,
                      border: `2px solid ${m.color}`,
                      background: active ? m.color : m.bg,
                      color: active ? "#fff" : m.color,
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary btn-lg w-full mt-5"
        disabled={pending || !canSend}
        onClick={() => onCast(Object.entries(choices).map(([optionId, choice]) => ({ optionId, choice })))}
      >
        {pending ? "Wysyłam…" : vote.alreadyVoted ? "Aktualizuj głosy" : "Zatwierdź i wyślij głosy"}
      </button>
      {!canSend && requireAll && (
        <p className="text-xs mt-2 text-center" style={{ color: "var(--color-ink-3)" }}>
          Oddaj głos na wszystkie pozycje ({answered}/{vote.options.length}).
        </p>
      )}
      {secret && (
        <button type="button" className="btn w-full mt-2" disabled={pending} onClick={onInvalid} style={{ fontSize: 12 }}>
          Obecny (głos nieważny)
        </button>
      )}
    </div>
  );
}

// Zapisy do dyskusji w wybranych punktach porządku (także nierozpoczętych),
// dla których operator włączył „Zapisy uczestników".
function SignupLists({ meetingId }: { meetingId: string }) {
  const [lists, setLists] = useState<{
    listId: string; agendaNumber: string; agendaTitle: string; agendaStatus: string;
    allowRegular: boolean; mySignedUp: boolean; waitingCount: number;
  }[]>([]);
  const [pending, startTransition] = useTransition();

  const load = () => {
    fetch(`/api/meetings/${meetingId}/signup-lists`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { lists: [] })
      .then((d) => setLists(d.lists ?? []))
      .catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  if (lists.length === 0) return null;

  function toggle(listId: string, signedUp: boolean) {
    startTransition(async () => {
      if (signedUp) {
        // wypisanie: znajdź swój wpis i wycofaj
        const r = await fetch(`/api/speakerlists/${listId}/entries?mine=1`, { method: "DELETE" });
        if (!r.ok) alert(await r.text());
      } else {
        const r = await fetch(`/api/speakerlists/${listId}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryType: "REGULAR" }),
        });
        if (!r.ok) alert(await r.text());
      }
      load();
    });
  }

  return (
    <div className="card p-5 mb-4">
      <h2 className="eyebrow mb-3">Zapisy do dyskusji</h2>
      <div className="flex flex-col gap-2">
        {lists.map((l) => (
          <div key={l.listId} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--color-rule-soft)] last:border-0">
            <div className="flex-1">
              <div className="text-sm font-medium">{l.agendaNumber}. {l.agendaTitle}</div>
              <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>
                punkt zaplanowany - zapisanych: {l.waitingCount}
              </div>
            </div>
            <button
              className={`btn ${l.mySignedUp ? "" : "btn-primary"}`}
              style={{ padding: "5px 12px", fontSize: 13 }}
              disabled={pending || !l.allowRegular}
              onClick={() => toggle(l.listId, l.mySignedUp)}
            >
              {l.mySignedUp ? "Wypisz się" : "Zapisz się"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Zawsze dostępny przycisk zgłoszenia wniosku formalnego (osobna kolejka posiedzenia).
function FormalMotionButton({ meetingId }: { meetingId: string }) {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/meetings/${meetingId}/formal-motions/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!r.ok) { setError(await r.text()); return; }
      setSubmitted(true);
    });
  }

  // Skrót: F - zgłoś wniosek formalny (duży osobny przycisk, przekazywany prowadzącemu).
  // Rozróżnienie: F = ten duży czerwony przycisk; Shift+F = wniosek formalny na liście mówców.
  useHotkeys([
    { key: "f", enabled: !pending && !submitted, action: submit, description: "Zgłoś wniosek formalny (do prowadzącego)" },
  ], [pending, submitted]);

  return (
    <div className="card p-4 mb-4" style={{ border: "1px solid rgba(200,16,46,0.35)" }}>
      {submitted ? (
        <div className="text-sm" style={{ color: "var(--color-yes)" }}>
          Zgłoszenie wniosku formalnego zostało przekazane prowadzącemu.
        </div>
      ) : (
        <>
          <button
            className="btn btn-lg w-full"
            style={{ background: "var(--color-no)", color: "#fff", fontWeight: 600 }}
            disabled={pending}
            onClick={submit}
          >
            {pending ? "Zgłaszam…" : "Zgłoś wniosek formalny"}
          </button>
          {error && <div className="text-xs mt-2" style={{ color: "var(--color-no)" }}>{error}</div>}
        </>
      )}
    </div>
  );
}

// Samodzielne potwierdzenie obecności w trakcie sprawdzenia (migawki).
// Gdy operator wyłączył samodzielne potwierdzanie, pokazujemy tylko status (bez przycisku).
function AttendanceConfirm({
  meetingId, userId, selfEnabled, myPresent, onUpdate,
}: {
  meetingId: string;
  userId: string;
  selfEnabled: boolean;
  myPresent: boolean;
  onUpdate: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const pushToast = useContext(ToastCtx);

  function confirm() {
    startTransition(async () => {
      const r = await fetch(`/api/meetings/${meetingId}/attendance-check/mark`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, present: true }),
      });
      if (!r.ok) { alert(await r.text()); return; }
      pushToast({ title: "Potwierdzono obecność", tone: "yes" });
      onUpdate();
    });
  }

  const canConfirmAtt = !pending && !myPresent && selfEnabled;
  useHotkeys([
    { key: "o", enabled: canConfirmAtt, action: confirm, description: "Potwierdź obecność" },
    { key: "Enter", enabled: canConfirmAtt, action: confirm, description: "Potwierdź obecność" },
  ], [canConfirmAtt]);

  return (
    <div className="card p-4 mb-4" style={{ border: "1px solid var(--color-seal)" }}>
      <div className="eyebrow mb-2" style={{ color: "var(--color-seal)" }}>Sprawdzenie obecności</div>
      {myPresent ? (
        <div className="text-sm" style={{ color: "var(--color-yes)" }}>Twoja obecność została potwierdzona.</div>
      ) : selfEnabled ? (
        <>
          <p className="text-sm mb-3">Trwa sprawdzenie obecności. Potwierdź swoją obecność.</p>
          <button className="btn btn-lg w-full btn-primary" disabled={pending} onClick={confirm}>
            {pending ? "Potwierdzam…" : "Potwierdzam obecność"}
          </button>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-ink-3)" }}>Trwa sprawdzenie obecności - obecność odnotowuje prowadzący.</p>
      )}
    </div>
  );
}

// Nakładka głosowań działająca PONAD wyborem posiedzenia:
// pokazuje wszystkie otwarte głosowania radnego ze wszystkich posiedzeń.
// Naraz jedno do oddania; po oddaniu przechodzi do kolejnego (także z innego posiedzenia).
function ActiveVotesOverlay({ showMeetingNames }: { showMeetingNames: boolean }) {
  const [items, setItems] = useState<{ meetingId: string; meetingName: string; meetingNumber: string; vote: ActiveVote }[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () => {
      fetch("/api/me/active-votes", { cache: "no-store" })
        .then((r) => r.ok ? r.json() : { votes: [] })
        .then((d) => { if (!stop) setItems(d.votes ?? []); })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 2000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const refresh = () => {
    fetch("/api/me/active-votes", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { votes: [] })
      .then((d) => setItems(d.votes ?? []))
      .catch(() => {});
  };

  // Które głosowania wymagają widoku nakładki:
  // - nieoddane zawsze;
  // - oddane, ale gdy "pierwszy głos ważny" WYŁĄCZONE (voteIsFinal === false) - zostają,
  //   żeby radny mógł zmienić głos aż do zamknięcia (VoteBallot pokazuje komunikat + możliwość zmiany).
  // Gdy głos finalny (voteIsFinal === true) - znika z nakładki (oddany głos widać w panelu).
  const overlayVotes = items.filter((it) => !it.vote.alreadyVoted || it.vote.voteIsFinal === false);
  if (overlayVotes.length === 0) return null;

  const multi = showMeetingNames || items.length > 1 || new Set(items.map((i) => i.meetingId)).size > 1;
  const notYet = overlayVotes.filter((it) => !it.vote.alreadyVoted);

  // Wybrane głosowanie: z ręcznego wyboru (jeśli nadal aktywne) albo pierwsze nieoddane.
  const current = overlayVotes.find((it) => it.vote.id === selectedId)
    ?? notYet[0] ?? overlayVotes[0];
  const remainingToCast = notYet.length;

  // Zminimalizowane: pasek na dole ekranu z możliwością przywrócenia.
  if (minimized) {
    return (
      <div
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100, background: "var(--color-seal)", color: "#fff", padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -4px 16px rgba(0,0,0,0.2)" }}
        onClick={() => setMinimized(false)}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          Trwa głosowanie{overlayVotes.length > 1 ? ` (${overlayVotes.length})` : ""}
          {remainingToCast > 0 ? ` - do oddania: ${remainingToCast}` : " - oddano"}
        </span>
        <span className="btn" style={{ padding: "4px 12px", fontSize: 12, background: "#fff", color: "var(--color-seal)" }}>Otwórz głosowanie</span>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--color-paper)", overflowY: "auto", padding: "20px 16px" }}>
      <div className="max-w-[720px] mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow" style={{ color: "var(--color-seal)" }}>
            {current.vote.alreadyVoted ? "Trwa głosowanie - możesz zmienić głos" : "Trwa głosowanie - oddaj głos"}
            {remainingToCast > 1 ? ` (do oddania: ${remainingToCast})` : ""}
          </div>
          <button className="btn" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => setMinimized(true)} title="Zwiń - wrócisz do panelu, głosowanie zostaje dostępne na pasku">
            Zwiń ▾
          </button>
        </div>

        {/* Przełącznik między trwającymi głosowaniami (gdy jest ich kilka naraz) */}
        {overlayVotes.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {overlayVotes.map((it) => {
              const isCur = it.vote.id === current.vote.id;
              return (
                <button
                  key={it.vote.id}
                  className="pill"
                  style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer",
                    background: isCur ? "var(--color-ink)" : undefined, color: isCur ? "var(--color-paper)" : undefined, borderColor: isCur ? "var(--color-ink)" : undefined }}
                  onClick={() => setSelectedId(it.vote.id)}
                >
                  {multi ? `nr ${it.meetingNumber}: ` : ""}{it.vote.title.length > 24 ? it.vote.title.slice(0, 24) + "…" : it.vote.title}
                  {it.vote.alreadyVoted ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        )}

        {multi && (
          <div className="mb-3" style={{ fontSize: 14, fontWeight: 600 }}>
            Posiedzenie nr {current.meetingNumber} - {current.meetingName}
          </div>
        )}
        <VoteBallot key={current.vote.id} vote={current.vote} onCast={refresh} />
      </div>
    </div>
  );
}

// Etykieta oddanego głosu radnego (do komunikatu przy głosowaniu jawnym niefinalnym).
function myVoteLabel(v: ActiveVote): string | null {
  if (v.type === "STANDARD" || v.type === "QUORUM") {
    return v.myChoice === "YES" ? "ZA" : v.myChoice === "NO" ? "PRZECIW" : v.myChoice === "ABSTAIN" ? "WSTRZYMUJĘ SIĘ" : null;
  }
  if (v.type === "LIST") {
    const labels = v.options.filter((o) => v.mySelectedOptionIds.includes(o.id)).map((o) => o.label);
    return labels.length ? labels.join(", ") : "brak wskazań";
  }
  return null; // pakiet - zbyt złożone na jedną etykietę; VoteBallot pokazuje szczegóły
}

// Kolejka wniosków formalnych - widoczna dla WSZYSTKICH radnych. Przewodniczący steruje
// (udziel głosu / zakończ / ±30s / limit przed udzieleniem) - te same przyciski co ma operator.
function FormalMotionsQueue({ formalMotions, isChairperson, pending, onUpdate }: {
  formalMotions: FormalMotionsInfo;
  isChairperson: boolean;
  pending: boolean;
  onUpdate: () => void;
}) {
  const speaking = formalMotions.entries.find((e) => e.status === "SPEAKING") ?? null;
  const waiting = formalMotions.entries.filter((e) => e.status === "WAITING");

  const act = async (url: string, method = "POST", body?: object) => {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) alert(await r.text());
    onUpdate();
  };

  return (
    <div className="card mb-6" style={{ borderColor: "var(--color-abstain)", borderWidth: 1, borderStyle: "solid" }}>
      <div className="px-4 py-3 border-b border-[var(--color-rule-soft)]">
        <span className="eyebrow" style={{ color: "var(--color-abstain)" }}>Wnioski formalne</span>
      </div>

      {speaking && (
        <div className="px-4 py-3 border-b flex items-start justify-between gap-3" style={{ background: "var(--color-abstain-bg)", borderColor: "var(--color-abstain)" }}>
          <div>
            <div className="text-xs eyebrow" style={{ color: "var(--color-abstain)" }}>Trwa wniosek</div>
            <div className="text-sm mt-1 font-medium">{speaking.userName}{speaking.groupShort ? ` (${speaking.groupShort})` : ""}</div>
            {isChairperson && (
              <div className="flex gap-1 mt-2">
                <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => act(`/api/speaker-entries/${speaking.id}`, "PATCH", { addSeconds: -30 })}>−30s</button>
                <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => act(`/api/speaker-entries/${speaking.id}`, "PATCH", { addSeconds: 30 })}>+30s</button>
                <button className="btn btn-primary" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => act(`/api/speaker-entries/${speaking.id}/end`)}>Zakończ</button>
              </div>
            )}
          </div>
          <ParticipantSpeakerTimer entry={{ ...speaking, entryType: "FORMAL_MOTION", userName: speaking.userName } as unknown as SpeakerEntry} />
        </div>
      )}

      {waiting.length === 0 && !speaking ? (
        <div className="px-4 py-4 text-sm" style={{ color: "var(--color-ink-3)" }}>Brak wniosków.</div>
      ) : (
        <ol className="divide-y divide-[var(--color-rule-soft)]">
          {waiting.map((e, idx) => (
            <li key={e.id} className={`px-4 py-2 flex items-center gap-2 text-sm ${e.isMe ? "font-semibold" : ""}`}>
              <span className="mono text-xs w-6 text-right shrink-0" style={{ color: "var(--color-ink-3)" }}>{idx + 1}.</span>
              <span className="flex-1 truncate">{e.userName}{e.isMe && " (Ty)"}{e.groupShort ? ` (${e.groupShort})` : ""}</span>
              {isChairperson && (
                <>
                  <input
                    type="text"
                    defaultValue={e.timeLimitSec ? String(e.timeLimitSec) : ""}
                    placeholder="s"
                    title="Limit (sekundy) przed udzieleniem głosu"
                    style={{ width: 44, fontSize: 11, padding: "2px 4px", border: "1px solid var(--color-rule)", borderRadius: 4, textAlign: "center" }}
                    onBlur={(ev) => {
                      const s = parseInt(ev.target.value, 10);
                      const sec = Number.isFinite(s) && s > 0 ? s : null;
                      if (sec !== (e.timeLimitSec ?? null)) act(`/api/speaker-entries/${e.id}`, "PATCH", { timeLimitSec: sec });
                    }}
                    onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                  />
                  <button className="btn btn-primary shrink-0" style={{ padding: "2px 8px", fontSize: 10 }} disabled={!!speaking} onClick={() => act(`/api/speaker-entries/${e.id}/start`)} title="Udziel głosu">
                    Udziel
                  </button>
                </>
              )}
              {/* Radny może wycofać SWÓJ wniosek formalny z kolejki. */}
              {e.isMe && (
                <button
                  className="btn shrink-0"
                  style={{ padding: "2px 8px", fontSize: 10, color: "var(--color-no)", borderColor: "var(--color-no)" }}
                  onClick={() => { if (window.confirm("Wycofać swój wniosek formalny?")) act(`/api/speaker-entries/${e.id}`, "DELETE"); }}
                  title="Wycofaj swój wniosek"
                >
                  ✕ Wycofaj
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
