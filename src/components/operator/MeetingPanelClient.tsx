"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useHotkeys } from "@/lib/useHotkeys";
import { screenUrl } from "@/lib/screenUrl";
import type { MeetingStatus, VoteStatus, VoteType, VoteVisibility, MajorityType, MajorityKind, MajorityBase, AttendanceMode, AgendaItemStatus, AttendanceStatus, SpeakerStatus, SpeakerEntryType } from "@prisma/client";
import { MEETING_STATUS_LABEL, VOTE_STATUS_LABEL, formatTime, localInputToWarsawISO } from "@/lib/labels";
import { formatMajority } from "@/lib/majority";
import type { QuorumStatus } from "@/lib/quorum";
import { SpeakersPanel } from "@/components/operator/SpeakersPanel";
import { FormalMotionsPanel } from "@/components/operator/FormalMotionsPanel";
import { DiscussionClockPanel } from "@/components/operator/DiscussionClockPanel";
import { AttendanceCheckPanel } from "@/components/operator/AttendanceCheckPanel";
import { CardHeader } from "@/components/operator/ui";
import { Modal } from "@/components/operator/Modal";
import { AgendaEditorClient } from "@/components/operator/AgendaEditorClient";
import { DisplayControlPanel } from "@/components/operator/DisplayControlPanel";
import { MeetingSettingsPanel } from "@/components/operator/MeetingSettingsPanel";
import { MeetingParticipantsLoader } from "@/components/operator/MeetingParticipantsClient";
import { AttachmentsManager } from "@/components/operator/AttachmentsManager";
import { IconClose, IconChevronDown, IconChevronRight, IconUsers } from "@/components/ui/Icon";
import { downloadReportsPdf, downloadReportsZip, downloadSignatureList, downloadAttendanceMergedList, downloadAttendanceLog, downloadCheckReportPdf } from "@/lib/generatePdf";
import { downloadAgendaPdf, downloadAgendaDocx, downloadProtocolPdf, downloadProtocolDocx, type ProtocolData } from "@/lib/generateProtocol";
import { downloadSpeechesReportPdf, downloadSpeechesReportDocx, type SpeechesReportData } from "@/lib/generateSpeechesReport";
import type { ReportData } from "@/lib/reportTypes";
import { ask, notify, notifyFailure, type ConfirmOptions, readUserError } from "@/lib/feedback";

// ─────────────────────────────────────────────────────────────────────────
//  Typy stanu
// ─────────────────────────────────────────────────────────────────────────

interface VoteOptionState {
  id: string; order: number; label: string; resultCount: number | null; positionNumber?: string | null; description?: string | null;
  packageYes?: number | null; packageNo?: number | null; packageAbstain?: number | null;
}

interface VoteState {
  id: string;
  title: string;
  createdAt?: string;
  description?: string | null;
  requireAllPositions?: boolean;
  number: number | null;
  adHoc: boolean;
  contextLabel?: string | null;
  pinRequired?: boolean;
  pinCode?: string | null;
  firstVoteFinal?: boolean | null;
  /** Tryb kotarkowy (tajne): operator udostępnia kartę pojedynczo. */
  boothMode?: boolean;
  agendaItemId: string | null;
  type: VoteType;
  visibility: VoteVisibility;
  majority: MajorityType;
  majorityKind: MajorityKind;
  majorityBase: MajorityBase;
  status: VoteStatus;
  minSelections: number | null;
  maxSelections: number | null;
  openedAt: string | null;
  closedAt: string | null;
  resultEligibleCount: number | null;
  resultPresentCount: number | null;
  resultCastCount: number | null;
  liveCastCount?: number;
  resultPassed: boolean | null;
  resultYes: number | null;
  resultNo: number | null;
  resultAbstain: number | null;
  options: VoteOptionState[];
}

export interface MeetingClientState {
  id: string;
  /** Token ekranu (SA-07) - dołączany do linków prezentacji i nakładki OBS. */
  displayToken: string | null;
  number: string;
  name: string;
  status: MeetingStatus;
  scheduledAt: string;
  openedAt: string | null;
  attendanceMode: AttendanceMode;
  attendanceOpen: boolean;
  allowFormalMotionsAnytime?: boolean;
  activeAttendanceCheckId?: string | null;
  attendanceSelfCheckEnabled?: boolean;
  currentAgendaItemId: string | null;
  settings: {
    quorumRule: string;
    quorumValue: number | null;
    autoOpenSpeakerList: boolean;
    displaySummaryAfterClose: boolean;
    agendaAutoDisplayMode: string;
    publicEnabled: boolean;
  };
  display: {
    mode: string;
    /** Plansza reprezentacyjna przykrywa prezentację (tylko tryb wyświetlania). */
    boardVisible?: boolean;
    customMessage: string | null;
    messageOnOverlay: boolean;
    pinnedVoteId: string | null;
    pinVoteId?: string | null;
    breakUntil?: string | null;
    pinnedAgendaItemId: string | null;
    showCastCount: boolean;
    showByName: boolean;
    showIndividualVotes: boolean;
    candidatePage: number;
    candidateSort: string;
  };
  agenda: { id: string; order: number; number: string; title: string; status: AgendaItemStatus; isSubItem?: boolean; unnumbered?: boolean }[];
  counts: { total: number; eligible: number; nonVoting: number; present: number; presentEligible: number; checkPresentEligible?: number | null };
  quorum: QuorumStatus;
  participants: {
    id: string;
    userId: string;
    name: string;
    hasVotingRight: boolean;
    isInvitedGuest: boolean;
    groupName: string | null;
    groupShort: string | null;
    groupColor: string | null;
    attendance: AttendanceStatus | null;
    online?: boolean;
  }[];
  votes: VoteState[];
  messages: { id: string; content: string; publishedAt: string; hidden: boolean }[];
  speakerLists?: {
    id: string;
    agendaItemId: string | null;
    selfSignupEnabled: boolean;
    allowRegular: boolean;
    allowAdVocem: boolean;
    allowFormalMotion: boolean;
    visibleToParticipants: boolean;
    defaultTimeLimitSec: number | null;
    limitEnabled: boolean;
    entries: {
      id: string;
      userId: string | null;
      userName: string;
      groupShort?: string | null;
      isGuest?: boolean;
      order: number;
      entryType: SpeakerEntryType;
      priority?: boolean;
      status: SpeakerStatus;
      timeLimitSec: number | null;
      limitEnabled: boolean;
      timeAdjustmentSec: number;
      startedAt: string | null;
      endedAt: string | null;
      consumedSec: number | null;
    }[];
  }[];
}

// ─────────────────────────────────────────────────────────────────────────
//  Główny komponent panelu
// ─────────────────────────────────────────────────────────────────────────

