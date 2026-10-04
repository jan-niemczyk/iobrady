"use client";

import { useEffect, useState, useTransition, createContext, useContext, useCallback, useRef } from "react";
import { useHotkeys } from "@/lib/useHotkeys";
import { VoteErrorBoundary } from "./VoteErrorBoundary";
import { ask, notify, notifyFailure, readUserError } from "@/lib/feedback";
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
  currentAgendaItem: { number: string; title: string; attachments?: AgendaAttachment[] } | null;
  openMeetings?: { meetingId: string; name: string; number: string; hasVotingRight: boolean }[];
}

/** Załącznik bieżącego punktu (widoczny dla uczestników) - pobierany przez /api/attachments/[id]/download. */
interface AgendaAttachment { id: string; fileName: string; mimeType: string; sizeBytes: number }

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

/** Tryb kotarkowy: stan udziału radnego (bez treści głosu) - z serwera, odtwarzany po odświeżeniu. */
interface BoothInfo {
  voteId: string;
  title: string;
  /** czy ta osoba w ogóle głosuje (prawo głosu, obecność, brak wyłączenia) */
  canVote: boolean;
  /** karta udostępniona TEJ osobie, głos jeszcze nieprzyjęty */
  granted: boolean;
  /** głos przyjęty */
  voted: boolean;
  /** czy ktokolwiek ma teraz kartę (do ostrzeżenia przewodniczącego przy zamknięciu) */
  busy: boolean;
}