export function MeetingPanelClient({ initial }: { initial: MeetingClientState }) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const evtRef = useRef<EventSource | null>(null);
  const [composerMode, setComposerMode] = useState<"item" | "adhoc" | "plan" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [justClosedId, setJustClosedId] = useState<string | null>(null);
  const [resultsModal, setResultsModal] = useState<VoteState | null>(null);
  // Reasumpcja: przechowuje głosowanie, z którego kopiujemy ustawienia do nowego (ad hoc).
  const [reasumpcjaFrom, setReasumpcjaFrom] = useState<VoteState | null>(null);
  const [recomputeVote, setRecomputeVote] = useState<VoteState | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null); // id głosowania lub "all"

  async function downloadOneReport(voteId: string, voteNumber: number | null) {
    setPdfBusy(voteId);
    try {
      const r = await fetch(`/api/meetings/${state.id}/report-data?vote=${voteId}`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych raportu."); return; }
      const { reports } = await r.json() as { reports: ReportData[] };
      const mtgNo = state.number.replace(/[/\\]/g, "-");
      await downloadReportsPdf(reports, `posiedzenie-${mtgNo}-glosowanie-${voteNumber ?? voteId.slice(-6)}`);
    } catch (e) {
      void notifyFailure(e, "Nie udało się wygenerować pliku PDF. Spróbuj ponownie.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadAllReports() {
    setPdfBusy("all");
    try {
      const r = await fetch(`/api/meetings/${state.id}/report-data`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych raportów."); return; }
      const { reports } = await r.json() as { reports: ReportData[] };
      if (reports.length === 0) { notify.info("Brak zakończonych głosowań do raportu."); return; }
      await downloadReportsPdf(reports, `raporty-posiedzenie-${state.number}`);
    } catch (e) {
      void notifyFailure(e, "Nie udało się wygenerować pliku PDF. Spróbuj ponownie.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function exportProtocol(kind: "agenda-pdf" | "agenda-docx" | "protocol-pdf" | "protocol-docx") {
    setPdfBusy(kind);
    try {
      const r = await fetch(`/api/meetings/${state.id}/protocol-data`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych porządku."); return; }
      const data = await r.json() as ProtocolData;
      const base = `porzadek-${state.number}`;
      const baseP = `protokol-${state.number}`;
      if (kind === "agenda-pdf") await downloadAgendaPdf(data, base);
      else if (kind === "agenda-docx") await downloadAgendaDocx(data, base);
      else if (kind === "protocol-pdf") await downloadProtocolPdf(data, baseP);
      else await downloadProtocolDocx(data, baseP);
    } catch (e) {
      void notifyFailure(e, "Nie udało się wygenerować dokumentu. Spróbuj ponownie.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function exportSpeechesReport(kind: "pdf" | "docx") {
    setPdfBusy(`speeches-${kind}`);
    try {
      const r = await fetch(`/api/meetings/${state.id}/speeches-report`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych wystąpień."); return; }
      const data = await r.json() as SpeechesReportData;
      const base = `raport-wystapien-${state.number}`;
      if (kind === "pdf") await downloadSpeechesReportPdf(data, base);
      else await downloadSpeechesReportDocx(data, base);
    } catch (e) {
      void notifyFailure(e, "Nie udało się wygenerować dokumentu. Spróbuj ponownie.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadSignatureListPdf() {
    setPdfBusy("signature");
    try {
      const r = await fetch(`/api/meetings/${state.id}/signature-list`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych do listy podpisów."); return; }
      const data = await r.json();
      await downloadSignatureList(data, `lista-obecnosci-podpis-${state.number}`);
    } catch (e) {
      void notifyFailure(e, "Nie udało się wygenerować pliku PDF. Spróbuj ponownie.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadAttendanceMerged() {
    setPdfBusy("att-merged");
    try {
      const r = await fetch(`/api/meetings/${state.id}/attendance-log`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych obecności."); return; }
      const data = await r.json();
      await downloadAttendanceMergedList(data, `lista-obecnosci-${state.number}`);
    } catch (e) {
      void notifyFailure(e, "Nie udało się wygenerować pliku PDF. Spróbuj ponownie.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadAttendanceLogPdf() {
    setPdfBusy("att-log");
    try {
      const r = await fetch(`/api/meetings/${state.id}/attendance-log`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych obecności."); return; }
      const data = await r.json();
      await downloadAttendanceLog(data, `raport-obecnosci-${state.number}`);
    } catch (e) {
      void notifyFailure(e, "Nie udało się wygenerować pliku PDF. Spróbuj ponownie.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadCheckReport(checkId: string) {
    try {
      const r = await fetch(`/api/meetings/${state.id}/attendance-report?check=${checkId}`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych obecności."); return; }
      const { report } = await r.json();
      if (!report) { notify.info("Brak danych tego sprawdzenia."); return; }
      await downloadCheckReportPdf(report, `obecnosc-${state.number}-${checkId.slice(-6)}`);
    } catch (e) {
      void notifyFailure(e, "Nie udało się wygenerować pliku PDF. Spróbuj ponownie.");
    }
  }

  async function downloadAllReportsZip() {
    setPdfBusy("zip");
    try {
      const r = await fetch(`/api/meetings/${state.id}/report-data`);
      if (!r.ok) { notify.error("Nie udało się pobrać danych raportów."); return; }
      const { reports } = await r.json() as { reports: ReportData[] };
      if (reports.length === 0) { notify.info("Brak zakończonych głosowań do raportu."); return; }
      await downloadReportsZip(reports, `raporty-posiedzenie-${state.number}`);
    } catch (e) {
      void notifyFailure(e, "Nie udało się przygotować archiwum ZIP. Spróbuj ponownie.");
    } finally {
      setPdfBusy(null);
    }
  }
  // Punkt do którego planujemy głosowanie (gdy composerMode === "plan")
  const [planningItem, setPlanningItem] = useState<{ id: string; title: string } | null>(null);
  const [editingMeeting, setEditingMeeting] = useState(false);
  // Podgląd zapisów do przyszłego punktu (okno otwierane z porządku obrad).
  const [signupsItemId, setSignupsItemId] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/meetings/${initial.id}/stream`);
    evtRef.current = es;
    es.onmessage = () => refetch();
    // Dodatkowy polling co 5 s - by lista online odświeżała się także bez zdarzeń SSE
    // (np. gdy ktoś się wyloguje/zamknie kartę - brak eventu, a stan trzeba odświeżyć).
    const poll = setInterval(refetch, 5000);
    return () => { es.close(); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);

  async function refetch() {
    try {
      const r = await fetch(`/api/meetings/${initial.id}/state`, { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch { /* ignore */ }
  }

  // Po zamknięciu głosowania (justClosedId) pokaż wyniki w wyskakującym oknie.
  useEffect(() => {
    if (!justClosedId) return;
    const v = state.votes.find((x) => x.id === justClosedId);
    if (v && v.status !== "OPEN" && v.resultPassed !== null) {
      setResultsModal(v);
      setJustClosedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.votes, justClosedId]);

  // Wynik przypięty na prezentacji (np. przez przewodniczącego, który zamknął głosowanie z panelu radnego)
  // -> otwórz to samo okno wyników u operatora, by mógł je schować tak jak przy własnym zamknięciu.
  const prevPinnedRef = useRef<string | null>(null);
  const firstPinnedRef = useRef(true);
  useEffect(() => {
    const pinned = state.display.pinnedVoteId ?? null;
    if (firstPinnedRef.current) { firstPinnedRef.current = false; prevPinnedRef.current = pinned; return; }
    if (pinned && pinned !== prevPinnedRef.current) {
      const v = state.votes.find((x) => x.id === pinned);
      if (v && v.status !== "OPEN") setResultsModal(v);
    }
    prevPinnedRef.current = pinned;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.display.pinnedVoteId, state.votes]);

  // Wspólne wywołanie akcji: opcjonalne okno potwierdzenia, błąd jako komunikat w aplikacji,
  // opcjonalny dymek po powodzeniu. Logika samych operacji bez zmian.
  async function act(path: string, body?: Record<string, unknown>, confirm?: ConfirmOptions, method: string = "POST", success?: string) {
    if (confirm && !(await ask(confirm))) return;
    startTransition(async () => {
      try {
        const r = await fetch(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
        });
        if (!r.ok) { await notifyFailure(r); return; }
        if (success) notify.success(success);
        await refetch();
      } catch (e) {
        await notifyFailure(e);
      }
    });
  }

  /** Zmiana nazwy głosowania - dozwolona również po jego zamknięciu (edycja w modalu UI). */
  const [editVote, setEditVote] = useState<{ id: string; title: string; adHoc: boolean; context: string | null } | null>(null);
  const [editComposerVote, setEditComposerVote] = useState<VoteState | null>(null);
  function renameVote(voteId: string, currentTitle: string, adHoc?: boolean, currentContext?: string | null) {
    setEditVote({ id: voteId, title: currentTitle, adHoc: !!adHoc, context: currentContext ?? null });
  }
  function submitEditVote(title: string, context: string | null) {
    if (!editVote) return;
    const payload: Record<string, unknown> = {};
    const trimmed = title.trim();
    if (trimmed && trimmed !== editVote.title) payload.title = trimmed;
    if (editVote.adHoc) payload.contextLabel = context?.trim() || null;
    setEditVote(null);
    if (Object.keys(payload).length === 0) return;
    act(`/api/votes/${editVote.id}`, payload, undefined, "PATCH");
  }

  const live = state.status === "IN_PROGRESS" || state.status === "OPEN";
  // Dopóki posiedzenie nie zostało otwarte, pełny panel (głosowania na żywo, mówcy,
  // obecność...) nie ma jeszcze sensu - operator dostaje edytor porządku obrad i planer
  // głosowań zamiast tego, patrz PreparationView niżej.
  const isPreparation = state.status === "PREPARED" || state.status === "DRAFT";
  const currentItem = state.agenda.find((a) => a.id === state.currentAgendaItemId);
  const activeVote = state.votes.find((v) => v.status === "OPEN");

  // Skróty operatora (bezpieczne: destrukcyjne akcje wymagają potwierdzenia; skróty nie działają
  // w polach tekstowych). C - zamknij trwające głosowanie; Esc - zamknij okno wyników (odpina z
  // prezentacji i wraca do AUTO); R - rozpocznij/zakończ bieżący punkt; A - powrót prezentacji do AUTO.
  useHotkeys([
    {
      key: "c",
      enabled: !pending && !!activeVote,
      description: "Zamknij trwające głosowanie",
      action: async () => {
        if (!activeVote) return;
        if (!(await confirmCloseVote(activeVote, true))) return;
        setJustClosedId(activeVote.id); act(`/api/votes/${activeVote.id}/close`, undefined, undefined, "POST", "Głosowanie zostało zakończone.");
      },
    },
    {
      key: "Escape",
      enabled: !!resultsModal,
      description: "Zamknij komunikat wyników (ukryj z prezentacji, powrót do AUTO)",
      action: () => { act(`/api/meetings/${state.id}/display`, { displayPinnedVoteId: null, displayMode: "AUTO" }, undefined, "PATCH"); setResultsModal(null); },
    },
    {
      key: "a",
      enabled: !pending && !resultsModal,
      description: "Prezentacja: powrót do trybu automatycznego",
      action: () => act(`/api/meetings/${state.id}/display`, { displayMode: "AUTO" }, undefined, "PATCH"),
    },
    {
      key: "r",
      enabled: !pending && !!currentItem && !activeVote,
      description: "Zakończ bieżący punkt",
      action: async () => {
        if (currentItem && await ask({ title: "Zakończyć bieżący punkt?", confirmLabel: "Zakończ punkt" })) {
          act(`/api/agenda/${currentItem.id}/complete`, undefined, undefined, "POST", "Punkt został zakończony.");
        }
      },
    },
    {
      key: "n",
      enabled: !pending && !activeVote,
      description: "Otwórz następny punkt porządku",
      action: () => {
        // Następny = pierwszy oczekujący (PENDING) w kolejności, inny niż bieżący.
        const next = state.agenda.find((a) => a.status === "PENDING" && a.id !== state.currentAgendaItemId);
        if (next) act(`/api/agenda/${next.id}/start`, undefined, undefined, "POST", "Punkt został rozpoczęty.");
      },
    },
  ], [pending, activeVote?.id, resultsModal, currentItem?.id, state.id, state.agenda, state.currentAgendaItemId]);
  // wszystkie głosowania oprócz aktualnie otwartego (które jest pokazane w sekcji 'Aktywne głosowanie')
  const allVotes = state.votes.filter((v) => v.status !== "OPEN").sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  const orderOfItem = (itemId: string | null) => {
    if (!itemId) return 9999; // głosowania bez punktu (ad-hoc planowane) na końcu
    const a = state.agenda.find((x) => x.id === itemId);
    return a ? a.order : 9998;
  };
  const plannedVotes = allVotes.filter((v) => v.status === "READY").sort((a, b) => {
    const oa = orderOfItem(a.agendaItemId), ob = orderOfItem(b.agendaItemId);
    if (oa !== ob) return oa - ob;                 // najpierw wg punktu porządku
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? ""); // potem wg kolejności dodania
  });
  const doneVotes = allVotes.filter((v) => v.status !== "READY");

  // Wiersz pojedynczego głosowania (używany w sekcjach: zaplanowane / przeprowadzone)
  function voteRow(v: VoteState) {
    const isCurrentItem = v.status === "READY" && !!v.agendaItemId && v.agendaItemId === state.currentAgendaItemId;
    return (
      <li key={v.id} className={`list-group-item d-flex flex-column gap-2${isCurrentItem ? " vote-row-current" : ""}`}>
                    <div className="d-flex align-items-start gap-2 min-w-0">
                      {v.number != null && (
                        <span className="row-num mono small">#{v.number}</span>
                      )}
                      <div className="min-w-0 flex-grow-1">
                        <div className="fw-medium" style={{ overflowWrap: "anywhere" }}>
                          {isCurrentItem && <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle me-2">Bieżący punkt</span>}
                          {v.title}
                        </div>
                        {v.description && (
                          <div className="small text-body-secondary mt-1" style={{ overflowWrap: "anywhere" }}>{v.description}</div>
                        )}
                        <div className="small text-body-secondary mt-1">
                          {v.visibility === "OPEN" ? "Jawne" : "Tajne"}{v.boothMode ? " - tryb kotarkowy" : ""} - {labelForType(v.type)} - {VOTE_STATUS_LABEL[v.status]}
                          {v.status === "CLOSED" && v.type !== "LIST" && v.type !== "QUORUM" && v.type !== "PACKAGE" && (
                            <span className={`fw-semibold ${v.resultPassed ? "text-success" : "text-danger"}`}>
                              {" - "}{v.resultPassed ? "Przyjęto" : "Odrzucono"} <span className="mono">{v.resultYes}/{v.resultNo}/{v.resultAbstain}</span>
                            </span>
                          )}
                          {v.status === "CLOSED" && v.type === "PACKAGE" && (
                            <span> - {v.options.length} pozycji - {v.resultCastCount} głosujących</span>
                          )}
                          {v.status === "CLOSED" && v.type === "LIST" && (
                            <span> - {v.resultCastCount} głosujących</span>
                          )}
                          {v.status === "CLOSED" && v.type === "QUORUM" && (
                            <span className={`fw-semibold ${v.resultPassed ? "text-success" : "text-danger"}`}>
                              {" - "}{v.resultPassed ? "Kworum potwierdzone" : "Brak kworum"}
                            </span>
                          )}
                          {v.agendaItemId && (() => {
                            const a = state.agenda.find((x) => x.id === v.agendaItemId);
                            return a ? <span> - <span className="mono">Pkt {a.number}</span></span> : null;
                          })()}
                          {v.adHoc && <span> - ad hoc</span>}
                        </div>
                      </div>
                    </div>
                    <div className="d-flex flex-wrap gap-1 ps-4 ms-2">
                      {v.status === "READY" && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={pending || !!activeVote}
                          onClick={() => act(`/api/votes/${v.id}/open`, undefined, undefined, "POST", "Głosowanie zostało otwarte.")}
                          title={activeVote ? "Inne głosowanie jest w toku" : "Otwórz to głosowanie"}
                        >
                          Otwórz
                        </button>
                      )}
                      {(v.status === "CLOSED" || v.status === "INTERRUPTED") && (
                        <>
                          <button
                            className="btn btn-sm"
                            disabled={pdfBusy === v.id}
                            onClick={() => downloadOneReport(v.id, v.number)}
                            title="Pobierz raport PDF"
                          >
                            {pdfBusy === v.id ? "…" : "Raport PDF"}
                          </button>
                          <a href={`/api/votes/${v.id}/report.csv`} className="btn btn-sm" title="Pobierz CSV">
                            CSV
                          </a>
                          {v.type !== "QUORUM" && (
                            <button
                              className="btn btn-sm"
                              disabled={pending}
                              onClick={() => {
                                act(`/api/votes/${v.id}/recompute-roster`, undefined, {
                                  title: "Odświeżyć obecność w wydruku?",
                                  message: "Obecność w wydruku tego głosowania zostanie ustalona na podstawie bieżącego stanu obecności.\n\nUżyj po korekcie lub usunięciu błędnej migawki, aby ktoś obecny (a niegłosujący) nie był pokazany jako nieobecny.",
                                  confirmLabel: "Odśwież obecność",
                                }, "POST", "Obecność w wydruku została odświeżona.");
                              }}
                              title="Odśwież stan obecności w wydruku po korekcie migawki"
                            >
                              Odśwież obecność
                            </button>
                          )}
                        </>
                      )}
                      {v.status === "CLOSED" && v.type === "STANDARD" && (
                        <button
                          className="btn btn-sm"
                          disabled={pending}
                          onClick={() => setRecomputeVote(v)}
                          title="Przelicz wynik po korekcie zadeklarowanej większości"
                        >
                          Przelicz
                        </button>
                      )}
                      <button
                        className="btn btn-sm"
                        disabled={pending}
                        onClick={() => { setReasumpcjaFrom(v); setComposerMode("adhoc"); }}
                        title="Reasumpcja - utwórz nowe głosowanie z takimi samymi ustawieniami"
                      >
                        Reasumpcja
                      </button>
                      {v.status === "READY" && (
                        <button
                          className="btn btn-sm"
                          disabled={pending}
                          onClick={() => setEditComposerVote(v)}
                          title="Edytuj głosowanie przed rozpoczęciem (typ, opcje, większość, PIN)"
                        >
                          Edytuj
                        </button>
                      )}
                      <button
                        className="btn btn-sm"
                        disabled={pending}
                        onClick={() => renameVote(v.id, v.title, v.adHoc, v.contextLabel)}
                        title="Zmień nazwę głosowania (można także po zamknięciu)"
                      >
                        Zmień nazwę
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        disabled={pending}
                        onClick={() => act(`/api/votes/${v.id}`, undefined, { title: "Usunąć głosowanie?", message: `Głosowanie „${v.title}” zostanie usunięte. Tego nie można cofnąć.`, confirmLabel: "Usuń", danger: true }, "DELETE", "Głosowanie zostało usunięte.")}
                        title="Usuń głosowanie"
                      >
                        Usuń
                      </button>
                    </div>
      </li>
    );
  }

  return (
    <div className="container-fluid px-3 px-lg-4 py-4" style={{ maxWidth: 1680 }}>
      {/* HEADER */}
      <header className="page-header">
        <div className="min-w-0">
          <div className="page-kicker d-flex flex-wrap align-items-center gap-2">
            <span>Posiedzenie nr <span className="mono">{state.number}</span> - godz. {formatTime(state.scheduledAt)}</span>
            {live && <span className="badge badge-live">Na żywo</span>}
            <span className="badge text-bg-light border">{MEETING_STATUS_LABEL[state.status]}</span>
          </div>
          <h1>{state.name}</h1>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">

          {/* Raporty */}
          <div className="dropdown">
            <button className="btn dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              Raporty
            </button>
            <ul className="dropdown-menu dropdown-menu-end" style={{ minWidth: 280, maxHeight: "75vh", overflowY: "auto" }}>
              <li><a className="dropdown-item" href={screenUrl("display", state.id, state.displayToken)} target="_blank" rel="noreferrer">Widok publiczny (ekran świetlny)</a></li>
              <li><a className="dropdown-item" href={screenUrl("overlay", state.id, state.displayToken)} target="_blank" rel="noreferrer">Nakładka na transmisję (OBS)</a></li>
              <li><a className="dropdown-item" href={`/chairperson/${state.id}`} target="_blank" rel="noreferrer">Widok przewodniczącego</a></li>
              <li>
                <button
                  type="button" className="dropdown-item"
                  onClick={async () => {
                    if (await ask({
                      title: "Nowy link ekranu?",
                      message: "Dotychczasowe linki prezentacji i nakładki OBS przestaną działać. Trzeba będzie otworzyć je ponownie z nowego linku.",
                      confirmLabel: "Wygeneruj nowy link", danger: true,
                    })) act(`/api/meetings/${state.id}/display-token`, {});
                  }}
                >Nowy link ekranu (unieważnij stary)</button>
              </li>
              <li><hr className="dropdown-divider" /></li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "att-merged"} onClick={downloadAttendanceMerged}>
                  {pdfBusy === "att-merged" ? "Generowanie…" : "Lista obecności (PDF)"}
                </button>
              </li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "att-log"} onClick={downloadAttendanceLogPdf}>
                  {pdfBusy === "att-log" ? "Generowanie…" : "Raport obecności (PDF)"}
                </button>
              </li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "signature"} onClick={downloadSignatureListPdf}>
                  {pdfBusy === "signature" ? "Generowanie…" : "Lista obecności do podpisu (PDF)"}
                </button>
              </li>
              <li><h6 className="dropdown-header">Porządek i protokół</h6></li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "agenda-pdf"} onClick={() => exportProtocol("agenda-pdf")}>
                  {pdfBusy === "agenda-pdf" ? "Generowanie…" : "Porządek obrad (PDF)"}
                </button>
              </li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "agenda-docx"} onClick={() => exportProtocol("agenda-docx")}>
                  {pdfBusy === "agenda-docx" ? "Generowanie…" : "Porządek obrad (DOCX)"}
                </button>
              </li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "protocol-pdf"} onClick={() => exportProtocol("protocol-pdf")}>
                  {pdfBusy === "protocol-pdf" ? "Generowanie…" : "Protokół - projekt (PDF)"}
                </button>
              </li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "protocol-docx"} onClick={() => exportProtocol("protocol-docx")}>
                  {pdfBusy === "protocol-docx" ? "Generowanie…" : "Protokół - projekt (DOCX)"}
                </button>
              </li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "speeches-pdf"} onClick={() => exportSpeechesReport("pdf")}>
                  {pdfBusy === "speeches-pdf" ? "Generowanie…" : "Raport wystąpień (PDF)"}
                </button>
              </li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "speeches-docx"} onClick={() => exportSpeechesReport("docx")}>
                  {pdfBusy === "speeches-docx" ? "Generowanie…" : "Raport wystąpień (DOCX)"}
                </button>
              </li>
              <li><hr className="dropdown-divider" /></li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "all"} onClick={downloadAllReports}>
                  {pdfBusy === "all" ? "Generowanie…" : "Wszystkie raporty - jeden plik PDF"}
                </button>
              </li>
              <li>
                <button type="button" className="dropdown-item" disabled={pdfBusy === "zip"} onClick={downloadAllReportsZip}>
                  {pdfBusy === "zip" ? "Pakowanie…" : "Wszystkie raporty - ZIP (osobne pliki)"}
                </button>
              </li>
              <li><a className="dropdown-item" href={`/api/meetings/${state.id}/reports/attendance.csv`}>Lista obecności (CSV)</a></li>
              <li><a className="dropdown-item" href={`/api/meetings/${state.id}/reports/votes.csv`}>Zestawienie głosowań (CSV)</a></li>
              <li><a className="dropdown-item" href={`/api/audit/csv?meeting=${state.id}`}>Rejestr czynności (CSV)</a></li>
            </ul>
          </div>

          <button
            className="btn"
            disabled={pending}
            onClick={() => setEditingMeeting(true)}
            title="Edytuj nazwę / numer / datę"
          >
            Edytuj
          </button>

          {(state.status === "PREPARED" || state.status === "DRAFT") && (
            <button className="btn btn-primary" disabled={pending} onClick={() => act(`/api/meetings/${state.id}/open`)}>
              Otwórz posiedzenie
            </button>
          )}
          {state.status === "OPEN" && (
            <button className="btn btn-primary" disabled={pending} onClick={() => act(`/api/meetings/${state.id}/start`)} title="Rozpocznij obrady na żywo (status W toku)">
              Rozpocznij obrady
            </button>
          )}
          {(state.status === "OPEN" || state.status === "IN_PROGRESS") && (
            <button className="btn btn-danger" disabled={pending} onClick={() => act(`/api/meetings/${state.id}/close`, {}, { title: "Zamknąć posiedzenie?", message: "Zamknięcie można później cofnąć.", confirmLabel: "Zamknij posiedzenie", danger: true }, "POST", "Posiedzenie zostało zamknięte.")}>
              Zamknij posiedzenie
            </button>
          )}
          {state.status === "CLOSED" && (
            <button
              className="btn"
              disabled={pending}
              onClick={() => act(`/api/meetings/${state.id}/reopen`, {}, { title: "Wznowić posiedzenie?", message: "Zakończenie posiedzenia zostanie cofnięte.", confirmLabel: "Wznów posiedzenie" }, "POST", "Posiedzenie zostało wznowione.")}
            >
              Cofnij zakończenie
            </button>
          )}
          {state.status !== "OPEN" && state.status !== "IN_PROGRESS" && (
            <button
              className="btn btn-outline-danger"
              disabled={pending}
              onClick={async () => {
                if (!(await ask({ title: "Trwale usunąć posiedzenie?", message: `Posiedzenie „${state.name}” zostanie usunięte razem ze wszystkimi głosowaniami, obecnością i historią. Tej operacji NIE można cofnąć.`, confirmLabel: "Usuń posiedzenie", danger: true }))) return;
                if (!(await ask({ title: "Na pewno?", message: "To ostateczne - danych nie będzie można odzyskać.", confirmLabel: "Usuń trwale", danger: true }))) return;
                try {
                  const r = await fetch(`/api/meetings/${state.id}`, { method: "DELETE" });
                  if (r.ok) window.location.href = "/meetings";
                  else await notifyFailure(r);
                } catch (e) { await notifyFailure(e); }
              }}
            >
              Usuń trwale
            </button>
          )}
        </div>
      </header>

      {isPreparation ? (
        <PreparationView
          meetingId={state.id}
          meetingName={state.name}
          meetingNumber={state.number}
          agenda={state.agenda}
          votes={state.votes.map((v) => ({ id: v.id, title: v.title, agendaItemId: v.agendaItemId, status: v.status }))}
          onPlanVote={(item) => { setPlanningItem(item); setComposerMode("plan"); }}
          onEditVote={(voteId) => { const v = state.votes.find((x) => x.id === voteId); if (v) setEditComposerVote(v); }}
          onChanged={refetch}
        />
      ) : (
      <>
      {/* STAT ROW */}
      <section className="row g-3 mb-2">
        <StatCell label="Uczestnicy" value={state.counts.eligible} sub="z prawem głosu" />
        {state.counts.checkPresentEligible != null
          ? <StatCell label="Obecni - trwa sprawdzenie" value={state.counts.checkPresentEligible} sub={`potwierdziło z ${state.counts.eligible} uprawnionych`} />
          : <StatCell label="Obecni" value={state.counts.presentEligible} sub="z prawem głosu" />}
        <StatCell label="Online" value={state.participants.filter((p) => p.online).length} sub="połączeni" />
        <QuorumCell quorum={state.quorum} />
      </section>
      <OnlineList participants={state.participants} />

      {/* Trzy kolumny od 1200 px (środkowa - głosowanie - najszersza); węziej: głosowanie
          na całą szerokość na górze, pod nim lewa i prawa kolumna obok siebie. */}
      <div className="row g-3 align-items-start">

        {/* LEFT */}
        <div className="col-12 col-md-6 col-xl-3 d-flex flex-column gap-3">
          <div className="card">
            <SectionHeader title="Aktualny punkt" />
            <div className="card-body">
              {currentItem ? (
                <>
                  {!currentItem.unnumbered && <div className="eyebrow mb-1">Punkt <span className="mono">{currentItem.number}</span></div>}
                  <p className="fs-5 fw-medium mb-3" style={{ overflowWrap: "anywhere" }}>{currentItem.title}</p>
                  <div className="d-flex gap-2 flex-wrap">
                    <button className="btn" onClick={() => act(`/api/agenda/${currentItem.id}/complete`, undefined, undefined, "POST", "Punkt został zakończony.")}>Zakończ punkt</button>
                    <button className="btn" onClick={() => act(`/api/agenda/${currentItem.id}/pause`, undefined, { title: "Zawiesić punkt?", message: "Będzie można do niego wrócić.", confirmLabel: "Zawieś punkt" }, "POST", "Punkt został zawieszony.")}>
                      Zawieś
                    </button>
                    {state.status !== "CLOSED" && (
                      <button className="btn btn-primary" onClick={() => setComposerMode("item")} disabled={!!activeVote}>
                        + Głosowanie do tego punktu
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-body-secondary">
                  Żaden punkt nie jest rozpatrywany. Wybierz punkt z porządku obrad poniżej.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <SectionHeader
              title="Porządek obrad"
              right={
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-body-secondary">{state.agenda.length} pkt</span>
                  <a href={`/meetings/${state.id}/agenda`} className="btn btn-sm">
                    Edytuj
                  </a>
                </div>
              }
            />
            <ol className="list-group list-group-flush">
              {state.agenda.map((a) => (
                <li key={a.id} className="list-group-item">
                  {/* Numer + nazwa na całą szerokość, pod nią status i akcje */}
                  <div className="d-flex align-items-start gap-2 min-w-0">
                    <span className="row-num mono small pt-1">{a.unnumbered ? "-" : a.number}</span>
                    <div className="min-w-0 flex-grow-1">
                      <div style={{ overflowWrap: "anywhere" }}>{a.title}</div>
                      <div className="d-flex flex-wrap align-items-center gap-1 mt-2">
                    <AgendaStatusPill status={a.status} />
                    {state.status !== "CLOSED" && (() => {
                      const sl = state.speakerLists?.find((x) => x.agendaItemId === a.id);
                      const on = sl?.selfSignupEnabled ?? false;
                      return (
                        <button
                          className={`btn btn-sm${on ? " btn-outline-danger" : ""}`}
                          title={on ? "Zapisy uczestników włączone - kliknij, aby wyłączyć" : "Włącz zapisy uczestników do dyskusji w tym punkcie (także przed jego rozpoczęciem)"}
                          onClick={async () => {
                            if (sl) {
                              await fetch(`/api/speakerlists/${sl.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selfSignupEnabled: !on }) });
                            } else {
                              await fetch(`/api/agenda/${a.id}/speakerlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selfSignupEnabled: true }) });
                            }
                            refetch();
                          }}
                        >
                          {on ? "Zapisy: wł." : "Zapisy"}
                        </button>
                      );
                    })()}
                    {a.status === "PENDING" && a.id !== state.currentAgendaItemId && state.status !== "CLOSED" && (() => {
                      const sl = state.speakerLists?.find((x) => x.agendaItemId === a.id);
                      if (!sl) return null;
                      const n = sl.entries.filter((e) => e.status === "WAITING").length;
                      return (
                        <button
                          className="btn btn-sm"
                          onClick={() => setSignupsItemId(a.id)}
                          title="Podgląd zapisów do tego punktu: kolejność, usuwanie, dopisywanie"
                          aria-label={`Zapisani do punktu ${a.unnumbered ? a.title : a.number}: ${n}`}
                        >
                          Zapisani: {n}
                        </button>
                      );
                    })()}
                    {a.status !== "COMPLETED" && state.status !== "CLOSED" && (
                      <button
                        className="btn btn-sm"
                        title="Zaplanuj głosowanie do tego punktu (zapis w stanie 'Przygotowane', uruchamia ręcznie)"
                        onClick={() => {
                          setPlanningItem({ id: a.id, title: a.title });
                          setComposerMode("plan");
                        }}
                      >
                        + Głosowanie
                      </button>
                    )}
                    {a.status !== "CURRENT" && state.status !== "CLOSED" && (
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          act(`/api/agenda/${a.id}/start`, undefined,
                            a.status === "COMPLETED"
                              ? { title: "Otworzyć punkt ponownie?", message: "Punkt został już zakończony. Punkty zakończone wcześniej można zakończyć ponownie po skończeniu pracy.", confirmLabel: "Otwórz ponownie" }
                              : undefined,
                            "POST",
                            a.status === "PAUSED" ? "Punkt został wznowiony." : "Punkt został rozpoczęty.")
                        }
                      >
                        {a.status === "PAUSED" ? "Wznów" : a.status === "COMPLETED" ? "Otwórz ponownie" : "Rozpocznij"}
                      </button>
                    )}
                    {a.status !== "CURRENT" && state.status !== "CLOSED" && (
                      <button
                        className="btn btn-sm btn-outline-danger"
                        title="Usuń punkt z porządku obrad"
                        aria-label={`Usuń punkt ${a.unnumbered ? a.title : a.number}`}
                        onClick={() => act(`/api/agenda/${a.id}`, undefined, {
                          title: "Usunąć punkt?",
                          message: `Punkt „${a.title.length > 80 ? a.title.slice(0, 80) + "…" : a.title}” zostanie usunięty z porządku obrad. Głosowania tego punktu zostaną zachowane jako głosowania bez punktu.`,
                          confirmLabel: "Usuń punkt",
                          danger: true,
                        }, "DELETE", "Punkt został usunięty.")}
                      >
                        Usuń
                      </button>
                    )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* MIDDLE - głosowanie (najszersza kolumna - tu mieści się aktywny ballot/wyniki) */}
        <div className="col-12 col-xl-6 order-first order-xl-0 d-flex flex-column gap-3">
          {activeVote ? (
            <ActiveVotePanel
              vote={activeVote}
              onClose={async () => {
                if (!(await confirmCloseVote(activeVote, false))) return;
                setJustClosedId(activeVote.id); act(`/api/votes/${activeVote.id}/close`, undefined, undefined, "POST", "Głosowanie zostało zakończone.");
              }}
              onInterrupt={() => act(`/api/votes/${activeVote.id}/interrupt`, {}, { title: "Przerwać głosowanie?", confirmLabel: "Przerwij głosowanie", danger: true }, "POST", "Głosowanie zostało przerwane.")}
              onCancel={() => act(`/api/votes/${activeVote.id}/cancel`, {}, { title: "Anulować głosowanie?", message: "Wyniki zostaną odrzucone.", confirmLabel: "Anuluj głosowanie", cancelLabel: "Wróć", danger: true }, "POST", "Głosowanie zostało anulowane.")}
              pending={pending}
              participants={state.participants.map((p) => ({
                userId: p.userId, name: p.name, hasVotingRight: p.hasVotingRight, attendance: p.attendance,
              }))}
              onCastByOperator={(userId, choice) => {
                act(`/api/votes/${activeVote.id}/cast`, { onBehalfUserId: userId, choice });
              }}
              onCastListByOperator={(userId, selectedOptionIds) => {
                act(`/api/votes/${activeVote.id}/cast`, { onBehalfUserId: userId, selectedOptionIds });
              }}
              onCastPackageByOperator={(userId, packageChoices) => {
                act(`/api/votes/${activeVote.id}/cast`, { onBehalfUserId: userId, packageChoices });
              }}
              onResetByOperator={(userId) => {
                act(`/api/votes/${activeVote.id}/cast`, { onBehalfUserId: userId, reset: true });
              }}
            />
          ) : (
            <div className="card">
              <SectionHeader
                title="Głosowanie"
                right={
                  state.status !== "CLOSED" && (
                    <button
                      className="btn btn-sm"
                      onClick={() => setComposerMode("adhoc")}
                    >
                      + Nowe ad hoc
                    </button>
                  )
                }
              />
              <div className="card-body text-body-secondary">
                <p className="mb-1">Brak aktywnego głosowania.</p>
                <p className="small mb-0">
                  {currentItem
                    ? "Utwórz głosowanie do bieżącego punktu lub jako ad hoc."
                    : "Możesz utworzyć głosowanie ad hoc - niezwiązane z punktem porządku."}
                </p>
              </div>
            </div>
          )}

          <div className="card">
            <SectionHeader
              title={`Głosowania (${allVotes.length})`}
              right={state.status !== "CLOSED" && (
                <button className="btn btn-sm" onClick={() => setImportOpen(true)}>
                  Importuj z tekstu
                </button>
              )}
            />
            {allVotes.length === 0 ? (
              <div className="card-body small text-body-secondary">Brak głosowań.</div>
            ) : (
              <ul className="list-group list-group-flush overflow-y-auto" style={{ maxHeight: 640 }}>
                {plannedVotes.length > 0 && (
                  <li className="list-group-item py-1 small fw-semibold text-body-secondary bg-body-tertiary position-sticky top-0 z-1">
                    Zaplanowane ({plannedVotes.length})
                  </li>
                )}
                {plannedVotes.map((v) => voteRow(v))}
                {doneVotes.length > 0 && (
                  <li className="list-group-item py-1 small fw-semibold text-body-secondary bg-body-tertiary position-sticky top-0 z-1">
                    Przeprowadzone ({doneVotes.length})
                  </li>
                )}
                {doneVotes.map((v) => voteRow(v))}
              </ul>
            )}
          </div>

          {/* Lista mówców dla aktualnego punktu */}
          <SpeakersPanel
            agendaItemId={currentItem?.id ?? null}
            meetingId={state.id}
            list={state.speakerLists?.find((sl) => sl.agendaItemId === currentItem?.id) ?? null}
            participants={state.participants.map((p) => ({
              id: p.id, userId: p.userId, name: p.name, hasVotingRight: p.hasVotingRight,
            }))}
            onUpdate={refetch}
          />
          {state.speakerLists && (
            <FutureSignupsPanel
              agenda={state.agenda}
              speakerLists={state.speakerLists}
              currentItemId={currentItem?.id ?? null}
              act={act}
              participants={state.participants.map((p) => ({ userId: p.userId, name: p.name, hasVotingRight: p.hasVotingRight }))}
            />
          )}
          <FormalMotionsPanel
            meetingId={state.id}
            allowAnytime={state.allowFormalMotionsAnytime ?? true}
            onToggleAllow={(value) => act(`/api/meetings/${state.id}`, { allowFormalMotionsAnytime: value }, undefined, "PATCH")}
            participants={state.participants.map((p) => ({ userId: p.userId, name: p.name, hasVotingRight: p.hasVotingRight }))}
          />
          <DiscussionClockPanel meetingId={state.id} />
        </div>

        {/* RIGHT - sterowanie ekranem, obecność, komunikaty */}
        <div className="col-12 col-md-6 col-xl-3 d-flex flex-column gap-3">

          {/* Sterowanie widokiem prezentacyjnym */}
          <DisplayControlPanel
            meetingId={state.id}
            displayToken={state.displayToken}
            state={state.display}
            agenda={state.agenda}
            votes={state.votes.map(v => ({ id: v.id, number: v.number, title: v.title, status: v.status, type: v.type, optionsCount: v.options.length, pinRequired: v.pinRequired }))}
            onUpdate={refetch}
          />

          <AttendanceCheckPanel
            meetingId={state.id}
            activeCheckId={state.activeAttendanceCheckId ?? null}
            selfCheckEnabled={state.attendanceSelfCheckEnabled ?? true}
            onToggleSelfCheck={(value) => act(`/api/meetings/${state.id}`, { attendanceSelfCheckEnabled: value }, undefined, "PATCH")}
            onDownloadPdf={downloadCheckReport}
            participants={state.participants.map((p) => ({ id: p.id, userId: p.userId, name: p.name, hasVotingRight: p.hasVotingRight, groupShort: p.groupShort, present: p.attendance === "PRESENT" }))}
          />

          {/* Komunikaty */}
          <MessagesPanel meetingId={state.id} messages={state.messages} pending={pending} onPublished={refetch} />

          {/* Materiały całego posiedzenia (bez przypisania do punktu porządku) */}
          <div className="card">
            <SectionHeader title="Materiały posiedzenia" />
            <div className="card-body">
              <AttachmentsManager meetingId={state.id} />
            </div>
          </div>

          <div className="card">
            <SectionHeader title="E-mail" />
            <div className="card-body">
              <button className="btn btn-sm" onClick={() => setEmailModalOpen(true)}>Wyślij e-mail do uczestników</button>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {emailModalOpen && (
        <EmailMeetingModal
          meetingId={state.id}
          participants={state.participants.map((p) => ({ userId: p.userId, name: p.name, hasVotingRight: p.hasVotingRight }))}
          onClose={() => setEmailModalOpen(false)}
        />
      )}

      {/* Composer głosowania (modal) */}
      {resultsModal && (() => {
        // "Zamknij" chowa wynik z prezentacji (odpina). Wynik pojawił się tam automatycznie
        // po zakończeniu głosowania - operator go tu tylko zamyka/ukrywa.
        const closeResults = () => { act(`/api/meetings/${state.id}/display`, { displayPinnedVoteId: null, displayMode: "AUTO" }, undefined, "PATCH"); setResultsModal(null); };
        return (
        <Modal
          title="Wynik głosowania"
          onClose={closeResults}
          closeOnEscape={false}
          headerExtra={<span className="small text-body-secondary">nr {resultsModal.number ?? "-"}</span>}
          footer={<>
            <button
              className="btn me-auto"
              disabled={pdfBusy === resultsModal.id}
              onClick={() => downloadOneReport(resultsModal.id, resultsModal.number)}
              title="Pobierz raport PDF z tego głosowania"
            >
              {pdfBusy === resultsModal.id ? "Generowanie…" : "↓ Raport PDF"}
            </button>
            <button className="btn btn-primary" onClick={closeResults}>Zamknij (ukryj z prezentacji)</button>
          </>}
        >
              <div className="small text-body-secondary">{labelForType(resultsModal.type)}</div>
              <div className="fw-semibold mb-3" style={{ overflowWrap: "anywhere" }}>{resultsModal.title}</div>

              {resultsModal.type === "QUORUM" ? (
                <>
                  <div className="fs-5 fw-semibold mb-2">Sprawdzenie kworum</div>
                  <div>Potwierdziło obecność: <strong>{resultsModal.resultCastCount ?? 0}</strong> z {resultsModal.resultEligibleCount ?? 0} uprawnionych</div>
                </>
              ) : resultsModal.type === "LIST" ? (
                <>
                  <div className="small mb-2 text-body-secondary">Liczba głosów na kandydata:</div>
                  <ul className="list-group">
                    {[...resultsModal.options].sort((a, b) => (b.resultCount ?? 0) - (a.resultCount ?? 0)).map((o) => (
                      <li key={o.id} className="list-group-item d-flex align-items-center justify-content-between gap-2 py-1">
                        <span>{o.label}</span>
                        <span className="fw-semibold num">{o.resultCount ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : resultsModal.type === "PACKAGE" ? (
                <>
                  <div className="small mb-2 text-body-secondary">Wyniki per pozycja:</div>
                  <ul className="list-group">
                    {resultsModal.options.map((o, i) => (
                      <li key={o.id} className="list-group-item py-1">
                        <div className="fw-medium">{o.positionNumber ?? i + 1}. {o.label}</div>
                        <div className="small d-flex flex-wrap gap-3">
                          <span className="text-success">za {o.packageYes ?? 0}</span>
                          <span className="text-danger">przeciw {o.packageNo ?? 0}</span>
                          <span className="text-warning">wstrzym. {o.packageAbstain ?? 0}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  {resultsModal.resultPassed !== null && (
                    <div className={`fs-4 fw-semibold mb-2 ${resultsModal.resultPassed ? "text-success" : "text-danger"}`}>
                      {resultsModal.resultPassed ? "Przyjęto" : "Odrzucono"}
                    </div>
                  )}
                  <div className="row row-cols-3 g-0 border rounded-2 overflow-hidden text-center">
                    <div className="col py-2 border-end">
                      <div className="num fs-3 fw-semibold text-success">{resultsModal.resultYes ?? 0}</div>
                      <div className="small text-body-secondary">Za</div>
                    </div>
                    <div className="col py-2 border-end">
                      <div className="num fs-3 fw-semibold text-danger">{resultsModal.resultNo ?? 0}</div>
                      <div className="small text-body-secondary">Przeciw</div>
                    </div>
                    <div className="col py-2">
                      <div className="num fs-3 fw-semibold text-warning">{resultsModal.resultAbstain ?? 0}</div>
                      <div className="small text-body-secondary">Wstrzym.</div>
                    </div>
                  </div>
                </>
              )}

              <div className="small mt-3 text-body-secondary">
                {resultsModal.type === "QUORUM" ? "Potwierdziło" : "Głosowało"} {resultsModal.resultCastCount ?? 0} z {resultsModal.resultEligibleCount ?? 0} uprawnionych
              </div>

              {/* Przełączanie stron na PREZENTACJI - dostępne wprost w oknie wyników, bo gdy wynik
                  jest wpięty jako komunikat, strzałki panelu prezentacji bywają zasłonięte. */}
              {/* Przełączanie stron wyników na PREZENTACJI (lista i pakiet) - zawsze widoczne.
                  Strzałki zmieniają stronę o -1 / +1; prezentacja sama ogranicza numer do liczby stron. */}
              {(resultsModal.type === "LIST" || resultsModal.type === "PACKAGE") && (
                <div className="d-flex flex-wrap align-items-center justify-content-center gap-2 mt-3 pt-3 border-top">
                  <button
                    className="btn btn-sm"
                    disabled={pending || (state.display?.candidatePage ?? 0) <= 0}
                    onClick={() => act(`/api/meetings/${state.id}/display`, { displayCandidatePage: Math.max(0, (state.display?.candidatePage ?? 0) - 1) }, undefined, "PATCH")}
                  >← poprzednia strona</button>
                  <span className="small text-body-secondary">strona {(state.display?.candidatePage ?? 0) + 1}</span>
                  <button
                    className="btn btn-sm"
                    disabled={pending || (state.display?.candidatePage ?? 0) >= Math.max(0, resultsModal.options.length - 1)}
                    onClick={() => act(`/api/meetings/${state.id}/display`, { displayCandidatePage: Math.min(Math.max(0, resultsModal.options.length - 1), (state.display?.candidatePage ?? 0) + 1) }, undefined, "PATCH")}
                  >następna strona →</button>
                </div>
              )}
        </Modal>
        );
      })()}

      {importOpen && (
        <BulkImportModal
          meetingId={state.id}
          agenda={state.agenda.map((a) => ({ id: a.id, number: a.number, title: a.title }))}
          onClose={() => setImportOpen(false)}
          onDone={() => { setImportOpen(false); refetch(); }}
        />
      )}

      {composerMode && (
        <VoteComposerModal
          meetingId={state.id}
          meetingName={state.name}
          mode={composerMode}
          agendaItemId={
            composerMode === "item" ? (currentItem?.id ?? null)
            : composerMode === "plan" ? (planningItem?.id ?? null)
            : null
          }
          agendaItemTitle={
            composerMode === "item" ? currentItem?.title
            : composerMode === "plan" ? planningItem?.title
            : undefined
          }
          participants={state.participants.filter((p) => p.hasVotingRight).map((p) => ({
            id: p.id, name: p.name, groupShort: p.groupShort,
          }))}
          prefill={reasumpcjaFrom}
          onClose={() => { setComposerMode(null); setPlanningItem(null); setReasumpcjaFrom(null); }}
          onCreated={() => { setComposerMode(null); setPlanningItem(null); setReasumpcjaFrom(null); refetch(); }}
        />
      )}

      {editComposerVote && (
        <VoteComposerModal
          meetingId={state.id}
          meetingName={state.name}
          mode={editComposerVote.adHoc ? "adhoc" : "item"}
          agendaItemId={null}
          participants={state.participants.map((p) => ({ id: p.id, name: p.name, groupShort: p.groupShort ?? null }))}
          editVote={editComposerVote}
          onClose={() => setEditComposerVote(null)}
          onCreated={() => { setEditComposerVote(null); refetch(); }}
        />
      )}

      {signupsItemId && (() => {
        const item = state.agenda.find((x) => x.id === signupsItemId);
        const sl = state.speakerLists?.find((x) => x.agendaItemId === signupsItemId);
        if (!item || !sl) return null;
        return (
          <Modal
            title={`Zapisani - ${item.unnumbered ? item.title : `pkt ${item.number}. ${item.title}`}`}
            onClose={() => setSignupsItemId(null)}
          >
            <p className="small text-body-secondary">
              Kolejność, w jakiej osoby pojawią się na liście mówców po rozpoczęciu punktu (zapisy z priorytetem na początku).
              Do przyszłych punktów możliwy jest wyłącznie zwykły zapis - z priorytetem albo bez.
            </p>
            <FutureSignupList
              list={sl}
              participants={state.participants.map((p) => ({ userId: p.userId, name: p.name, hasVotingRight: p.hasVotingRight }))}
              act={act}
            />
          </Modal>
        );
      })()}

      {editVote && (
        <EditVoteModal
          initialTitle={editVote.title}
          initialContext={editVote.context}
          showContext={editVote.adHoc}
          onClose={() => setEditVote(null)}
          onSubmit={submitEditVote}
        />
      )}

      {recomputeVote && (
        <RecomputeMajorityModal
          vote={recomputeVote}
          onClose={() => setRecomputeVote(null)}
          onDone={() => { setRecomputeVote(null); refetch(); }}
        />
      )}

      {editingMeeting && (
        <EditMeetingModal
          meetingId={state.id}
          initialName={state.name}
          initialNumber={state.number}
          initialScheduledAt={state.scheduledAt}
          settings={state.settings}
          onClose={() => setEditingMeeting(false)}
          onSaved={() => { setEditingMeeting(false); refetch(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Przygotowanie posiedzenia (PREPARED/DRAFT - przed "Otwórz posiedzenie")
//  Pełny panel (głosowania na żywo, mówcy, obecność...) nie ma tu jeszcze sensu -
//  operator dostaje edytor porządku obrad i planer głosowań.
// ─────────────────────────────────────────────────────────────────────────

function PreparationView({
  meetingId, meetingName, meetingNumber, agenda, votes, onPlanVote, onEditVote, onChanged,
}: {
  meetingId: string;
  meetingName: string;
  meetingNumber: string;
  agenda: { id: string; order: number; number: string; title: string; status: AgendaItemStatus; isSubItem?: boolean; unnumbered?: boolean }[];
  votes: { id: string; title: string; agendaItemId: string | null; status: string }[];
  onPlanVote: (item: { id: string; title: string }) => void;
  onEditVote: (voteId: string) => void;
  onChanged: () => void;
}) {
  return (
    <div className="d-flex flex-column gap-4" style={{ maxWidth: 1100, marginInline: "auto" }}>
      <div className="alert alert-secondary d-flex align-items-center gap-2 mb-0">
        <span>
          Posiedzenie jeszcze nie zostało otwarte - pełny panel (głosowania na żywo, lista mówców,
          obecność) pojawi się po kliknięciu <strong>„Otwórz posiedzenie"</strong> w nagłówku.
          Teraz można przygotować porządek obrad i zaplanować głosowania - pojedyncze przyciskiem
          „+ Głosowanie” przy punkcie, a hurtowo (seryjnie) w planerze poniżej.
        </span>
      </div>
      <AgendaEditorClient
        embedded
        meetingId={meetingId}
        meetingName={meetingName}
        meetingNumber={meetingNumber}
        initialAgenda={agenda}
        initialVotes={votes}
        onPlanVote={onPlanVote}
        onEditVote={onEditVote}
      />
      <VotePlannerCard meetingId={meetingId} agenda={agenda} onCreated={onChanged} />
      <MeetingParticipantsLoader meetingId={meetingId} meetingName={meetingName} meetingNumber={meetingNumber} />
    </div>
  );
}

// Planer głosowań - hurtowe tworzenie głosowań. Dwa tryby: "Z porządku obrad" (po jednym
// głosowaniu na zaznaczony punkt, z jego nazwą - endpoint bulk-by-agenda) i "Dowolne nazwy"
// (dowolna lista tytułów, jeden na linię - endpoint bulk, ten sam co "Importuj z tekstu" w
// pełnym panelu); w trybie dowolnym głosowanie można opcjonalnie przypiąć do punktu porządku
// albo zostawić "poza porządkiem" (ad hoc, bez punktu).
function VotePlannerCard({
  meetingId, agenda, onCreated,
}: {
  meetingId: string;
  agenda: { id: string; number: string; title: string; unnumbered?: boolean }[];
  onCreated?: () => void;
}) {
  const [mode, setMode] = useState<"agenda" | "text">("agenda");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [linkAgendaItemId, setLinkAgendaItemId] = useState<string>("");
  const [voteType, setVoteType] = useState<"STANDARD" | "QUORUM">("STANDARD");
  const [visibility, setVisibility] = useState<"OPEN" | "SECRET">("OPEN");
  const [majorityKind, setMajorityKind] = useState<MajorityKind>("SIMPLE");
  const [majorityBase, setMajorityBase] = useState<MajorityBase>("OF_VOTERS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    setBusy(true); setError(null); setDone(null);
    const url = mode === "agenda" ? `/api/meetings/${meetingId}/votes/bulk-by-agenda` : `/api/meetings/${meetingId}/votes/bulk`;
    const body = mode === "agenda"
      ? { agendaItemIds: Array.from(selected), type: voteType, visibility, majorityKind, majorityBase }
      : { text, type: voteType, visibility, majorityKind, majorityBase, adHoc: linkAgendaItemId === "", agendaItemId: linkAgendaItemId || null };
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) { setError(await readUserError(r)); return; }
    setDone(mode === "agenda" ? selected.size : lines.length);
    onCreated?.();
    setSelected(new Set());
    setText("");
  }

  const count = mode === "agenda" ? selected.size : lines.length;

  return (
    <div className="card">
      <CardHeader title="Planer głosowań" />
      <div className="card-body">
        <p className="text-body-secondary small mb-3">
          Utwórz głosowania z wyprzedzeniem - zostaną zapisane jako „Przygotowane" i uruchomisz je
          ręcznie po rozpoczęciu obrad.
        </p>
        <div className="btn-group mb-3" role="group">
          <button type="button" className={`btn btn-sm ${mode === "agenda" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setMode("agenda")}>Z porządku obrad</button>
          <button type="button" className={`btn btn-sm ${mode === "text" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setMode("text")}>Dowolne nazwy</button>
        </div>
        {mode === "agenda" ? (
          agenda.length === 0 ? (
            <p className="text-body-secondary small mb-0">Dodaj najpierw punkty porządku obrad powyżej.</p>
          ) : (
            <div className="list-group mb-3" style={{ maxHeight: 260, overflowY: "auto" }}>
              {agenda.map((a) => (
                <label key={a.id} className="list-group-item list-group-item-action d-flex align-items-start gap-2">
                  <input type="checkbox" className="form-check-input flex-shrink-0" style={{ marginTop: ".2rem" }} checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                  <span className="num text-body-secondary flex-shrink-0 text-end" style={{ minWidth: "2.5rem" }}>{a.unnumbered ? "-" : `${a.number}.`}</span>
                  <span className="flex-grow-1" style={{ minWidth: 0, overflowWrap: "anywhere" }}>{a.title}</span>
                </label>
              ))}
            </div>
          )
        ) : (
          <>
            <textarea
              className="form-control mb-2"
              rows={5}
              placeholder={"Jedna linia = jedno głosowanie, dowolna nazwa, np.:\nPrzyjęcie porządku obrad\nWniosek radnego Kowalskiego o zmianę porządku"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mb-3">
              <label className="form-label">Przypisz do punktu porządku (opcjonalnie)</label>
              <select className="form-select" value={linkAgendaItemId} onChange={(e) => setLinkAgendaItemId(e.target.value)}>
                <option value="">- poza porządkiem (ad hoc) -</option>
                {agenda.map((a) => (
                  <option key={a.id} value={a.id}>{a.unnumbered ? "" : `${a.number}. `}{a.title.length > 90 ? a.title.slice(0, 90) + "…" : a.title}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="row g-3 mb-3">
          <div className="col-6 col-md-3">
            <label className="form-label">Rodzaj</label>
            <select className="form-select" value={voteType} onChange={(e) => setVoteType(e.target.value as "STANDARD" | "QUORUM")}>
              <option value="STANDARD">Zwykłe</option>
              <option value="QUORUM">Kworum</option>
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label">Jawność</label>
            <select className="form-select" value={visibility} onChange={(e) => setVisibility(e.target.value as "OPEN" | "SECRET")}>
              <option value="OPEN">Jawne</option>
              <option value="SECRET">Tajne</option>
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label">Większość</label>
            <select className="form-select" value={majorityKind} onChange={(e) => setMajorityKind(e.target.value as MajorityKind)}>
              <option value="SIMPLE">Zwykła</option>
              <option value="ABSOLUTE">Bezwzględna</option>
              <option value="QUALIFIED_TWO_THIRDS">Kwalifikowana 2/3</option>
              <option value="QUALIFIED_THREE_FIFTHS">Kwalifikowana 3/5</option>
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label">Podstawa</label>
            <select className="form-select" value={majorityBase} onChange={(e) => setMajorityBase(e.target.value as MajorityBase)} disabled={majorityKind === "SIMPLE"}>
              <option value="OF_VOTERS">Głosujących</option>
              <option value="OF_PRESENT">Obecnych</option>
              <option value="OF_FULL_BODY">Ustawowego składu</option>
            </select>
          </div>
        </div>
        {error && <div className="text-danger small mb-2">{error}</div>}
        {done != null && <div className="text-success small mb-2">Utworzono {done} głosowań.</div>}
        <button className="btn btn-primary" disabled={busy || count === 0} onClick={submit}>
          {busy ? "Tworzę…" : `Utwórz ${count || ""} głosowań`.trim()}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Aktywne głosowanie z live counterem
// ─────────────────────────────────────────────────────────────────────────

function ActiveVotePanel({
  vote, onClose, onInterrupt, onCancel, pending, participants, onCastByOperator, onCastListByOperator, onCastPackageByOperator, onResetByOperator,
}: {
  vote: VoteState;
  onClose: () => void;
  onInterrupt: () => void;
  onCancel: () => void;
  pending: boolean;
  participants: { userId: string; name: string; hasVotingRight: boolean; attendance: AttendanceStatus | null }[];
  onCastByOperator: (userId: string, choice: "YES" | "NO" | "ABSTAIN") => void;
  onCastListByOperator: (userId: string, selectedOptionIds: string[]) => void;
  onCastPackageByOperator: (userId: string, packageChoices: { optionId: string; choice: "YES" | "NO" | "ABSTAIN" }[]) => void;
  onResetByOperator: (userId: string) => void;
}) {
  const [counter, setCounter] = useState<{
    castCount: number; pendingCount: number;
    yes: number; no: number; abstain: number;
    perOption: { id: string; label: string; count: number }[];
    packageOptions?: { id: string; label: string; yes: number; no: number; abstain: number }[];
    castByUser?: Record<string, { choice: string | null; optionIds: string[] }>;
    votedUserIds?: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/votes/${vote.id}/counter`, { cache: "no-store" });
        if (r.ok && !cancelled) setCounter(await r.json());
      } catch { /* */ }
    };
    tick();
    const i = setInterval(tick, 1500);
    return () => { cancelled = true; clearInterval(i); };
  }, [vote.id]);

  const isList = vote.type === "LIST";

  const denom = vote.type === "QUORUM" ? (vote.resultEligibleCount ?? 0) : (vote.resultPresentCount ?? 0);
  const pct = counter ? Math.min(100, (counter.castCount / Math.max(1, denom)) * 100) : 0;

  return (
    <div className="card border-danger-subtle">
      <SectionHeader title="Trwa głosowanie" tone="live" />
      <div className="card-body d-flex flex-column gap-3">
        <div>
          <div className="small text-body-secondary">
            {vote.visibility === "OPEN" ? "Jawne" : "Tajne"}{vote.boothMode ? " - tryb kotarkowy" : ""} - {labelForType(vote.type)} - {formatMajority(vote.majorityKind, vote.majorityBase)}
          </div>
          <h3 className="fs-5 mb-0 mt-1" style={{ overflowWrap: "anywhere" }}>{vote.title}</h3>
        </div>

        {vote.pinRequired && vote.pinCode && (
          <div className="alert alert-info d-flex align-items-center gap-3 mb-0 py-2">
            <span className="small fw-semibold">PIN głosowania</span>
            <span className="mono fs-4 fw-bold" style={{ letterSpacing: ".2em" }}>{vote.pinCode}</span>
          </div>
        )}

        {/* Pasek postępu - ile osób zagłosowało (dla kworum: w stosunku do uprawnionych) */}
        <div>
          <div className="d-flex justify-content-between small mb-1">
            <span className="text-body-secondary">{vote.type === "QUORUM" ? "Potwierdziło obecność" : "Oddało głos"}</span>
            <span className="mono fw-semibold">
              {counter?.castCount ?? "-"}
              <span className="text-body-secondary fw-normal"> / {denom || "?"}</span>
            </span>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} style={{ height: 8 }}>
            <div className="progress-bar" style={{ width: `${pct}%`, transition: "width 300ms ease" }} />
          </div>
        </div>

        {/* Tryb kotarkowy: zamiast liczników - panel kabiny. Serwer i tak nie zwraca liczników
            do zamknięcia (przy jednej osobie w kabinie zdradzałyby jej wybór). */}
        {vote.boothMode ? (
          <BoothPanel voteId={vote.id} />
        ) : vote.type === "QUORUM" ? (
          <div className="border rounded-2 py-3 text-center">
            <div className="small text-body-secondary">Liczba potwierdzeń obecności</div>
            <div className="num fw-semibold text-success lh-1 my-1" style={{ fontSize: "2.75rem" }}>
              {counter?.castCount ?? "-"}
            </div>
            <div className="small text-body-secondary">z {vote.resultEligibleCount ?? "?"} uprawnionych</div>
          </div>
        ) : vote.visibility === "SECRET" ? (
          // Głosowanie tajne: serwer nie zwraca rozkładu głosów przed zamknięciem (także operatorowi).
          <div className="border rounded-2 py-3 px-3 text-center small text-body-secondary">
            Rozkład głosów tajnych będzie dostępny po zamknięciu głosowania.
          </div>
        ) : vote.type === "PACKAGE" ? (
          <div className="table-responsive">
            <table className="table table-bordered table-sm mb-0 align-middle">
              <thead>
                <tr className="table-light">
                  <th>Pozycja</th>
                  <th className="text-center" style={{ width: 72 }}>Za</th>
                  <th className="text-center" style={{ width: 72 }}>Przeciw</th>
                  <th className="text-center" style={{ width: 72 }}>Wstrz.</th>
                </tr>
              </thead>
              <tbody>
                {(counter?.packageOptions ?? vote.options.map((o) => ({ id: o.id, label: o.label, yes: 0, no: 0, abstain: 0 }))).map((o, i) => (
                  <PackageCounterRow key={o.id} idx={i} label={o.label} yes={counter ? o.yes : null} no={counter ? o.no : null} abstain={counter ? o.abstain : null} />
                ))}
              </tbody>
            </table>
          </div>
        ) : !isList ? (
          <div className="row row-cols-3 g-0 border rounded-2 overflow-hidden">
            <BallotCounter label="Za" color="yes" value={counter?.yes} bordered />
            <BallotCounter label="Przeciw" color="no" value={counter?.no} bordered />
            <BallotCounter label="Wstrzymał się" color="abstain" value={counter?.abstain} />
          </div>
        ) : (
          <ul className="list-group">
            {(counter?.perOption ?? vote.options.map((o) => ({ id: o.id, label: o.label, count: 0 }))).map((o, i) => (
              <li key={o.id} className="list-group-item d-flex align-items-center justify-content-between gap-2">
                <span className="min-w-0"><span className="row-num mono small me-1">{i + 1}.</span>{o.label}</span>
                <span className="num fw-semibold">{counter ? o.count : "-"}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Głosowanie w imieniu uczestnika (tylko jawne) */}
        {vote.visibility === "OPEN" && (
          <OperatorOnBehalfPanel
            vote={vote}
            participants={participants}
            onCast={onCastByOperator}
            onCastList={onCastListByOperator}
            onCastPackage={onCastPackageByOperator}
            onReset={onResetByOperator}
            castByUser={counter?.castByUser}
            pending={pending}
          />
        )}

        {/* Zerowanie głosu tajnego (zgłoszona pomyłka) - bez ujawniania treści głosu */}
        {vote.visibility === "SECRET" && vote.type !== "QUORUM" && (
          <SecretResetPanel
            participants={participants}
            votedUserIds={counter?.votedUserIds ?? []}
            onReset={onResetByOperator}
            pending={pending}
          />
        )}

        <div className="d-flex gap-2 flex-wrap pt-1">
          <button className="btn btn-primary" disabled={pending} onClick={onClose}>Zamknij głosowanie</button>
          <button className="btn" disabled={pending} onClick={onInterrupt}>Przerwij</button>
          <button className="btn btn-danger" disabled={pending} onClick={onCancel}>Anuluj</button>
        </div>
      </div>
    </div>
  );
}

function OperatorOnBehalfPanel({
  vote, participants, onCast, onCastList, onCastPackage, onReset, castByUser, pending,
}: {
  vote: VoteState;
  participants: { userId: string; name: string; hasVotingRight: boolean; attendance: AttendanceStatus | null }[];
  onCast: (userId: string, choice: "YES" | "NO" | "ABSTAIN") => void;
  onCastList: (userId: string, selectedOptionIds: string[]) => void;
  onCastPackage: (userId: string, packageChoices: { optionId: string; choice: "YES" | "NO" | "ABSTAIN" }[]) => void;
  onReset: (userId: string) => void;
  castByUser?: Record<string, { choice: string | null; optionIds: string[] }>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const eligible = participants.filter((p) => p.hasVotingRight && (vote.type === "QUORUM" || p.attendance === "PRESENT"));
  const filtered = eligible.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const isList = vote.type === "LIST";
  const isPackage = vote.type === "PACKAGE";
  const choiceLabel = (c: string | null) => c === "YES" ? "ZA" : c === "NO" ? "PRZECIW" : c === "ABSTAIN" ? "WSTRZYM." : "";

  const castCls = (c: string | null) => c === "YES" ? "text-success" : c === "NO" ? "text-danger" : "text-warning";

  return (
    <div className="border rounded-2">
      <button
        type="button"
        className="btn w-100 border-0 rounded-2 d-flex justify-content-between"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="d-inline-flex align-items-center gap-2"><IconUsers size={15} /> Oddaj głos w imieniu uczestnika</span>
        <span className="text-body-secondary">{open ? <IconChevronDown size={14} style={{ transform: "rotate(180deg)" }} /> : <IconChevronDown size={14} />}</span>
      </button>
      {open && (
        <div className="border-top p-2 bg-body-tertiary">
          <input
            className="form-control form-control-sm mb-2"
            placeholder="Wyszukaj uczestnika…"
            aria-label="Wyszukaj uczestnika"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="list-group overflow-y-auto" style={{ maxHeight: 340 }}>
            {filtered.length === 0 && (
              <div className="list-group-item small text-body-secondary">
                Brak obecnych uczestników z prawem głosu.
              </div>
            )}
            {filtered.map((p) => {
              const cast = castByUser?.[p.userId];
              return (
              <div key={p.userId} className="list-group-item">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <div className="min-w-0 flex-grow-1">
                    <div className="text-truncate" title={p.name}>{p.name}</div>
                    {cast && (
                      <div className={`small fw-semibold ${isList || isPackage ? "text-body-secondary" : castCls(cast.choice)}`}>
                        {isList ? `oddał głos (${cast.optionIds.length})` : isPackage ? "oddał głos w pakiecie" : `oddał: ${choiceLabel(cast.choice)}`}
                      </div>
                    )}
                  </div>
                  <div className="d-flex flex-wrap gap-1">
                    {vote.type === "QUORUM" ? (
                      <button type="button" className="btn btn-yes btn-sm" disabled={pending} onClick={() => onCast(p.userId, "YES")}>Obecny</button>
                    ) : isList || isPackage ? (
                      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => setExpandedUser(expandedUser === p.userId ? null : p.userId)} aria-expanded={expandedUser === p.userId}>
                        {expandedUser === p.userId ? "Zwiń" : (isPackage ? "Wybierz pozycje" : "Wybierz")}
                      </button>
                    ) : (
                      <div className="btn-group btn-group-sm" role="group" aria-label={`Głos w imieniu: ${p.name}`}>
                        <button type="button" className="btn btn-yes" disabled={pending} onClick={() => onCast(p.userId, "YES")} title="Za">Za</button>
                        <button type="button" className="btn btn-no" disabled={pending} onClick={() => onCast(p.userId, "NO")} title="Przeciw">Przeciw</button>
                        <button type="button" className="btn btn-abstain" disabled={pending} onClick={() => onCast(p.userId, "ABSTAIN")} title="Wstrzymuję się">Wstrz.</button>
                      </div>
                    )}
                    {cast && (
                      <button type="button" className="btn btn-sm btn-outline-danger" disabled={pending} onClick={async () => { if (await ask({ title: "Wyzerować głos?", message: `Oddany głos osoby ${p.name} zostanie usunięty.`, confirmLabel: "Wyzeruj głos", danger: true })) onReset(p.userId); }} title="Usuń oddany głos">Zeruj</button>
                    )}
                  </div>
                </div>
                {expandedUser === p.userId && isList && (
                  <OnBehalfListPicker vote={vote} pending={pending} onSubmit={(ids) => { onCastList(p.userId, ids); setExpandedUser(null); }} />
                )}
                {expandedUser === p.userId && isPackage && (
                  <OnBehalfPackagePicker vote={vote} pending={pending} onSubmit={(choices) => { onCastPackage(p.userId, choices); setExpandedUser(null); }} />
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Zerowanie głosu tajnego: lista osób, które oddały kartę (treść głosu nie jest znana ani pokazywana).
function SecretResetPanel({
  participants, votedUserIds, onReset, pending,
}: {
  participants: { userId: string; name: string }[];
  votedUserIds: string[];
  onReset: (userId: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const voted = new Set(votedUserIds);
  const list = participants
    .filter((p) => voted.has(p.userId))
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="border rounded-2">
      <button
        type="button"
        className="btn w-100 border-0 rounded-2 d-flex justify-content-between"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="d-inline-flex align-items-center gap-2"><IconUsers size={15} /> Zeruj głos uczestnika (pomyłka)</span>
        <span className="text-body-secondary">{open ? <IconChevronDown size={14} style={{ transform: "rotate(180deg)" }} /> : <IconChevronDown size={14} />}</span>
      </button>
      {open && (
        <div className="border-top p-2 bg-body-tertiary">
          <input
            className="form-control form-control-sm mb-2"
            placeholder="Wyszukaj uczestnika…"
            aria-label="Wyszukaj uczestnika"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="list-group overflow-y-auto" style={{ maxHeight: 340 }}>
            {list.length === 0 && (
              <div className="list-group-item small text-body-secondary">Nikt jeszcze nie oddał głosu.</div>
            )}
            {list.map((p) => (
              <div key={p.userId} className="list-group-item d-flex align-items-center gap-2">
                <div className="min-w-0 flex-grow-1">
                  <div className="text-truncate" title={p.name}>{p.name}</div>
                  <div className="small text-body-secondary">głos oddany</div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={pending}
                  onClick={async () => {
                    if (await ask({
                      title: "Wyzerować głos tajny?",
                      message: `Głos osoby ${p.name} zostanie usunięty z wyniku bez ujawniania jego treści. Uczestnik będzie mógł zagłosować ponownie.`,
                      confirmLabel: "Wyzeruj głos", danger: true,
                    })) onReset(p.userId);
                  }}
                >Zeruj</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Wybór kandydatów listy przy głosowaniu w imieniu.
function OnBehalfListPicker({ vote, pending, onSubmit }: { vote: VoteState; pending: boolean; onSubmit: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  return (
    <div className="mt-2 pt-2 border-top">
      <div className="d-flex flex-column gap-1 mb-2">
        {vote.options.map((o) => (
          <div key={o.id} className="form-check mb-0">
            <input className="form-check-input" type="checkbox" id={`obl-${o.id}`} checked={sel.includes(o.id)} onChange={() => toggle(o.id)} />
            <label className="form-check-label" htmlFor={`obl-${o.id}`}>{o.label}</label>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => onSubmit(sel)}>
        Zatwierdź i wyślij głos
      </button>
    </div>
  );
}

// Wybór za/przeciw/wstrzym per pozycja przy głosowaniu pakietowym w imieniu.
function OnBehalfPackagePicker({ vote, pending, onSubmit }: { vote: VoteState; pending: boolean; onSubmit: (choices: { optionId: string; choice: "YES" | "NO" | "ABSTAIN" }[]) => void }) {
  const [choices, setChoices] = useState<Record<string, "YES" | "NO" | "ABSTAIN">>({});
  const set = (optionId: string, choice: "YES" | "NO" | "ABSTAIN") => setChoices((p) => ({ ...p, [optionId]: choice }));
  const meta: { key: "YES" | "NO" | "ABSTAIN"; label: string; cls: string }[] = [
    { key: "YES", label: "Za", cls: "btn-yes" },
    { key: "NO", label: "Przeciw", cls: "btn-no" },
    { key: "ABSTAIN", label: "Wstrz.", cls: "btn-abstain" },
  ];
  return (
    <div className="mt-2 pt-2 border-top">
      <div className="d-flex flex-column gap-2 mb-2">
        {vote.options.map((o, i) => (
          <div key={o.id} className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span className="small flex-grow-1 min-w-0">{o.positionNumber ?? i + 1}. {o.label}</span>
            <div className="btn-group btn-group-sm" role="group">
              {meta.map((m) => (
                <button key={m.key} type="button" className={`btn ${choices[o.id] === m.key ? m.cls : ""}`} aria-pressed={choices[o.id] === m.key} disabled={pending} onClick={() => set(o.id, m.key)}>{m.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-sm" disabled={pending || Object.keys(choices).length === 0} onClick={() => onSubmit(Object.entries(choices).map(([optionId, choice]) => ({ optionId, choice })))}>
        Zatwierdź i wyślij głosy
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Modal tworzenia głosowania
// ─────────────────────────────────────────────────────────────────────────

function VoteComposerModal({
  meetingId, meetingName, mode, agendaItemId, agendaItemTitle, participants, prefill, editVote, onClose, onCreated,
}: {
  meetingId: string;
  meetingName: string;
  mode: "item" | "adhoc" | "plan";
  agendaItemId: string | null;
  agendaItemTitle?: string;
  participants: { id: string; name: string; groupShort: string | null }[];
  prefill?: VoteState | null;
  editVote?: VoteState | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEdit = !!editVote;
  const src = editVote ?? prefill ?? null;
  // Default title: dla item/plan - tytuł punktu, dla adhoc - nazwa posiedzenia (z możliwością edycji)
  const defaultTitle = (mode === "item" || mode === "plan") ? (agendaItemTitle ?? "") : meetingName;
  const [title, setTitle] = useState(editVote ? editVote.title : (prefill ? `Reasumpcja: ${prefill.title}` : defaultTitle));
  const [description, setDescription] = useState(editVote?.description ?? "");
  const [contextLabel, setContextLabel] = useState(editVote?.contextLabel ?? "");
  const [type, setType] = useState<VoteType>(src?.type ?? "STANDARD");
  const [visibility, setVisibility] = useState<VoteVisibility>(src?.visibility ?? "OPEN");
  const [majorityKind, setMajorityKind] = useState<MajorityKind>(src?.majorityKind ?? "SIMPLE");
  const [majorityBase, setMajorityBase] = useState<MajorityBase>(src?.majorityBase ?? "OF_VOTERS");
  const [options, setOptions] = useState<string[]>(
    src?.options && src.options.length > 0 && (src.type === "LIST")
      ? src.options.map((o) => o.label)
      : (prefill?.options && prefill.options.length > 0 && prefill.type === "LIST")
        ? prefill.options.map((o) => o.label)
        : ["", ""],
  );
  const [minSel, setMinSel] = useState<number>(src?.minSelections ?? 0);
  const [maxSel, setMaxSel] = useState<number>(src?.maxSelections ?? 1);
  // PIN zabezpieczający głosowanie
  const [pinRequired, setPinRequired] = useState(editVote?.pinRequired ?? false);
  // Pierwszy głos ważny per głosowanie: "" = globalne, "yes"/"no" = wymuś.
  const [firstVoteFinal, setFirstVoteFinal] = useState<"" | "yes" | "no">(
    editVote?.firstVoteFinal == null ? "" : editVote.firstVoteFinal ? "yes" : "no",
  );
  const [pinCode, setPinCode] = useState("");
  // Tryb kotarkowy (tylko tajne, bez kworum) - domyślnie wyłączony, ustalany przed otwarciem.
  const [boothMode, setBoothMode] = useState(editVote?.boothMode ?? false);
  const boothAvailable = visibility === "SECRET" && type !== "QUORUM";
  // Pakiet: pozycje (etykieta + opcjonalny numer/opis) i wymóg wszystkich pozycji.
  // Źródłem pozycji jest edytowane głosowanie (edit) LUB głosowanie kopiowane przy reasumpcji (prefill).
  const packageSource = (editVote?.type === "PACKAGE" && editVote.options.length > 0) ? editVote
    : (prefill?.type === "PACKAGE" && prefill.options.length > 0) ? prefill
    : null;
  const [packageItems, setPackageItems] = useState<{ label: string; description: string }[]>(
    packageSource
      ? packageSource.options.map((o) => ({ label: o.label, description: o.description ?? "" }))
      : [{ label: "", description: "" }, { label: "", description: "" }],
  );
  const [requireAllPositions, setRequireAllPositions] = useState(editVote?.requireAllPositions ?? prefill?.requireAllPositions ?? true);
  // Tryb planowania domyślnie NIE otwiera od razu - operator uruchamia ręcznie
  const [openImmediately, setOpenImmediately] = useState(mode !== "plan" && !isEdit);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [showExclusions, setShowExclusions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Modal wklejania pozycji z tekstu (wspólny dla listy i pakietu).
  const [pasteTarget, setPasteTarget] = useState<null | "list" | "package">(null);
  const [pasteText, setPasteText] = useState("");

  function applyPaste() {
    const lines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { setPasteTarget(null); setPasteText(""); return; }
    if (pasteTarget === "list") {
      setOptions((arr) => { const filled = arr.filter((v) => v.trim() !== ""); return [...filled, ...lines]; });
    } else if (pasteTarget === "package") {
      setPackageItems((arr) => { const filled = arr.filter((v) => v.label.trim() !== ""); return [...filled, ...lines.map((l) => ({ label: l, description: "" }))]; });
    }
    setPasteTarget(null);
    setPasteText("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const payload: Record<string, unknown> = isEdit
      ? {
          title, description: description || null,
          type, visibility, majorityKind, majorityBase,
          contextLabel: editVote?.adHoc ? (contextLabel.trim() || null) : undefined,
        }
      : {
          title, description: description || null,
          type, visibility,
          majorityKind, majorityBase,
          adHoc: mode === "adhoc",
          contextLabel: mode === "adhoc" ? (contextLabel.trim() || null) : null,
          agendaItemId: mode === "adhoc" ? null : agendaItemId,
          openImmediately: excludedIds.length > 0 ? false : openImmediately,
        };
    if (type === "LIST") {
      const opts = options.map((o) => o.trim()).filter(Boolean);
      payload.options = opts.map((label) => ({ label }));
      payload.minSelections = minSel;
      payload.maxSelections = maxSel;
    }
    if (type === "PACKAGE") {
      const items = packageItems.map((it, i) => ({ label: it.label.trim(), description: it.description.trim() || null, positionNumber: String(i + 1) })).filter((it) => it.label);
      if (items.length < 2) { setError("Pakiet wymaga co najmniej 2 pozycji."); setSubmitting(false); return; }
      payload.options = items;
      payload.requireAllPositions = requireAllPositions;
    }
    if (pinRequired) {
      if (!isEdit || pinCode) {
        if (!/^\d{4}$/.test(pinCode)) { setError("PIN musi mieć 4 cyfry."); setSubmitting(false); return; }
      }
      payload.pinRequired = true;
      if (pinCode) payload.pinCode = pinCode;
    } else if (isEdit) {
      payload.pinRequired = false;
      payload.pinCode = null;
    }
    payload.firstVoteFinal = firstVoteFinal === "" ? null : firstVoteFinal === "yes";
    payload.boothMode = boothAvailable && boothMode;

    if (isEdit && editVote) {
      // Tryb edycji: PATCH pełnych pól (dozwolone tylko dla nieotwartych).
      const r = await fetch(`/api/votes/${editVote.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!r.ok) { setError(await readUserError(r)); setSubmitting(false); return; }
      setSubmitting(false);
      onCreated();
      return;
    }

    const r = await fetch(`/api/meetings/${meetingId}/votes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!r.ok) { setError(await readUserError(r)); setSubmitting(false); return; }
    const { voteId } = await r.json();

    // jeśli są wyłączenia - wyślij je przed otwarciem
    if (excludedIds.length > 0) {
      for (const participantId of excludedIds) {
        const er = await fetch(`/api/votes/${voteId}/exclusions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId, excluded: true }),
        });
        if (!er.ok) { setError(`Wyłączenia: ${await er.text()}`); setSubmitting(false); return; }
      }
      // jeśli operator chciał otworzyć od razu - zrób to teraz
      if (openImmediately) {
        const or = await fetch(`/api/votes/${voteId}/open`, { method: "POST" });
        if (!or.ok) { setError(`Otwarcie: ${await or.text()}`); setSubmitting(false); return; }
      }
    }

    setSubmitting(false);
    onCreated();
  }

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
          <form className="modal-content" onSubmit={submit}>
            <div className="modal-header">
              <h2 className="modal-title fs-6 fw-semibold me-auto" style={{ overflowWrap: "anywhere" }}>
                {isEdit ? "Edytuj głosowanie" : mode === "plan" ? `Zaplanuj głosowanie - ${agendaItemTitle ?? ""}` : "Nowe głosowanie"}
              </h2>
              <button type="button" className="btn-close" aria-label="Zamknij" onClick={onClose} />
            </div>

            <div className="modal-body d-flex flex-column gap-3">
              <div>
                <label className="form-label" htmlFor="vc-title">Tytuł / wniosek</label>
                <input id="vc-title" className="form-control" required value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div>
                <label className="form-label" htmlFor="vc-desc">Opis (opcjonalnie)</label>
                <textarea id="vc-desc" className="form-control" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              {mode === "adhoc" && (
                <div>
                  <label className="form-label" htmlFor="vc-context">Kontekst w raporcie (opcjonalnie)</label>
                  <input id="vc-context" className="form-control" placeholder="np. Wniosek zgłoszony w pkt 4" value={contextLabel} onChange={(e) => setContextLabel(e.target.value)} />
                  <div className="form-text">Zastępuje nazwę posiedzenia w nagłówku raportu tego głosowania.</div>
                </div>
              )}

              <div className="row g-3">
                <div className="col-12 col-sm-6">
                  <label className="form-label" htmlFor="vc-type">Typ</label>
                  <select id="vc-type" className="form-select" value={type} onChange={(e) => setType(e.target.value as VoteType)}>
                    <option value="STANDARD">Zwykłe (za / przeciw / wstrzymuję się)</option>
                    <option value="LIST">Lista kandydatów / opcji</option>
                    <option value="PACKAGE">Pakietowe (wiele pozycji, każda za/przeciw/wstrzym)</option>
                    <option value="QUORUM">Kworum (sprawdzenie obecności)</option>
                  </select>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label" htmlFor="vc-vis">Widoczność</label>
                  <select id="vc-vis" className="form-select" value={visibility} onChange={(e) => setVisibility(e.target.value as VoteVisibility)}>
                    <option value="OPEN">Jawne (z imienną historią)</option>
                    <option value="SECRET">Tajne (anonimowe po zamknięciu)</option>
                  </select>
                </div>
                {type !== "QUORUM" && (
                  <>
                    <div className="col-12 col-sm-6">
                      <label className="form-label" htmlFor="vc-maj">Typ większości</label>
                      <select id="vc-maj" className="form-select" value={majorityKind} onChange={(e) => setMajorityKind(e.target.value as MajorityKind)}>
                        <option value="SIMPLE">Zwykła (za &gt; przeciw, wstrzymania nie liczą)</option>
                        <option value="ABSOLUTE">Bezwzględna</option>
                        <option value="QUALIFIED_TWO_THIRDS">Kwalifikowana 2/3</option>
                        <option value="QUALIFIED_THREE_FIFTHS">Kwalifikowana 3/5</option>
                      </select>
                    </div>
                    {majorityKind !== "SIMPLE" && (
                      <div className="col-12 col-sm-6">
                        <label className="form-label" htmlFor="vc-base">Mianownik</label>
                        <select id="vc-base" className="form-select" value={majorityBase} onChange={(e) => setMajorityBase(e.target.value as MajorityBase)}>
                          <option value="OF_VOTERS">Od głosujących (oddanych głosów)</option>
                          <option value="OF_PRESENT">Od obecnych</option>
                          <option value="OF_FULL_BODY">Od pełnego składu</option>
                        </select>
                      </div>
                    )}
                  </>
                )}
              </div>

              {type === "LIST" && (
                <fieldset className="border-top pt-3">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                    <legend className="form-label mb-0 fs-6 w-auto float-none">Kandydaci / opcje</legend>
                    <div className="d-flex flex-wrap gap-1">
                      <button type="button" className="btn btn-sm" title="Wklej listę z tekstu - każda linia to jedna pozycja" onClick={() => { setPasteText(""); setPasteTarget("list"); }}>Wklej z tekstu</button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Posortuj pozycje alfabetycznie (z polskimi znakami)"
                        onClick={() => setOptions((arr) => {
                          const filled = arr.filter((v) => v.trim() !== "").sort((a, b) => a.localeCompare(b, "pl", { sensitivity: "base" }));
                          const empty = arr.filter((v) => v.trim() === "");
                          return [...filled, ...empty];
                        })}
                      >Sortuj A-Z</button>
                      <button type="button" className="btn btn-sm" onClick={() => setOptions((o) => [...o, ""])}>+ Dodaj</button>
                    </div>
                  </div>
                  <ol className="list-unstyled d-flex flex-column gap-2 mb-0">
                    {options.map((o, i) => (
                      <li key={i} className="d-flex align-items-center gap-2">
                        <span className="row-num mono small text-end">{i + 1}.</span>
                        <input
                          className="form-control"
                          value={o}
                          aria-label={`Pozycja ${i + 1}`}
                          placeholder="Nazwisko i imię"
                          onChange={(e) => setOptions((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))}
                        />
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setOptions((arr) => arr.filter((_, idx) => idx !== i))}>Usuń</button>
                      </li>
                    ))}
                  </ol>
                  <div className="row g-3 mt-1">
                    <div className="col-6">
                      <label className="form-label" htmlFor="vc-min">Co najmniej zaznaczeń</label>
                      <input id="vc-min" type="number" min={0} className="form-control" value={minSel} onChange={(e) => setMinSel(parseInt(e.target.value || "0", 10))} />
                    </div>
                    <div className="col-6">
                      <label className="form-label" htmlFor="vc-max">Co najwyżej zaznaczeń</label>
                      <input id="vc-max" type="number" min={1} className="form-control" value={maxSel} onChange={(e) => setMaxSel(parseInt(e.target.value || "1", 10))} />
                    </div>
                  </div>
                  <div className="form-text">Każde niezaznaczone pole = głos przeciw danemu kandydatowi.</div>
                </fieldset>
              )}

              {type === "PACKAGE" && (
                <fieldset className="border-top pt-3">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                    <legend className="form-label mb-0 fs-6 w-auto float-none">Pozycje pakietu</legend>
                    <div className="d-flex flex-wrap gap-1">
                      <button type="button" className="btn btn-sm" title="Wklej pozycje z tekstu - każda linia to jedna pozycja" onClick={() => { setPasteText(""); setPasteTarget("package"); }}>Wklej z tekstu</button>
                      <button type="button" className="btn btn-sm" onClick={() => setPackageItems((o) => [...o, { label: "", description: "" }])}>+ Dodaj pozycję</button>
                    </div>
                  </div>
                  <ol className="list-unstyled d-flex flex-column gap-3 mb-0">
                    {packageItems.map((it, i) => (
                      <li key={i} className="d-flex align-items-start gap-2">
                        <span className="row-num mono small text-end pt-2">{i + 1}.</span>
                        <div className="flex-grow-1 d-flex flex-column gap-1">
                          <input
                            className="form-control"
                            value={it.label}
                            aria-label={`Tytuł pozycji ${i + 1}`}
                            placeholder="Tytuł pozycji (np. Poprawka nr 1)"
                            onChange={(e) => setPackageItems((arr) => arr.map((v, idx) => (idx === i ? { ...v, label: e.target.value } : v)))}
                          />
                          <input
                            className="form-control form-control-sm"
                            value={it.description}
                            aria-label={`Opis pozycji ${i + 1}`}
                            placeholder="Opis (opcjonalnie)"
                            onChange={(e) => setPackageItems((arr) => arr.map((v, idx) => (idx === i ? { ...v, description: e.target.value } : v)))}
                          />
                        </div>
                        <button type="button" className="btn btn-sm btn-outline-danger mt-1" onClick={() => setPackageItems((arr) => arr.filter((_, idx) => idx !== i))}>Usuń</button>
                      </li>
                    ))}
                  </ol>
                  <div className="form-check mt-3">
                    <input className="form-check-input" type="checkbox" id="vc-reqall" checked={requireAllPositions} onChange={(e) => setRequireAllPositions(e.target.checked)} />
                    <label className="form-check-label" htmlFor="vc-reqall">Wymagaj oddania głosu na wszystkie pozycje</label>
                  </div>
                </fieldset>
              )}

              <div className="border-top pt-3">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="vc-pin" checked={pinRequired} onChange={(e) => setPinRequired(e.target.checked)} />
                  <label className="form-check-label" htmlFor="vc-pin">Zabezpiecz PIN-em (radny wpisuje kod z ekranu sali){type === "QUORUM" ? " - zalecane przy kworum" : ""}</label>
                </div>
                {pinRequired && (
                  <div className="input-group mt-2" style={{ maxWidth: 260 }}>
                    <input
                      className="form-control mono text-center"
                      style={{ letterSpacing: ".3em" }}
                      value={pinCode}
                      aria-label="PIN"
                      placeholder="0000"
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(e) => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    />
                    <button type="button" className="btn" onClick={() => setPinCode(String(Math.floor(1000 + Math.random() * 9000)))}>Wylosuj</button>
                  </div>
                )}
              </div>

              {boothAvailable && (
                <div className="border-top pt-3">
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" role="switch" id="vc-booth" checked={boothMode} onChange={(e) => setBoothMode(e.target.checked)} aria-describedby="vc-booth-help" />
                    <label className="form-check-label" htmlFor="vc-booth">Tryb kotarkowy</label>
                  </div>
                  <div className="form-text" id="vc-booth-help">
                    Radni głosują pojedynczo za kotarką. Karta pojawia się na telefonie dopiero, gdy operator wybierze „Udostępnij” przy nazwisku osoby, która weszła. Ustawienia nie można zmienić po otwarciu głosowania.
                  </div>
                </div>
              )}

              <div className="border-top pt-3">
                <label className="form-label" htmlFor="vc-first">Pierwszy głos ważny (nie można zmienić)</label>
                <select id="vc-first" className="form-select" value={firstVoteFinal} onChange={(e) => setFirstVoteFinal(e.target.value as "" | "yes" | "no")}>
                  <option value="">Domyślnie (wg ustawień globalnych)</option>
                  <option value="yes">Tak - pierwszy głos ostateczny</option>
                  <option value="no">Nie - można zmieniać do zamknięcia</option>
                </select>
                <div className="form-text">
                  Dotyczy tylko tego głosowania. „Domyślnie” korzysta z konfiguracji globalnej (osobno jawne/tajne).
                </div>
              </div>

              {!isEdit && (
                <div className="border-top pt-3">
                  <button type="button" className="btn btn-link btn-sm px-0 text-decoration-none" onClick={() => setShowExclusions((v) => !v)} aria-expanded={showExclusions}>
                    {showExclusions ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    Wyłącz osoby z tego głosowania ({excludedIds.length})
                  </button>
                  {showExclusions && (
                    <div className="list-group mt-2 overflow-y-auto" style={{ maxHeight: 200 }}>
                      {participants.map((p) => {
                        const checked = excludedIds.includes(p.id);
                        return (
                          <label key={p.id} className="list-group-item list-group-item-action d-flex align-items-center gap-2 py-1">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              checked={checked}
                              onChange={() => setExcludedIds((arr) => checked ? arr.filter((id) => id !== p.id) : [...arr, p.id])}
                            />
                            <span className="flex-grow-1">{p.name}</span>
                            {p.groupShort && <span className="small text-body-secondary">{p.groupShort}</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {excludedIds.length > 0 && (
                    <div className="form-text">Wyłączone osoby nie będą widoczne w snapshocie uprawnionych ani w mianowniku większości.</div>
                  )}
                </div>
              )}

              {!isEdit && (
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="vc-open" checked={openImmediately} onChange={(e) => setOpenImmediately(e.target.checked)} />
                  <label className="form-check-label" htmlFor="vc-open">Otwórz od razu</label>
                </div>
              )}

              {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn" onClick={onClose}>Anuluj</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? (isEdit ? "Zapisuję…" : "Tworzę…") : isEdit ? "Zapisz zmiany" : openImmediately ? "Utwórz i otwórz" : "Utwórz"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Okno wklejania pozycji z tekstu - nad oknem głosowania. */}
      {pasteTarget && (
        <Modal
          title={`Wklej ${pasteTarget === "package" ? "pozycje pakietu" : "pozycje listy"} z tekstu`}
          onClose={() => setPasteTarget(null)}
          zIndex={1070}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setPasteTarget(null)}>Anuluj</button>
              <button type="button" className="btn btn-primary" onClick={applyPaste}>Dodaj pozycje</button>
            </>
          }
        >
          <p className="small text-body-secondary mb-2">
            Każda linia to jedna pozycja. Puste linie są pomijane. Pozycje zostaną dopisane do istniejących.
          </p>
          <textarea
            autoFocus
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={10}
            className="form-control"
            aria-label="Pozycje do wklejenia"
            placeholder={"Jan Kowalski\nAnna Nowak\nPiotr Wiśniewski"}
          />
          <div className="form-text">Rozpoznane pozycje: {pasteText.split("\n").map((l) => l.trim()).filter(Boolean).length}</div>
        </Modal>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Tryb kotarkowy - panel kabiny (jedna kabina, operator udostępnia kartę)
// ─────────────────────────────────────────────────────────────────────────

interface BoothPersonState { userId: string; name: string; clubShort: string | null; present: boolean; status: "WAITING" | "GRANTED" | "VOTED" }
interface BoothStateResp {
  voteId: string; boothMode: boolean; status: string;
  boothUserId: string | null; boothUserName: string | null; boothGrantedAt: string | null;
  castCount: number; eligibleCount: number; people: BoothPersonState[];
}

/**
 * Potwierdzenie zamknięcia głosowania. W trybie kotarkowym stan kabiny pobieramy z serwera
 * (nie z pamięci panelu) - gdy karta jest nadal udostępniona, operator dostaje ostrzeżenie.
 * `alwaysConfirm` - skrót klawiszowy pyta zawsze; przycisk pyta tylko przy udostępnionej karcie.
 */
async function confirmCloseVote(vote: { id: string; boothMode?: boolean }, alwaysConfirm: boolean): Promise<boolean> {
  if (vote.boothMode) {
    let holder: string | null = null;
    let known = true;
    try {
      const r = await fetch(`/api/votes/${vote.id}/booth`, { cache: "no-store" });
      if (r.ok) { const s: BoothStateResp = await r.json(); holder = s.boothUserId ? (s.boothUserName ?? "osoba z listy") : null; }
      else known = false;
    } catch { known = false; }
    if (holder) {
      return ask({
        title: "Zamknąć głosowanie?",
        message: `Karta jest nadal udostępniona: ${holder}. Głos tej osoby nie został przyjęty.\n\nZamknięcie głosowania unieważni udostępnienie - ta osoba nie odda już głosu.`,
        confirmLabel: "Zamknij głosowanie",
        danger: true,
      });
    }
    if (!known) return ask({ title: "Zamknąć głosowanie?", message: "Nie udało się sprawdzić stanu kabiny. Jeśli karta jest udostępniona, zamknięcie ją unieważni.", confirmLabel: "Zamknij głosowanie", danger: true });
  }
  return alwaysConfirm ? ask({ title: "Zamknąć trwające głosowanie?", confirmLabel: "Zamknij głosowanie" }) : true;
}

const BOOTH_STATUS: Record<BoothPersonState["status"], { label: string; cls: string }> = {
  WAITING: { label: "Oczekuje", cls: "text-bg-light border" },
  GRANTED: { label: "Głosowanie udostępniono", cls: "bg-warning-subtle text-warning-emphasis border border-warning-subtle" },
  VOTED: { label: "Głos oddany", cls: "bg-success-subtle text-success-emphasis border border-success-subtle" },
};

function BoothPanel({ voteId }: { voteId: string }) {
  const [state, setState] = useState<BoothStateResp | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // Stan zawsze z serwera: odświeżenie / restart panelu / drugi operator widzą to samo.
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/votes/${voteId}/booth`, { cache: "no-store" });
      if (!r.ok) { setLoadError(true); return; }
      setState(await r.json());
      setLoadError(false);
    } catch { setLoadError(true); }
  }, [voteId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [load]);

  async function act(action: "grant" | "revoke", userId: string) {
    setError(null);
    setBusyUser(userId);
    try {
      const r = await fetch(`/api/votes/${voteId}/booth`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId }),
      });
      if (r.ok) setState(await r.json());
      else { setError(await readUserError(r)); await load(); }
    } catch {
      // Brak odpowiedzi - nie zakładamy wyniku; stan pobieramy ponownie z serwera.
      setError("Brak połączenia z serwerem. Stan kabiny odświeżono - sprawdź go przed kolejną czynnością.");
      await load();
    } finally {
      setBusyUser(null);
    }
  }

  if (!state) {
    return (
      <div className="border rounded-2 p-3 small text-body-secondary">
        {loadError ? "Nie udało się pobrać stanu kabiny. Ponawiam…" : "Wczytywanie stanu kabiny…"}
      </div>
    );
  }

  const holder = state.people.find((p) => p.userId === state.boothUserId) ?? null;
  const q = filter.trim().toLowerCase();
  const people = q ? state.people.filter((p) => `${p.name} ${p.clubShort ?? ""}`.toLowerCase().includes(q)) : state.people;

  return (
    <section className="border rounded-2" aria-label="Tryb kotarkowy - kabina">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2 border-bottom bg-body-tertiary">
        <span className="fw-semibold">Tryb kotarkowy</span>
        <span className="small">
          Oddane głosy: <span className="mono fw-semibold">{state.castCount}</span>
          <span className="text-body-secondary"> / {state.eligibleCount} uprawnionych</span>
        </span>
      </div>

      <div className="p-3 d-flex flex-column gap-3">
        <div className={`alert mb-0 py-2 d-flex flex-wrap align-items-center justify-content-between gap-2 ${holder ? "alert-warning" : "alert-light border"}`} role="status" aria-live="polite">
          {holder ? (
            <>
              <span>
                Karta udostępniona: <strong>{holder.name}</strong>
                {state.boothGrantedAt && (
                  <span className="text-body-secondary small"> (od {new Date(state.boothGrantedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })})</span>
                )}
              </span>
              <button type="button" className="btn btn-sm btn-outline-danger" disabled={busyUser !== null} onClick={() => act("revoke", holder.userId)}>
                Cofnij udostępnienie
              </button>
            </>
          ) : (
            <span>Kabina wolna. Gdy radny wejdzie za kotarkę, wybierz <strong>Udostępnij</strong> przy jego nazwisku.</span>
          )}
        </div>

        {error && <div className="alert alert-danger mb-0 py-2 small" role="alert">{error}</div>}
        {loadError && <div className="small text-danger">Brak połączenia - pokazany stan może być nieaktualny.</div>}

        <input
          className="form-control form-control-sm"
          placeholder="Szukaj radnego…"
          aria-label="Szukaj radnego"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {people.length === 0 ? (
          <div className="small text-body-secondary">{state.people.length === 0 ? "Brak obecnych radnych z prawem głosu." : "Brak wyników."}</div>
        ) : (
          <ul className="list-group overflow-y-auto" style={{ maxHeight: 420 }} aria-label="Uprawnieni do głosowania">
            {people.map((p) => {
              const st = BOOTH_STATUS[p.status];
              const isHolder = p.userId === state.boothUserId;
              return (
                <li key={p.userId} className={`list-group-item d-flex align-items-center justify-content-between gap-2 py-2${isHolder ? " list-group-item-warning" : ""}`}>
                  <span className="min-w-0">
                    <span className="fw-medium">{p.name}</span>
                    {p.clubShort && <span className="small text-body-secondary"> ({p.clubShort})</span>}
                    <span className={`badge ms-2 ${st.cls}`}>{st.label}</span>
                    {!p.present && p.status !== "VOTED" && <span className="small text-body-secondary ms-2">nieobecny</span>}
                  </span>
                  {p.status === "WAITING" && (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary flex-shrink-0"
                      disabled={busyUser !== null || !!state.boothUserId || !p.present}
                      title={state.boothUserId ? "Kabina zajęta - najpierw głos albo cofnięcie udostępnienia" : undefined}
                      onClick={() => act("grant", p.userId)}
                    >
                      Udostępnij
                    </button>
                  )}
                  {p.status === "GRANTED" && (
                    <button type="button" className="btn btn-sm btn-outline-danger flex-shrink-0" disabled={busyUser !== null} onClick={() => act("revoke", p.userId)}>
                      Cofnij udostępnienie
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="form-text mt-0">
          Wyniki (także cząstkowe) są niedostępne do zamknięcia głosowania. Panel pokazuje tylko, kto ma kartę i kto oddał głos.
        </div>
      </div>
    </section>
  );
}

function SectionHeader({ title, right, tone }: { title: string; right?: React.ReactNode; tone?: "live" }) {
  return <CardHeader title={title} right={right} tone={tone} />;
}

function OnlineList({ participants }: { participants: { userId: string; name: string; online?: boolean; groupShort: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const online = participants.filter((p) => p.online);
  // Sortowanie po NAZWISKU (ostatni człon "Imię Nazwisko"), a nie po imieniu.
  const lastNameKey = (full: string) => {
    const parts = full.trim().split(/\s+/);
    return (parts[parts.length - 1] ?? full) + " " + parts.slice(0, -1).join(" ");
  };
  const sorted = [...participants].sort((a, b) => {
    if (!!a.online !== !!b.online) return a.online ? -1 : 1; // online najpierw
    return lastNameKey(a.name).localeCompare(lastNameKey(b.name), "pl");
  });
  return (
    <div className="mb-3">
      <button type="button" className="btn btn-link btn-sm px-0 text-body-secondary text-decoration-none" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`d-inline-block rounded-circle ${online.length > 0 ? "bg-success" : "bg-secondary"}`} style={{ width: 8, height: 8 }} />
        <span>Online: {online.length} / {participants.length}</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-1 d-flex flex-wrap gap-1">
          {sorted.map((p) => (
            <span key={p.userId} className={`badge text-bg-light border fw-normal d-inline-flex align-items-center gap-1${p.online ? "" : " opacity-50"}`}>
              <span className={`d-inline-block rounded-circle ${p.online ? "bg-success" : "bg-secondary"}`} style={{ width: 6, height: 6 }} />
              {p.name}{p.groupShort ? ` (${p.groupShort})` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="col-6 col-lg-3">
      <div className="card h-100">
        <div className="card-body">
          <div className="small text-body-secondary">{label}</div>
          <div className="num fs-3 fw-semibold lh-sm">{value}</div>
          {sub && <div className="small text-body-secondary">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function QuorumCell({ quorum }: { quorum: QuorumStatus }) {
  const ok = quorum.met;
  return (
    <div className="col-6 col-lg-3">
      <div className={`card h-100 ${ok ? "border-success-subtle bg-success-subtle" : "border-danger-subtle bg-danger-subtle"}`}>
        <div className={`card-body ${ok ? "text-success-emphasis" : "text-danger-emphasis"}`}>
          <div className="small">Kworum</div>
          <div className="num fs-3 fw-semibold lh-sm">{quorum.presentCount} / {quorum.requiredCount}</div>
          <div className="small">{ok ? "spełnione" : "niespełnione"} - {quorum.ruleLabel}</div>
        </div>
      </div>
    </div>
  );
}

function PackageCounterRow({ idx, label, yes, no, abstain }: { idx: number; label: string; yes: number | null; no: number | null; abstain: number | null }) {
  const cell = (v: number | null, color: string) => (
    <td className="text-center num" style={{ color: `var(--color-${color})` }}>{v === null ? "-" : v}</td>
  );
  return (
    <tr>
      <td><span className="mono me-2 text-body-secondary">{idx + 1}.</span>{label}</td>
      {cell(yes, "yes")}
      {cell(no, "no")}
      {cell(abstain, "abstain")}
    </tr>
  );
}

function BallotCounter({ label, color, value, bordered }: { label: string; color: "yes" | "no" | "abstain"; value?: number; bordered?: boolean }) {
  const cls = color === "yes" ? "text-success" : color === "no" ? "text-danger" : "text-warning";
  return (
    <div className={`col text-center py-3 bg-white ${bordered ? "border-end" : ""}`}>
      <div className={`small fw-semibold ${cls}`}>{label}</div>
      <div className={`num fs-2 fw-semibold lh-1 mt-1 ${cls}`}>
        {value === undefined ? "-" : value}
      </div>
    </div>
  );
}

function AgendaStatusPill({ status }: { status: AgendaItemStatus }) {
  if (status === "CURRENT") return <span className="badge badge-live">Rozpatrywany</span>;
  if (status === "PAUSED") return <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Zawieszony</span>;
  if (status === "COMPLETED") return <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle">Zakończony</span>;

  if (status === "SKIPPED") return <span className="badge text-bg-light border">Pominięty</span>;
  return <span className="badge text-bg-light border">Oczekuje</span>;
}

function labelForType(t: VoteType): string {
  switch (t) {
    case "STANDARD": return "zwykłe";
    case "LIST": return "lista";
    case "PACKAGE": return "pakietowe";
    case "QUORUM": return "kworum";
    default: return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Komunikaty
// ─────────────────────────────────────────────────────────────────────────

function MessagesPanel({
  meetingId, messages, pending, onPublished,
}: {
  meetingId: string;
  messages: { id: string; content: string; publishedAt: string; hidden: boolean }[];
  pending: boolean;
  onPublished: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    const r = await fetch(`/api/meetings/${meetingId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft.trim() }),
    });
    setSending(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Komunikat został opublikowany.");
    setDraft("");
    onPublished();
  }

  async function toggleHidden(id: string, hidden: boolean) {
    const r = await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    if (!r.ok) { await notifyFailure(r); return; }
    onPublished();
  }

  async function removeMessage(id: string) {
    if (!(await ask({ title: "Usunąć komunikat?", message: "Komunikat zniknie z ekranów radnych.", confirmLabel: "Usuń", danger: true }))) return;
    const r = await fetch(`/api/messages/${id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Komunikat został usunięty.");
    onPublished();
  }

  return (
    <div className="card">
      <SectionHeader title="Komunikaty" />
      <div className="card-body">
        <textarea
          className="form-control"
          rows={2}
          placeholder="Treść komunikatu dla uczestników…"
          aria-label="Treść komunikatu"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="d-flex justify-content-end mt-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || sending || !draft.trim()}
            onClick={send}
          >
            {sending ? "Wysyłam…" : "Opublikuj"}
          </button>
        </div>
      </div>
      <ul className="list-group list-group-flush border-top overflow-y-auto" style={{ maxHeight: 300 }}>
        {messages.map((m) => (
          <li key={m.id} className={`list-group-item${m.hidden ? " opacity-50" : ""}`}>
            <div className="d-flex justify-content-between align-items-start gap-2">
              <div className="min-w-0">
                <div style={{ overflowWrap: "anywhere" }}>{m.content}</div>
                <div className="small text-body-secondary mono">
                  {formatTime(m.publishedAt)}
                  {m.hidden && <span className="ms-2 fst-italic">ukryty</span>}
                </div>
              </div>
              <div className="d-flex gap-1 flex-shrink-0">
                <button className="btn btn-sm" onClick={() => toggleHidden(m.id, !m.hidden)} title={m.hidden ? "Pokaż komunikat" : "Ukryj komunikat"}>
                  {m.hidden ? "Pokaż" : "Ukryj"}
                </button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => removeMessage(m.id)} title="Usuń komunikat" aria-label="Usuń komunikat">
                  <IconClose size={13} />
                </button>
              </div>
            </div>
          </li>
        ))}
        {messages.length === 0 && (
          <li className="list-group-item small text-body-secondary">Brak komunikatów.</li>
        )}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Modal edycji posiedzenia
// ─────────────────────────────────────────────────────────────────────────

function EditMeetingModal({
  meetingId, initialName, initialNumber, initialScheduledAt, settings, onClose, onSaved,
}: {
  meetingId: string;
  initialName: string;
  initialNumber: string;
  initialScheduledAt: string;
  settings: MeetingClientState["settings"];
  onClose: () => void;
  onSaved: () => void;
}) {
  // konwertuj ISO na "YYYY-MM-DDTHH:mm" w strefie Warszawy
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Warsaw",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  };

  const [name, setName] = useState(initialName);
  const [number, setNumber] = useState(initialNumber);
  const [scheduledLocal, setScheduledLocal] = useState(toLocalInput(initialScheduledAt));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const r = await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, number,
        scheduledAt: localInputToWarsawISO(scheduledLocal),
      }),
    });
    if (!r.ok) {
      setError(await readUserError(r));
      setSubmitting(false);
      return;
    }
    onSaved();
  }

  return (
    <Modal title="Edycja posiedzenia" onClose={onClose} size="lg" closeOnBackdrop={false}>
      <form onSubmit={save} className="d-flex flex-column gap-3">
        <div>
          <label className="form-label" htmlFor="em-name">Nazwa</label>
          <input id="em-name" className="form-control" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="row g-3">
          <div className="col-12 col-sm-6">
            <label className="form-label" htmlFor="em-number">Numer (np. „XII/2025”)</label>
            <input id="em-number" className="form-control" value={number} onChange={(e) => setNumber(e.target.value)} required />
          </div>
          <div className="col-12 col-sm-6">
            <label className="form-label" htmlFor="em-date">Data i godzina</label>
            <input id="em-date" type="datetime-local" className="form-control" value={scheduledLocal} onChange={(e) => setScheduledLocal(e.target.value)} required />
            <div className="form-text">Czas warszawski.</div>
          </div>
        </div>
        {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>Anuluj</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Zapisuję…" : "Zapisz"}
          </button>
        </div>
      </form>

      {/* Ustawienia posiedzenia (kworum, lista mówców, publikacja) - tutaj, razem z edycją */}
      <div className="mt-4">
        <MeetingSettingsPanel meetingId={meetingId} settings={settings} />
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Modal korekty zadeklarowanej większości (przeliczenie wyniku)
// ─────────────────────────────────────────────────────────────────────────

function RecomputeMajorityModal({
  vote, onClose, onDone,
}: {
  vote: VoteState;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<MajorityKind>(vote.majorityKind);
  const [base, setBase] = useState<MajorityBase>(vote.majorityBase);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const KIND_LABEL: Record<string, string> = {
    SIMPLE: "Zwykła",
    ABSOLUTE: "Bezwzględna",
    QUALIFIED_TWO_THIRDS: "Kwalifikowana 2/3",
    QUALIFIED_THREE_FIFTHS: "Kwalifikowana 3/5",
  };

  async function recompute() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/votes/${vote.id}/recompute-majority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ majorityKind: kind, majorityBase: base }),
      });
      if (!r.ok) { setMsg(await readUserError(r)); setBusy(false); return; }
      onDone();
    } catch (e) {
      setMsg(String(e)); setBusy(false);
    }
  }

  return (
    <Modal
      title="Przelicz większość"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Anuluj</button>
          <button className="btn btn-primary" onClick={recompute} disabled={busy}>
            {busy ? "Przeliczanie…" : "Przelicz wynik"}
          </button>
        </>
      }
    >
      <p className="fw-medium mb-1">{vote.title}</p>
      <p className="small text-body-secondary">
        Korekta błędnie zadeklarowanej większości. Wynik zostanie przeliczony z zachowanych liczników i zaktualizowany także na ekranach wizualizacji.
      </p>
      <div className="d-flex flex-column gap-3">
        <div>
          <label className="form-label" htmlFor="rm-kind">Rodzaj większości</label>
          <select id="rm-kind" className="form-select" value={kind} onChange={(e) => setKind(e.target.value as MajorityKind)}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="rm-base">Podstawa</label>
          <select id="rm-base" className="form-select" value={base} onChange={(e) => setBase(e.target.value as MajorityBase)}>
            <option value="OF_VOTERS">głosujących</option>
            <option value="OF_PRESENT">obecnych</option>
            <option value="OF_FULL_BODY">ustawowego składu</option>
          </select>
        </div>
      </div>
      {msg && <div className="alert alert-danger py-2 mt-3 mb-0">{msg}</div>}
    </Modal>
  );
}

// Modal edycji nazwy głosowania oraz kontekstu w raporcie (zastępuje monity przeglądarki).
function EditVoteModal({
  initialTitle, initialContext, showContext, onClose, onSubmit,
}: {
  initialTitle: string;
  initialContext: string | null;
  showContext: boolean;
  onClose: () => void;
  onSubmit: (title: string, context: string | null) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [context, setContext] = useState(initialContext ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(title, context);
  }

  return (
    <Modal title="Edycja głosowania" onClose={onClose} closeOnBackdrop={false}>
      <form onSubmit={save} className="d-flex flex-column gap-3">
        <div>
          <label className="form-label" htmlFor="ev-title">Nazwa głosowania</label>
          <input id="ev-title" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </div>
        {showContext && (
          <div>
            <label className="form-label" htmlFor="ev-ctx">Kontekst w raporcie</label>
            <input
              id="ev-ctx"
              className="form-control"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="np. Wniosek zgłoszony w pkt 4 (puste = nazwa posiedzenia)"
            />
            <div className="form-text">Zastępuje nazwę posiedzenia w raporcie tego głosowania. Puste pole = użyj nazwy posiedzenia.</div>
          </div>
        )}
        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button type="submit" className="btn btn-primary">Zapisz</button>
        </div>
      </form>
    </Modal>
  );
}

// D4: podgląd i edycja zapisów do dyskusji w PRZYSZŁYCH punktach (bez ich otwierania).
// Operator widzi kto się zapisał, może usunąć wpis, włączyć zapisy/widoczność i ustawić limit.
function FutureSignupsPanel({
  agenda, speakerLists, currentItemId, act, participants,
}: {
  agenda: { id: string; number: string; title: string; status: string; unnumbered?: boolean }[];
  speakerLists: NonNullable<MeetingClientState["speakerLists"]>;
  currentItemId: string | null;
  act: (path: string, body?: Record<string, unknown>, confirm?: ConfirmOptions, method?: string, success?: string) => void;
  participants: { userId: string; name: string; hasVotingRight: boolean }[];
}) {
  const [open, setOpen] = useState(false);

  const future = agenda.filter((a) => a.status === "PENDING" && a.id !== currentItemId);
  const listByItem = new Map(speakerLists.filter((l) => l.agendaItemId).map((l) => [l.agendaItemId as string, l]));
  const relevant = future.filter((a) => listByItem.has(a.id));

  if (relevant.length === 0) return null;
  const totalSignups = relevant.reduce((n, a) => n + (listByItem.get(a.id)?.entries.filter((e) => e.status === "WAITING").length ?? 0), 0);

  return (
    <div className="card">
      <button type="button" className="card-header border-0 w-100 text-start" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="card-title-text">Zapisy do przyszłych punktów{totalSignups > 0 ? ` (${totalSignups})` : ""}</span>
        <span className="text-body-secondary small">{open ? "Zwiń ▴" : "Rozwiń ▾"}</span>
      </button>
      <div className={`collapse${open ? " show" : ""}`}>
        <ul className="list-group list-group-flush">
          {relevant.map((a) => {
            const list = listByItem.get(a.id)!;
            return (
              <li key={a.id} className="list-group-item">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                  <div className="fw-medium min-w-0">{a.unnumbered ? a.title : `Pkt ${a.number}. ${a.title}`}</div>
                  <div className="d-flex align-items-center gap-3 small">
                    <div className="form-check mb-0">
                      <input className="form-check-input" type="checkbox" id={`fs-self-${list.id}`} checked={list.selfSignupEnabled} onChange={(e) => act(`/api/speakerlists/${list.id}`, { selfSignupEnabled: e.target.checked }, undefined, "PATCH")} />
                      <label className="form-check-label" htmlFor={`fs-self-${list.id}`}>zapisy</label>
                    </div>
                    <div className="form-check mb-0">
                      <input className="form-check-input" type="checkbox" id={`fs-vis-${list.id}`} checked={list.visibleToParticipants} onChange={(e) => act(`/api/speakerlists/${list.id}`, { visibleToParticipants: e.target.checked }, undefined, "PATCH")} />
                      <label className="form-check-label" htmlFor={`fs-vis-${list.id}`}>widoczna</label>
                    </div>
                  </div>
                </div>
                <FutureSignupList list={list} participants={participants} act={act} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// Zapisy jednego przyszłego punktu: osoby w aktualnej kolejności (priorytetowe wg kolejki),
// usuwanie zapisu i dotychczasowe dopisywanie (zwykły / priorytet). Wspólne dla zwijanej karty
// "Zapisy do przyszłych punktów" i okna "Zapisani" przy punkcie porządku obrad.
function FutureSignupList({ list, participants, act }: {
  list: NonNullable<MeetingClientState["speakerLists"]>[number];
  participants: { userId: string; name: string; hasVotingRight: boolean }[];
  act: (path: string, body?: Record<string, unknown>, confirm?: ConfirmOptions, method?: string, success?: string) => void;
}) {
  const waiting = list.entries.filter((e) => e.status === "WAITING").sort((x, y) => x.order - y.order);
  return (
    <>
      {waiting.length === 0 ? (
        <div className="small mb-2 text-body-secondary">Brak zapisanych.</div>
      ) : (
        <ol className="list-unstyled d-flex flex-column gap-1 mb-2" aria-label="Zapisani do punktu (w kolejności)">
          {waiting.map((e, i) => (
            <li key={e.id} className="d-flex align-items-center justify-content-between gap-2">
              <span className="text-truncate">
                <span className="row-num mono small">{i + 1}.</span> {e.userName}
                {e.groupShort && <span className="small text-body-secondary"> ({e.groupShort})</span>}
                {e.priority && <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle ms-1">Priorytet</span>}
              </span>
              <button className="btn btn-sm btn-outline-danger" onClick={() => act(`/api/speaker-entries/${e.id}/withdraw`, undefined, { title: "Usunąć zapis?", message: `Czy na pewno chcesz usunąć ${e.userName} z listy zapisanych?`, confirmLabel: "Usuń", danger: true }, "POST", "Zapis został usunięty.")}>Usuń</button>
            </li>
          ))}
        </ol>
      )}
      <AddToListRow listId={list.id} participants={participants} act={act} />
    </>
  );
}

// Wiersz dopisania uczestnika do listy mówców (przyszły punkt lub wnioski formalne).
function AddToListRow({ listId, participants, act }: {
  listId: string;
  participants: { userId: string; name: string; hasVotingRight: boolean }[];
  act: (path: string, body?: Record<string, unknown>, confirm?: ConfirmOptions, method?: string, success?: string) => void;
}) {
  const [userId, setUserId] = useState("");
  return (
    <div className="input-group input-group-sm">
      <select className="form-select" aria-label="Uczestnik do dopisania" value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">Dopisz uczestnika…</option>
        {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}{!p.hasVotingRight && " (bez prawa)"}</option>)}
      </select>
      <button className="btn" disabled={!userId} onClick={() => { act(`/api/speakerlists/${listId}/entries`, { userId, entryType: "REGULAR" }, undefined, "POST", "Zapis został dodany."); setUserId(""); }}>Zwykły</button>
      <button className="btn btn-outline-success" disabled={!userId} onClick={() => { act(`/api/speakerlists/${listId}/entries`, { userId, entryType: "REGULAR", priority: true }, undefined, "POST", "Zapis z priorytetem został dodany."); setUserId(""); }}>Priorytet</button>
    </div>
  );
}

// T9: import głosowań z tekstu (linia = tytuł) ze wspólnymi ustawieniami dla wszystkich.
function BulkImportModal({ meetingId, agenda, onClose, onDone }: {
  meetingId: string;
  agenda: { id: string; number: string; title: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"text" | "agenda">("text");
  const [text, setText] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const [visibility, setVisibility] = useState<"OPEN" | "SECRET">("OPEN");
  const [majorityKind, setMajorityKind] = useState<MajorityKind>("SIMPLE");
  const [majorityBase, setMajorityBase] = useState<MajorityBase>("OF_VOTERS");
  const [voteType, setVoteType] = useState<"STANDARD" | "QUORUM">("STANDARD");
  const [agendaItemId, setAgendaItemId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setBusy(true); setError(null);
    const url = mode === "text" ? `/api/meetings/${meetingId}/votes/bulk` : `/api/meetings/${meetingId}/votes/bulk-by-agenda`;
    const body = mode === "text"
      ? { text, type: "STANDARD", visibility, majorityKind, majorityBase, adHoc: agendaItemId === "", agendaItemId: agendaItemId || null }
      : { agendaItemIds: Array.from(selectedItems), type: voteType, visibility, majorityKind, majorityBase };
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) { setError(await readUserError(r)); return; }
    onDone();
  };

  return (
    <Modal
      title="Hurtowe tworzenie głosowań"
      onClose={onClose}
      closeOnBackdrop={false}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Anuluj</button>
          {mode === "text" ? (
            <button className="btn btn-primary" onClick={submit} disabled={busy || lines.length === 0}>
              {busy ? "Tworzę…" : `Importuj ${lines.length} głosowań`}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={busy || selectedItems.size === 0}>
              {busy ? "Tworzę…" : `Utwórz ${selectedItems.size} głosowań`}
            </button>
          )}
        </>
      }
    >
      <div className="d-flex flex-column gap-3">
        <div className="btn-group" role="group" aria-label="Sposób tworzenia">
          <button type="button" className={`btn btn-sm ${mode === "text" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setMode("text")}>Import z tekstu</button>
          <button type="button" className={`btn btn-sm ${mode === "agenda" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setMode("agenda")}>Dla wybranych punktów</button>
        </div>
        <p className="small text-body-secondary mb-0">
          {mode === "text" ? "Jedna linia = jedno głosowanie." : "Po jednym głosowaniu na każdy zaznaczony punkt, z nazwą punktu."}
          {" "}Ustawienia poniżej dotyczą wszystkich utworzonych głosowań.
        </p>
        {mode === "text" ? (
          <div>
            <textarea
              className="form-control" rows={8}
              aria-label="Tytuły głosowań"
              placeholder={"np.\nUchwała w sprawie budżetu\nUchwała w sprawie planu zagospodarowania\nUchwała w sprawie zmiany statutu"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="form-text">Rozpoznano głosowań: <span className="fw-semibold">{lines.length}</span></div>
          </div>
        ) : (
          <>
            <div>
              <div className="list-group overflow-y-auto" style={{ maxHeight: 240 }}>
                {agenda.length === 0 && <div className="list-group-item small text-body-secondary">Brak punktów porządku.</div>}
                {agenda.map((a) => (
                  <label key={a.id} className="list-group-item list-group-item-action d-flex align-items-center gap-2">
                    <input className="form-check-input" type="checkbox" checked={selectedItems.has(a.id)} onChange={() => toggleItem(a.id)} />
                    <span>{a.number ? `${a.number}. ` : ""}{a.title}</span>
                  </label>
                ))}
              </div>
              <div className="form-text">Zaznaczono punktów: <span className="fw-semibold">{selectedItems.size}</span></div>
            </div>
            <div>
              <label className="form-label" htmlFor="bi-type">Rodzaj głosowania</label>
              <select id="bi-type" className="form-select" value={voteType} onChange={(e) => setVoteType(e.target.value as "STANDARD" | "QUORUM")}>
                <option value="STANDARD">Zwykłe</option>
                <option value="QUORUM">Kworum</option>
              </select>
            </div>
          </>
        )}

        <div className="row g-3">
          <div className="col-12 col-sm-4">
            <label className="form-label" htmlFor="bi-vis">Jawność</label>
            <select id="bi-vis" className="form-select" value={visibility} onChange={(e) => setVisibility(e.target.value as "OPEN" | "SECRET")}>
              <option value="OPEN">Jawne</option>
              <option value="SECRET">Tajne</option>
            </select>
          </div>
          <div className="col-12 col-sm-4">
            <label className="form-label" htmlFor="bi-maj">Rodzaj większości</label>
            <select id="bi-maj" className="form-select" value={majorityKind} onChange={(e) => setMajorityKind(e.target.value as MajorityKind)}>
              <option value="SIMPLE">Zwykła</option>
              <option value="ABSOLUTE">Bezwzględna</option>
              <option value="QUALIFIED_TWO_THIRDS">Kwalifikowana 2/3</option>
              <option value="QUALIFIED_THREE_FIFTHS">Kwalifikowana 3/5</option>
            </select>
          </div>
          <div className="col-12 col-sm-4">
            <label className="form-label" htmlFor="bi-base">Podstawa większości</label>
            <select id="bi-base" className="form-select" value={majorityBase} onChange={(e) => setMajorityBase(e.target.value as MajorityBase)} disabled={majorityKind === "SIMPLE"}>
              <option value="OF_VOTERS">Głosujących</option>
              <option value="OF_PRESENT">Obecnych</option>
              <option value="OF_FULL_BODY">Ustawowego składu</option>
            </select>
          </div>
        </div>

        {mode === "text" && (
          <div>
            <label className="form-label" htmlFor="bi-item">Punkt porządku (opcjonalnie)</label>
            <select id="bi-item" className="form-select" value={agendaItemId} onChange={(e) => setAgendaItemId(e.target.value)}>
              <option value="">Bez punktu (ad hoc)</option>
              {agenda.map((a) => <option key={a.id} value={a.id}>{a.number ? `${a.number}. ` : ""}{a.title}</option>)}
            </select>
          </div>
        )}

        {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
      </div>
    </Modal>
  );
}

function EmailMeetingModal({ meetingId, participants, onClose }: {
  meetingId: string;
  participants: { userId: string; name: string; hasVotingRight: boolean }[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(participants.filter((p) => p.hasVotingRight).map((p) => p.userId)));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [includePublicLink, setIncludePublicLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function submit() {
    setBusy(true); setError(null);
    const r = await fetch(`/api/meetings/${meetingId}/email`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: Array.from(selected), subject, body, includePublicLink }),
    });
    setBusy(false);
    if (!r.ok) { setError(await readUserError(r)); return; }
    onClose();
  }

  return (
    <Modal
      title="Wyślij e-mail do uczestników"
      onClose={onClose}
      closeOnBackdrop={false}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Anuluj</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || selected.size === 0 || !subject.trim() || !body.trim()}>
            {busy ? "Wysyłam…" : "Wyślij"}
          </button>
        </>
      }
    >
      <div className="d-flex flex-column gap-3">
        <div>
          <div className="form-label">Odbiorcy ({selected.size})</div>
          <div className="list-group overflow-y-auto" style={{ maxHeight: 180 }}>
            {participants.map((p) => (
              <label key={p.userId} className="list-group-item list-group-item-action d-flex align-items-center gap-2 py-1">
                <input className="form-check-input" type="checkbox" checked={selected.has(p.userId)} onChange={() => toggle(p.userId)} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="form-label" htmlFor="em-subject">Temat</label>
          <input id="em-subject" className="form-control" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="form-label" htmlFor="em-body">Treść</label>
          <textarea id="em-body" className="form-control" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="form-check">
          <input className="form-check-input" type="checkbox" id="em-public" checked={includePublicLink} onChange={(e) => setIncludePublicLink(e.target.checked)} />
          <label className="form-check-label" htmlFor="em-public">Dołącz link do widoku publicznego (jeśli włączony dla tego posiedzenia)</label>
        </div>
        {error && <div className="alert alert-danger py-2 mb-0">{error}</div>}
      </div>
    </Modal>
  );
}