interface SessionResponse extends Omit<InitialState, never> {
  activeVote: ActiveVote | null;
  booth?: BoothInfo | null;
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
  // Tryb kotarkowy: po przyjęciu głosu pokazujemy wyłącznie "Głos został przyjęty." - bez
  // dodatkowego dymka karty "Oddano głos" (karta wysyła go sama; tu go pomijamy).
  const boothActiveRef = useRef(false);
  const pushToast = useCallback((t: Omit<ToastItem, "id">) => {
    if (boothActiveRef.current && t.title === "Oddano głos") return;
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

  const isPresent = state.attendance === "PRESENT";
  const quorumActive = !!state.activeVote && state.activeVote.type === "QUORUM";
  // Nieobecni (poza aktywnym głosowaniem kworum) nie widzą nic poza statusem obecności.
  const notPresent = !isPresent && !quorumActive;
  // Trwa głosowanie (także kotarkowe, gdy karta nie jest udostępniona tej osobie).
  const voteInProgress = !!state.activeVote || !!state.booth;
  boothActiveRef.current = !!state.booth;

  async function chairCloseVote(voteId: string, boothBusy: boolean) {
    const ok = await ask({
      title: "Zamknąć głosowanie i policzyć wynik?",
      message: boothBusy ? "Karta do głosowania jest nadal udostępniona osobie za kotarką, a jej głos nie został przyjęty. Zamknięcie unieważni udostępnienie." : undefined,
      confirmLabel: "Zamknij głosowanie",
      danger: boothBusy,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        const r = await fetch(`/api/votes/${voteId}/close`, { method: "POST" });
        if (!r.ok) await notifyFailure(r);
        else notify.success("Głosowanie zostało zakończone.");
      } catch (e) { await notifyFailure(e); }
      refetch();
    });
  }

  return (
    <ToastCtx.Provider value={pushToast}>
    <div className="pt-page pt-session">
      {/* Na telefonie opakowania .pt-col mają display: contents - układ i kolejność bez zmian.
          Na szerokich ekranach: nagłówek u góry, kolumna główna i kolumna zgłoszeń obok siebie. */}
      <div className="pt-col pt-head">
      <header className="pt-page-header">
        <div className="pt-kicker">Posiedzenie nr <span className="num">{state.meetingNumber}</span></div>
        <h1 className="pt-h1">{state.meetingName}</h1>
        <div className="pt-meta-row">
          <span className="flex items-center gap-2 min-w-0">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-yes)", display: "inline-block", flexShrink: 0 }} />
            <span className="min-w-0">Zalogowano jako <strong>{state.userName}</strong></span>
          </span>
          <span className="pt-btn-group">
            {state.canUseMiniDisplay && (
              <a href="/session/mini" target="_blank" rel="noopener" className="pt-btn pt-btn-sm" title="Otwórz wąski widok 'wyświetlacz' (do nałożenia na stream/prezentację)">
                Otwórz wyświetlacz
              </a>
            )}
            <a href="/account" className="pt-btn pt-btn-sm">Zmień hasło</a>
          </span>
        </div>
      </header>

      {state.openMeetings && state.openMeetings.length > 1 && (
        <section>
          <div className="pt-label mb-2">Twoje otwarte posiedzenia ({state.openMeetings.length})</div>
          <div className="flex flex-wrap gap-2">
            {state.openMeetings.map((m) => {
              const isCurrent = m.meetingId === state.meetingId;
              return (
                <a
                  key={m.meetingId}
                  href={`/session?m=${m.meetingId}`}
                  className="pt-chip"
                  aria-current={isCurrent ? "true" : undefined}
                  title={m.hasVotingRight ? "Masz prawo głosu" : "Bez prawa głosu"}
                >
                  Nr {m.number} - {m.name}{!m.hasVotingRight && " (bez prawa)"}
                </a>
              );
            })}
          </div>
        </section>
      )}

      <div className="pt-stats">
        <div className="pt-stat">
          <div className="pt-label">Status</div>
          <div className="pt-stat-value">
            {state.hasVotingRight ? "Z prawem głosu" : state.isInvitedGuest ? "Gość" : "Bez prawa głosu"}
          </div>
        </div>
        <div className={`pt-stat${state.attendance === "PRESENT" ? " pt-stat-ok" : ""}`}>
          <div className="pt-label">Obecność</div>
          <div className="pt-stat-value">
            {state.attendance === "PRESENT" ? "Potwierdzona ✓" : "Nie potwierdzona"}
          </div>
        </div>
      </div>
      </div>

      <div className="pt-col pt-col-main">

      {/* Tryb kotarkowy: stan radnego na samej górze - na telefonie widoczny bez przewijania. */}
      {state.booth && !notPresent && (
        <BoothStatusPanel
          booth={state.booth}
          isChairperson={!!state.isChairperson}
          pending={pending}
          onClose={() => chairCloseVote(state.booth!.voteId, state.booth!.busy)}
        />
      )}

      {state.currentAgendaItem && (
        <section className="pt-panel">
          <div className="pt-panel-body">
            <div className="pt-label mb-1">Rozpatrywany punkt</div>
            <div className="flex items-baseline gap-3">
              <span className="num pt-muted" style={{ fontSize: 15 }}>{state.currentAgendaItem.number}</span>
              <span style={{ fontSize: 19, lineHeight: 1.3, fontWeight: 500 }}>{state.currentAgendaItem.title}</span>
            </div>
            {(state.currentAgendaItem.attachments?.length ?? 0) > 0 && (
              <ItemAttachments attachments={state.currentAgendaItem.attachments!} />
            )}
          </div>
        </section>
      )}

      <div>
        <a href={`/session/archive/${state.meetingId}`} className="pt-btn pt-btn-sm">
          Pełny porządek obrad, materiały i wyniki głosowań
        </a>
      </div>

      {/* KOMUNIKATY OPERATORA */}
      {state.messages && state.messages.length > 0 && (
        <section className="pt-panel pt-panel-accent pt-shrink" aria-label="Komunikaty operatora">
          <div className="pt-panel-head">
            <h2 className="pt-panel-title" style={{ color: "var(--color-seal)" }}>
              Komunikaty operatora ({state.messages.length})
            </h2>
          </div>
          <ul className="pt-list pt-scroll" aria-label="Lista komunikatów">
            {state.messages.map((m) => (
              <li key={m.id} style={{ alignItems: "flex-start" }}>
                <span className="num pt-muted shrink-0" style={{ fontSize: 13, paddingTop: 2 }}>
                  {new Date(m.publishedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="pt-grow">{m.content}</span>
              </li>
            ))}
          </ul>
        </section>
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
      {/* Granica błędów: zerwane połączenie przy wysyłaniu głosu nie wywraca strony,
          a stan głosu jest pobierany ponownie z serwera (bez fałszywego potwierdzenia). */}
      <VoteErrorBoundary fullScreen onRecover={refetch}>
        <ActiveVotesOverlay showMeetingNames={(state.openMeetings?.length ?? 0) > 1} />
      </VoteErrorBoundary>

      {notPresent ? (
        <div className="pt-panel">
          <div className="pt-panel-body pt-text-sm pt-muted">
            Nie potwierdzono obecności. Poczekaj na sprawdzenie obecności przez prowadzącego - do tego czasu nie możesz głosować ani zapisywać się do dyskusji.
          </div>
        </div>
      ) : state.booth ? (
        null /* panel kotarkowy jest na górze kolumny */
      ) : state.activeVote ? (
        <div className="pt-panel">
          <div className="pt-panel-body">
            <p className="pt-text-sm pt-muted" style={{ margin: 0 }}>Trwa głosowanie.</p>
            {state.isChairperson && (
              <button
                className="pt-btn pt-btn-sm pt-btn-outline-danger mt-3"
                disabled={pending}
                onClick={() => chairCloseVote(state.activeVote!.id, false)}
              >
                Zamknij głosowanie
              </button>
            )}
          </div>
        </div>
      ) : state.lastClosedVote ? (
        <LastResultsCard vote={state.lastClosedVote} />
      ) : (
        <div className="pt-panel">
          <div className="pt-panel-body pt-text-sm pt-muted">
            {state.hasVotingRight
              ? "Czekaj na otwarcie głosowania przez operatora."
              : "Uczestniczysz w posiedzeniu bez prawa głosu."}
          </div>
        </div>
      )}
      </div>

      {/* Poza głosowaniem: wniosek, lista mówców, zapisy - tylko dla obecnych, POD głosowaniem (D3). */}
      <div className="pt-col pt-col-side">
        {!notPresent && !voteInProgress && isPresent && (
          <>
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
          </>
        )}
      </div>
    </div>
    <ToastHost toasts={toasts} />
    </ToastCtx.Provider>
  );
}

// Załączniki rozpatrywanego punktu - bezpośrednio pod jego nazwą. Pobieranie istniejącą drogą
// (/api/attachments/[id]/download - te same uprawnienia co w porządku obrad).
function fileKind(a: AgendaAttachment): string {
  const ext = a.fileName.includes(".") ? a.fileName.split(".").pop()!.toUpperCase() : "";
  if (ext && ext.length <= 5) return ext;
  if (a.mimeType === "application/pdf") return "PDF";
  return "PLIK";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function ItemAttachments({ attachments }: { attachments: AgendaAttachment[] }) {
  return (
    <ul className="pt-files" aria-label="Załączniki do punktu">
      {attachments.map((a) => (
        <li key={a.id}>
          <a href={`/api/attachments/${a.id}/download`} className="pt-file" title={`Pobierz: ${a.fileName}`}>
            <svg className="pt-file-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
            <span className="pt-file-name">{a.fileName}</span>
            <span className="pt-file-meta">{fileKind(a)}, {formatFileSize(a.sizeBytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// Tryb kotarkowy - ekrany wokół karty (sama karta pokazuje się w nakładce głosowań, gdy
// operator udostępni ją tej osobie). Treść głosu nigdy nie jest tu pokazywana.
function BoothStatusPanel({ booth, isChairperson, pending, onClose }: {
  booth: BoothInfo; isChairperson: boolean; pending: boolean; onClose: () => void;
}) {
  return (
    <section className="pt-panel" aria-label="Głosowanie tajne w trybie kotarkowym">
      <div className="pt-panel-body pt-booth" role="status" aria-live="polite">
        {booth.voted ? (
          <p className="pt-booth-msg">Głos został przyjęty.</p>
        ) : (
          <>
            <div className="pt-label">Głosowanie tajne</div>
            <div className="pt-booth-title">{booth.title}</div>
            {!booth.canVote ? (
              <p className="pt-booth-sub">Trwa głosowanie w trybie kotarkowym.</p>
            ) : booth.granted ? (
              <p className="pt-booth-msg">Karta do głosowania jest udostępniona.</p>
            ) : (
              <p className="pt-booth-msg">Poczekaj na wywołanie i udostępnienie głosowania</p>
            )}
          </>
        )}
        {isChairperson && (
          <button className="pt-btn pt-btn-sm pt-btn-outline-danger mt-3" disabled={pending} onClick={onClose}>
            Zamknij głosowanie
          </button>
        )}
      </div>
    </section>
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
  const buttons: { choice: VoteChoice; label: string; cls: string }[] = [
    { choice: "YES", label: "Za", cls: "btn-yes" },
    { choice: "NO", label: "Przeciw", cls: "btn-no" },
    { choice: "ABSTAIN", label: "Wstrzymuję się", cls: "btn-abstain" },
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
            {b.label}{isMine && " ✓"}
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
    if (!r.ok) await notifyFailure(r);
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
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Zapis został dodany.");
    onUpdate();
  }

  async function withdraw(entryId: string) {
    if (!(await ask({ title: "Wycofać ten zapis?", confirmLabel: "Wycofaj", danger: true }))) return;
    setSigningUp(true);
    const r = await fetch(`/api/speaker-entries/${entryId}/withdraw`, { method: "POST" });
    setSigningUp(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Zapis został wycofany.");
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

  const busy = pending || signingUp;
  return (
    <section className="pt-panel pt-shrink pt-grow-panel">
      <div className="pt-panel-head">
        <h2 className="pt-panel-title">Lista mówców</h2>
        {isChairperson && (
          <button
            className="pt-btn pt-btn-sm"
            onClick={() => chairAct(`/api/speakerlists/${speakerList.id}`, "PATCH", { selfSignupEnabled: !speakerList.selfSignupEnabled })}
            title={speakerList.selfSignupEnabled ? "Zamknij zapisy uczestników" : "Otwórz zapisy uczestników"}
          >
            {speakerList.selfSignupEnabled ? "Zamknij zapisy" : "Otwórz zapisy"}
          </button>
        )}
      </div>
      {speakerList.selfSignupEnabled && (
        <div className="pt-panel-body pt-btn-group pt-signup-btns" style={{ borderBottom: "1px solid var(--color-rule-soft)" }}>
          {!myRegular ? (
            speakerList.allowRegular && (
              <>
                <button className="pt-btn pt-btn-primary pt-btn-wide" disabled={busy} onClick={() => signUp("REGULAR")}>
                  + Zapisz się
                </button>
                {hasPriorityRight && (
                  <button className="pt-btn pt-btn-outline-yes" disabled={busy} onClick={() => signUp("REGULAR", true)} title="Zgłoś się z priorytetem - wskakujesz na początek kolejki">
                    + Priorytet
                  </button>
                )}
              </>
            )
          ) : (
            <button className="pt-btn pt-btn-wide" disabled={busy} onClick={() => withdraw(myRegular.id)}>
              ✕ Wycofaj zapis
            </button>
          )}
          {!myFormal ? (
            speakerList.allowFormalMotion && (
              <button className="pt-btn pt-btn-outline-warn" disabled={busy} onClick={() => signUp("FORMAL_MOTION")} title="Wniosek formalny - najwyższy priorytet">
                + Wniosek formalny
              </button>
            )
          ) : (
            <button className="pt-btn" disabled={busy} onClick={() => withdraw(myFormal.id)}>
              ✕ Wycofaj wniosek
            </button>
          )}
          {!myAdVocem ? (
            speakerList.allowAdVocem && (
              <button className="pt-btn pt-btn-outline-danger" disabled={busy} onClick={() => signUp("AD_VOCEM")} title="Ad vocem">
                + Ad vocem
              </button>
            )
          ) : (
            <button className="pt-btn" disabled={busy} onClick={() => withdraw(myAdVocem.id)}>
              ✕ Wycofaj ad vocem
            </button>
          )}
        </div>
      )}

      {speaking && (
        <div className="pt-speaking">
          <div className="min-w-0">
            <div className="pt-label" style={{ color: "var(--color-no)" }}>Przemawia</div>
            <div className="pt-speaking-name" style={{ fontWeight: speaking.isMe ? 700 : 600 }}>
              {speaking.userName}{speaking.isMe && " (Ty)"}
            </div>
            {isChairperson && (
              <div className="pt-btn-group mt-2">
                <button className="pt-btn pt-btn-sm" onClick={() => chairAct(`/api/speaker-entries/${speaking.id}`, "PATCH", { addSeconds: -30 })}>−30 s</button>
                <button className="pt-btn pt-btn-sm" onClick={() => chairAct(`/api/speaker-entries/${speaking.id}`, "PATCH", { addSeconds: 30 })}>+30 s</button>
                <button className="pt-btn pt-btn-sm pt-btn-primary" onClick={() => chairAct(`/api/speaker-entries/${speaking.id}/end`)}>Zakończ</button>
              </div>
            )}
          </div>
          <ParticipantSpeakerTimer entry={speaking} />
        </div>
      )}

      {waiting.length === 0 && !speaking ? (
        <div className="pt-empty">Brak zgłoszeń.</div>
      ) : waiting.length > 0 && (
        <ol className={`pt-list pt-scroll${isChairperson ? " pt-list-wrap" : ""}`} aria-label="Kolejka mówców">
          {waiting.map((e, idx) => (
            <li key={e.id} className={e.isMe ? "pt-me" : undefined}>
              <span className="pt-num">{idx + 1}.</span>
              <span className="pt-grow pt-truncate">{e.userName}{e.isMe && " (Ty)"}</span>
              {e.entryType === "FORMAL_MOTION" && <span className="pt-badge pt-badge-warn" title="Wniosek formalny">Wniosek formalny</span>}
              {e.entryType === "AD_VOCEM" && <span className="pt-badge pt-badge-no" title="Ad vocem">Ad vocem</span>}
              {isChairperson && (
                <span className="pt-row-actions">
                  <button className="pt-btn pt-btn-sm pt-btn-primary" disabled={!!speaking} onClick={() => chairAct(`/api/speaker-entries/${e.id}/start`)} title="Udziel głosu">
                    Udziel
                  </button>
                  <button className="pt-btn pt-btn-sm pt-btn-outline-danger" onClick={async () => { if (await ask({ title: "Usunąć z listy mówców?", message: `Czy na pewno chcesz usunąć ${e.userName} z listy mówców?`, confirmLabel: "Usuń", danger: true })) chairAct(`/api/speaker-entries/${e.id}`, "DELETE"); }} title="Usuń z listy">
                    Usuń
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
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
    <div className="pt-timer">
      <div className={over ? "pt-timer-over" : undefined}>{formatDuration(displaySec)}</div>
      {limit != null && (
        <div className="pt-label" style={{ marginTop: 2 }}>limit: {formatDuration(limit)}</div>
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
    <section className="pt-panel">
      <div className="pt-panel-head">
        <h2 className="pt-panel-title">Wyniki ostatniego głosowania</h2>
        <span className="pt-label">Nr {vote.number ?? "-"} - {vote.visibility === "SECRET" ? "Tajne" : "Jawne"}</span>
      </div>
      <div className="pt-panel-body">
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{vote.title}</h3>

        {vote.type === "STANDARD" ? (
          <div className="pt-results">
            <ResultCell label="Za" value={vote.resultYes} color="var(--color-yes)" />
            <ResultCell label="Przeciw" value={vote.resultNo} color="var(--color-no)" />
            <ResultCell label="Wstrz." value={vote.resultAbstain} color="var(--color-abstain)" />
            <ResultCell label="Głosowało" value={vote.resultCastCount} />
          </div>
        ) : vote.type === "QUORUM" ? (
          <div className="pt-result" style={{ textAlign: "center" }}>
            <div className="pt-result-value" style={{ fontSize: 30 }}>{vote.resultCastCount}</div>
            <div className="pt-label">obecnych</div>
          </div>
        ) : vote.type === "PACKAGE" ? (
          <PackageResultsBreakdown options={vote.options} requireAll={vote.requireAllPositions !== false} castCount={vote.resultCastCount} />
        ) : (
          // LIST - per kandydat + "głosujący" + "przeciw wszystkim"
          <ListResultsBreakdown options={vote.options} castCount={vote.resultCastCount} />
        )}

        {myChoiceLabel && (
          <p className="pt-text-sm" style={{ margin: "14px 0 0", fontWeight: 500, textAlign: "center", color: "var(--color-ink-2)" }}>
            {myChoiceLabel}
          </p>
        )}
      </div>
    </section>
  );
}

function ResultCell({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="pt-result">
      <div className="pt-label" style={color ? { color } : undefined}>{label}</div>
      <div className="pt-result-value">{value}</div>
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
        <div className="pt-text-sm mb-2" style={{ color: "var(--color-ink-2)" }}>
          Głosowało: <strong>{castCount}</strong>
        </div>
      )}
      <div className="pt-table-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th>Pozycja</th>
              {!requireAll && <th className="pt-c">Gł.</th>}
              <th className="pt-c" style={{ color: "var(--color-yes)" }}>Za</th>
              <th className="pt-c" style={{ color: "var(--color-no)" }}>Prz.</th>
              <th className="pt-c" style={{ color: "var(--color-abstain)" }}>Ws.</th>
            </tr>
          </thead>
          <tbody>
            {options.map((o, i) => {
              const y = o.resultYes ?? 0, n = o.resultNo ?? 0, a = o.resultAbstain ?? 0;
              return (
                <tr key={o.id}>
                  <td>
                    <span className="num pt-muted" style={{ marginRight: 6 }}>{o.positionNumber ?? i + 1}.</span>{o.label}
                  </td>
                  {!requireAll && <td className="pt-c num">{y + n + a}</td>}
                  <td className="pt-c num" style={{ color: "var(--color-yes)", fontWeight: 600 }}>{y}</td>
                  <td className="pt-c num" style={{ color: "var(--color-no)", fontWeight: 600 }}>{n}</td>
                  <td className="pt-c num" style={{ color: "var(--color-abstain)", fontWeight: 600 }}>{a}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Wyniki dla głosowania na listę: per kandydat + osoby, które nie wybrały nikogo ("przeciw wszystkim")
function ListResultsBreakdown({
  options, castCount,
}: { options: { id: string; order: number; label: string; resultCount: number }[]; castCount: number }) {
  // Na razie pokazujemy tylko wynik per kandydat - "przeciw wszystkim" wymaga osobnego pola w API
  // (jedna osoba może zaznaczyć wielu kandydatów, więc nie da się tego policzyć z tego widoku).
  const sorted = [...options].sort((a, b) => b.resultCount - a.resultCount);
  return (
    <div>
      <table className="pt-table">
        <thead>
          <tr>
            <th>Kandydat</th>
            <th className="pt-r">Głosów ZA</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o, i) => (
            <tr key={o.id}>
              <td>
                <span className="num pt-muted" style={{ marginRight: 8 }}>{i + 1}.</span>
                {o.label}
              </td>
              <td className="pt-r num" style={{ fontWeight: 600 }}>{o.resultCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pt-label" style={{ marginTop: 8, textAlign: "center" }}>
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
    canPriority?: boolean; myPriority?: boolean;
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

  function toggle(listId: string, signedUp: boolean, priority = false) {
    startTransition(async () => {
      if (signedUp) {
        // wypisanie: znajdź swój wpis i wycofaj
        const r = await fetch(`/api/speakerlists/${listId}/entries?mine=1`, { method: "DELETE" });
        if (!r.ok) await notifyFailure(r);
        else notify.success("Zapis został usunięty.");
      } else {
        const r = await fetch(`/api/speakerlists/${listId}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryType: "REGULAR", priority }),
        });
        if (!r.ok) await notifyFailure(r);
        else notify.success(priority ? "Zapis z priorytetem został dodany." : "Zapis został dodany.");
      }
      load();
    });
  }

  return (
    <section className="pt-panel pt-shrink">
      <div className="pt-panel-head">
        <h2 className="pt-panel-title">Zapisy do dyskusji</h2>
      </div>
      <ul className="pt-list pt-list-wrap pt-scroll" aria-label="Punkty z zapisami do dyskusji">
        {lists.map((l) => (
          <li key={l.listId}>
            <div className="pt-grow">
              <div style={{ fontWeight: 500 }}>{l.agendaNumber ? `${l.agendaNumber}. ` : ""}{l.agendaTitle}</div>
              <div className="pt-label">
                punkt zaplanowany - zapisanych: {l.waitingCount}
                {l.mySignedUp && l.myPriority ? " - Twój zapis: z priorytetem" : ""}
              </div>
            </div>
            <span className="pt-btn-group" style={{ flexShrink: 0 }}>
              {!l.mySignedUp && l.canPriority && (
                <button
                  className="pt-btn pt-btn-sm pt-btn-outline-yes"
                  disabled={pending || !l.allowRegular}
                  onClick={() => toggle(l.listId, false, true)}
                  title="Zapis z priorytetem - na początek kolejki tego punktu"
                >
                  Z priorytetem
                </button>
              )}
              <button
                className={`pt-btn pt-btn-sm${l.mySignedUp ? "" : " pt-btn-primary"}`}
                disabled={pending || !l.allowRegular}
                onClick={() => toggle(l.listId, l.mySignedUp)}
              >
                {l.mySignedUp ? "Wypisz się" : "Zapisz się"}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
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
      if (!r.ok) { setError(await readUserError(r)); return; }
      setSubmitted(true);
    });
  }

  // Skrót: F - zgłoś wniosek formalny (duży osobny przycisk, przekazywany prowadzącemu).
  // Rozróżnienie: F = ten duży czerwony przycisk; Shift+F = wniosek formalny na liście mówców.
  useHotkeys([
    { key: "f", enabled: !pending && !submitted, action: submit, description: "Zgłoś wniosek formalny (do prowadzącego)" },
  ], [pending, submitted]);

  return (
    <section className="pt-panel">
      <div className="pt-panel-body">
        {submitted ? (
          <div className="pt-text-sm" style={{ color: "var(--color-yes)", fontWeight: 500 }}>
            Zgłoszenie wniosku formalnego zostało przekazane prowadzącemu.
          </div>
        ) : (
          <>
            <button
              className="pt-btn pt-btn-lg pt-btn-block pt-btn-danger"
              disabled={pending}
              onClick={submit}
            >
              {pending ? "Zgłaszam…" : "Zgłoś wniosek formalny"}
            </button>
            {error && <div className="pt-text-sm mt-2" style={{ color: "var(--color-no)" }}>{error}</div>}
          </>
        )}
      </div>
    </section>
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
      if (!r.ok) { await notifyFailure(r); return; }
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
    <section className="pt-panel pt-panel-alert">
      <div className="pt-panel-head">
        <h2 className="pt-panel-title">Sprawdzenie obecności</h2>
      </div>
      <div className="pt-panel-body">
        {myPresent ? (
          <div className="pt-text-sm" style={{ color: "var(--color-yes)", fontWeight: 500 }}>Twoja obecność została potwierdzona.</div>
        ) : selfEnabled ? (
          <>
            <p className="pt-text-sm" style={{ margin: "0 0 12px" }}>Trwa sprawdzenie obecności. Potwierdź swoją obecność.</p>
            <button className="pt-btn pt-btn-lg pt-btn-block pt-btn-primary" disabled={pending} onClick={confirm}>
              {pending ? "Potwierdzam…" : "Potwierdzam obecność"}
            </button>
          </>
        ) : (
          <p className="pt-text-sm pt-muted" style={{ margin: 0 }}>Trwa sprawdzenie obecności - obecność odnotowuje prowadzący.</p>
        )}
      </div>
    </section>
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
    if (!r.ok) await notifyFailure(r);
    onUpdate();
  };

  return (
    <section className="pt-panel pt-panel-warn pt-shrink">
      <div className="pt-panel-head">
        <h2 className="pt-panel-title">Wnioski formalne</h2>
      </div>

      {speaking && (
        <div className="pt-speaking pt-speaking-warn">
          <div className="min-w-0">
            <div className="pt-label" style={{ color: "var(--color-abstain)" }}>Trwa wniosek</div>
            <div className="pt-speaking-name">{speaking.userName}{speaking.groupShort ? ` (${speaking.groupShort})` : ""}</div>
            {isChairperson && (
              <div className="pt-btn-group mt-2">
                <button className="pt-btn pt-btn-sm" onClick={() => act(`/api/speaker-entries/${speaking.id}`, "PATCH", { addSeconds: -30 })}>−30 s</button>
                <button className="pt-btn pt-btn-sm" onClick={() => act(`/api/speaker-entries/${speaking.id}`, "PATCH", { addSeconds: 30 })}>+30 s</button>
                <button className="pt-btn pt-btn-sm pt-btn-primary" onClick={() => act(`/api/speaker-entries/${speaking.id}/end`)}>Zakończ</button>
              </div>
            )}
          </div>
          <ParticipantSpeakerTimer entry={{ ...speaking, entryType: "FORMAL_MOTION", userName: speaking.userName } as unknown as SpeakerEntry} />
        </div>
      )}

      {waiting.length === 0 && !speaking ? (
        <div className="pt-empty">Brak wniosków.</div>
      ) : waiting.length > 0 && (
        <ol className="pt-list pt-list-wrap pt-scroll" aria-label="Kolejka wniosków formalnych">
          {waiting.map((e, idx) => (
            <li key={e.id} className={e.isMe ? "pt-me" : undefined}>
              <span className="pt-num">{idx + 1}.</span>
              <span className="pt-grow pt-truncate">{e.userName}{e.isMe && " (Ty)"}{e.groupShort ? ` (${e.groupShort})` : ""}</span>
              {(isChairperson || e.isMe) && (
                <span className="pt-row-actions">
                  {isChairperson && (
                    <>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="pt-input"
                        defaultValue={e.timeLimitSec ? String(e.timeLimitSec) : ""}
                        placeholder="s"
                        aria-label="Limit (sekundy) przed udzieleniem głosu"
                        title="Limit (sekundy) przed udzieleniem głosu"
                        onBlur={(ev) => {
                          const s = parseInt(ev.target.value, 10);
                          const sec = Number.isFinite(s) && s > 0 ? s : null;
                          if (sec !== (e.timeLimitSec ?? null)) act(`/api/speaker-entries/${e.id}`, "PATCH", { timeLimitSec: sec });
                        }}
                        onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                      />
                      <button className="pt-btn pt-btn-sm pt-btn-primary" disabled={!!speaking} onClick={() => act(`/api/speaker-entries/${e.id}/start`)} title="Udziel głosu">
                        Udziel
                      </button>
                    </>
                  )}
                  {/* Radny może wycofać SWÓJ wniosek formalny z kolejki. */}
                  {e.isMe && (
                    <button
                      className="pt-btn pt-btn-sm pt-btn-outline-danger"
                      onClick={async () => { if (await ask({ title: "Wycofać swój wniosek formalny?", confirmLabel: "Wycofaj wniosek", danger: true })) act(`/api/speaker-entries/${e.id}`, "DELETE"); }}
                      title="Wycofaj swój wniosek"
                    >
                      ✕ Wycofaj
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
