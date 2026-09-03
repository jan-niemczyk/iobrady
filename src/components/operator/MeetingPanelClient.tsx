"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useHotkeys } from "@/lib/useHotkeys";
import type { MeetingStatus, VoteStatus, VoteType, VoteVisibility, MajorityType, MajorityKind, MajorityBase, AttendanceMode, AgendaItemStatus, AttendanceStatus, SpeakerStatus, SpeakerEntryType } from "@prisma/client";
import { MEETING_STATUS_LABEL, VOTE_STATUS_LABEL, formatTime, localInputToWarsawISO } from "@/lib/labels";
import { formatMajority } from "@/lib/majority";
import type { QuorumStatus } from "@/lib/quorum";
import { SpeakersPanel } from "@/components/operator/SpeakersPanel";
import { FormalMotionsPanel } from "@/components/operator/FormalMotionsPanel";
import { DiscussionClockPanel } from "@/components/operator/DiscussionClockPanel";
import { AttendanceCheckPanel } from "@/components/operator/AttendanceCheckPanel";
import { DisplayControlPanel } from "@/components/operator/DisplayControlPanel";
import { MeetingSettingsPanel } from "@/components/operator/MeetingSettingsPanel";
import { IconClose, IconChevronDown, IconChevronRight, IconUsers } from "@/components/ui/Icon";
import { downloadReportsPdf, downloadReportsZip, downloadSignatureList, downloadAttendanceMergedList, downloadAttendanceLog, downloadCheckReportPdf } from "@/lib/generatePdf";
import { downloadAgendaPdf, downloadAgendaDocx, downloadProtocolPdf, downloadProtocolDocx, type ProtocolData } from "@/lib/generateProtocol";
import type { ReportData } from "@/lib/reportTypes";

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
  resultPublishedAt: string | null;
  options: VoteOptionState[];
}

export interface MeetingClientState {
  id: string;
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
    holdResults: boolean;
    publishResultsAutomatically: boolean;
  };
  display: {
    mode: string;
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
  counts: { total: number; eligible: number; nonVoting: number; present: number; presentEligible: number };
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
      if (!r.ok) { alert("Nie udało się pobrać danych raportu."); return; }
      const { reports } = await r.json() as { reports: ReportData[] };
      const mtgNo = state.number.replace(/[/\\]/g, "-");
      await downloadReportsPdf(reports, `posiedzenie-${mtgNo}-glosowanie-${voteNumber ?? voteId.slice(-6)}`);
    } catch {
      alert("Błąd generowania PDF.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadAllReports() {
    setPdfBusy("all");
    try {
      const r = await fetch(`/api/meetings/${state.id}/report-data`);
      if (!r.ok) { alert("Nie udało się pobrać danych raportów."); return; }
      const { reports } = await r.json() as { reports: ReportData[] };
      if (reports.length === 0) { alert("Brak zakończonych głosowań do raportu."); return; }
      await downloadReportsPdf(reports, `raporty-posiedzenie-${state.number}`);
    } catch {
      alert("Błąd generowania PDF.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function exportProtocol(kind: "agenda-pdf" | "agenda-docx" | "protocol-pdf" | "protocol-docx") {
    setPdfBusy(kind);
    try {
      const r = await fetch(`/api/meetings/${state.id}/protocol-data`);
      if (!r.ok) { alert("Nie udało się pobrać danych porządku."); return; }
      const data = await r.json() as ProtocolData;
      const base = `porzadek-${state.number}`;
      const baseP = `protokol-${state.number}`;
      if (kind === "agenda-pdf") await downloadAgendaPdf(data, base);
      else if (kind === "agenda-docx") await downloadAgendaDocx(data, base);
      else if (kind === "protocol-pdf") await downloadProtocolPdf(data, baseP);
      else await downloadProtocolDocx(data, baseP);
    } catch {
      alert("Błąd generowania dokumentu.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadSignatureListPdf() {
    setPdfBusy("signature");
    try {
      const r = await fetch(`/api/meetings/${state.id}/signature-list`);
      if (!r.ok) { alert("Nie udało się pobrać danych do listy podpisów."); return; }
      const data = await r.json();
      await downloadSignatureList(data, `lista-obecnosci-podpis-${state.number}`);
    } catch {
      alert("Błąd generowania PDF.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadAttendanceMerged() {
    setPdfBusy("att-merged");
    try {
      const r = await fetch(`/api/meetings/${state.id}/attendance-log`);
      if (!r.ok) { alert("Nie udało się pobrać danych obecności."); return; }
      const data = await r.json();
      await downloadAttendanceMergedList(data, `lista-obecnosci-${state.number}`);
    } catch {
      alert("Błąd generowania PDF.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadAttendanceLogPdf() {
    setPdfBusy("att-log");
    try {
      const r = await fetch(`/api/meetings/${state.id}/attendance-log`);
      if (!r.ok) { alert("Nie udało się pobrać danych obecności."); return; }
      const data = await r.json();
      await downloadAttendanceLog(data, `raport-obecnosci-${state.number}`);
    } catch {
      alert("Błąd generowania PDF.");
    } finally {
      setPdfBusy(null);
    }
  }

  async function downloadCheckReport(checkId: string) {
    try {
      const r = await fetch(`/api/meetings/${state.id}/attendance-report?check=${checkId}`);
      if (!r.ok) { alert("Nie udało się pobrać danych obecności."); return; }
      const { report } = await r.json();
      if (!report) { alert("Brak danych tego sprawdzenia."); return; }
      await downloadCheckReportPdf(report, `obecnosc-${state.number}-${checkId.slice(-6)}`);
    } catch {
      alert("Błąd generowania PDF.");
    }
  }

  async function downloadAllReportsZip() {
    setPdfBusy("zip");
    try {
      const r = await fetch(`/api/meetings/${state.id}/report-data`);
      if (!r.ok) { alert("Nie udało się pobrać danych raportów."); return; }
      const { reports } = await r.json() as { reports: ReportData[] };
      if (reports.length === 0) { alert("Brak zakończonych głosowań do raportu."); return; }
      await downloadReportsZip(reports, `raporty-posiedzenie-${state.number}`);
    } catch {
      alert("Błąd generowania ZIP.");
    } finally {
      setPdfBusy(null);
    }
  }
  // Punkt do którego planujemy głosowanie (gdy composerMode === "plan")
  const [planningItem, setPlanningItem] = useState<{ id: string; title: string } | null>(null);
  const [editingMeeting, setEditingMeeting] = useState(false);

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

  function act(path: string, body?: Record<string, unknown>, confirmMsg?: string, method: string = "POST") {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    startTransition(async () => {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
      });
      if (!r.ok) { alert(`Błąd: ${await r.text()}`); return; }
      await refetch();
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
      action: () => { if (activeVote && window.confirm("Zamknąć trwające głosowanie?")) { setJustClosedId(activeVote.id); act(`/api/votes/${activeVote.id}/close`); } },
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
      action: () => { if (currentItem && window.confirm("Zakończyć bieżący punkt?")) act(`/api/agenda/${currentItem.id}/complete`); },
    },
    {
      key: "n",
      enabled: !pending && !activeVote,
      description: "Otwórz następny punkt porządku",
      action: () => {
        // Następny = pierwszy oczekujący (PENDING) w kolejności, inny niż bieżący.
        const next = state.agenda.find((a) => a.status === "PENDING" && a.id !== state.currentAgendaItemId);
        if (next) act(`/api/agenda/${next.id}/start`);
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
      <li key={v.id} className="px-5 py-3 flex flex-col gap-2" style={isCurrentItem ? { background: "var(--color-accent-bg, rgba(180,140,20,0.08))", borderLeft: "3px solid var(--color-accent)" } : undefined}>
                    <div className="min-w-0 flex items-start gap-3">
                      {v.number != null && (
                        <span className="mono text-xs shrink-0 mt-0.5" style={{ color: "var(--color-ink-3)", minWidth: 28 }}>#{v.number}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium" style={{ overflowWrap: "anywhere" }}>
                          {isCurrentItem && <span className="pill" style={{ fontSize: 9, padding: "1px 6px", marginRight: 6, background: "var(--color-accent)", color: "#fff" }}>BIEŻĄCY PUNKT</span>}
                          {v.title}
                        </div>
                        {v.description && (
                          <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-2)", overflowWrap: "anywhere" }}>{v.description}</div>
                        )}
                        <div className="eyebrow mt-0.5">
                          {v.visibility === "OPEN" ? "Jawne" : "Tajne"} - {labelForType(v.type)} - {VOTE_STATUS_LABEL[v.status]}
                          {v.status === "CLOSED" && v.type !== "LIST" && v.type !== "QUORUM" && v.type !== "PACKAGE" && (
                            <span style={{ color: v.resultPassed ? "var(--color-yes)" : "var(--color-no)", fontWeight: 700 }}>
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
                            <span style={{ color: v.resultPassed ? "var(--color-yes)" : "var(--color-no)", fontWeight: 700 }}>
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
                    <div className="flex items-center gap-2 flex-wrap pl-0">
                      {v.status === "READY" && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                          disabled={pending || !!activeVote}
                          onClick={() => act(`/api/votes/${v.id}/open`)}
                          title={activeVote ? "Inne głosowanie jest w toku" : "Otwórz to głosowanie"}
                        >
                          Otwórz
                        </button>
                      )}
                      {(v.status === "CLOSED" || v.status === "INTERRUPTED") && (
                        <>
                          <button
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            disabled={pdfBusy === v.id}
                            onClick={() => downloadOneReport(v.id, v.number)}
                            title="Pobierz raport PDF"
                          >
                            {pdfBusy === v.id ? "…" : "Raport PDF"}
                          </button>
                          <a href={`/api/votes/${v.id}/report.csv`} className="btn" style={{ padding: "4px 8px", fontSize: 11 }} title="Pobierz CSV">
                            CSV
                          </a>
                          {v.type !== "QUORUM" && (
                            <button
                              className="btn"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                              disabled={pending}
                              onClick={() => {
                                if (!window.confirm("Odświeżyć obecność w wydruku tego głosowania na podstawie bieżącego stanu obecności?\n\nUżyj po korekcie/usunięciu błędnej migawki, aby ktoś obecny (a niegłosujący) nie był pokazany jako nieobecny.")) return;
                                act(`/api/votes/${v.id}/recompute-roster`, undefined, undefined, "POST");
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
                          className="btn"
                          style={{ padding: "4px 8px", fontSize: 11 }}
                          disabled={pending}
                          onClick={() => setRecomputeVote(v)}
                          title="Przelicz wynik po korekcie zadeklarowanej większości"
                        >
                          Przelicz
                        </button>
                      )}
                      <button
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        disabled={pending}
                        onClick={() => { setReasumpcjaFrom(v); setComposerMode("adhoc"); }}
                        title="Reasumpcja - utwórz nowe głosowanie z takimi samymi ustawieniami"
                      >
                        Reasumpcja
                      </button>
                      {v.status === "READY" && (
                        <button
                          className="btn"
                          style={{ padding: "4px 8px", fontSize: 11 }}
                          disabled={pending}
                          onClick={() => setEditComposerVote(v)}
                          title="Edytuj głosowanie przed rozpoczęciem (typ, opcje, większość, PIN)"
                        >
                          Edytuj
                        </button>
                      )}
                      <button
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        disabled={pending}
                        onClick={() => renameVote(v.id, v.title, v.adHoc, v.contextLabel)}
                        title="Zmień nazwę głosowania (można także po zamknięciu)"
                      >
                        Zmień nazwę
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: 11, color: "var(--color-no)" }}
                        disabled={pending}
                        onClick={() => act(`/api/votes/${v.id}`, undefined, `Usunąć głosowanie "${v.title}"? Tego nie można cofnąć.`, "DELETE")}
                        title="Usuń głosowanie"
                      >
                        Usuń
                      </button>
                    </div>
      </li>
    );
  }

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      {/* HEADER */}
      <header className="flex items-end justify-between border-b border-[var(--color-rule)] pb-5 mb-6">
        <div>
          <div className="eyebrow mb-2 flex items-center gap-3">
            <span>Posiedzenie nr <span className="mono">{state.number}</span></span>
            <span>-</span>
            <span>{formatTime(state.scheduledAt)}</span>
          </div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>{state.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {live && <span className="pill pill-live">Na żywo</span>}
          <span className="pill pill-neutral">{MEETING_STATUS_LABEL[state.status]}</span>

          {/* Raporty */}
          <div className="relative">
            <details className="inline-block">
              <summary className="btn cursor-pointer list-none" style={{ userSelect: "none" }}>Raporty ▾</summary>
              <div className="absolute right-0 mt-1 card no-grid z-20" style={{ minWidth: 280, background: "#FFFFFF" }}>
                <a className="block px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" href={`/display/${state.id}`} target="_blank" rel="noreferrer">
                  <div>Widok publiczny (ekran świetlny)</div>
                </a>
                <a className="block px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" href={`/overlay/${state.id}`} target="_blank" rel="noreferrer">
                  <div>Nakładka na transmisję (OBS)</div>
                </a>
                <a className="block px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" href={`/chairperson/${state.id}`} target="_blank" rel="noreferrer">
                  <div>Widok przewodniczącego</div>
                </a>
                <a className="block px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" href={`/meetings/${state.id}/protocol`} target="_blank" rel="noreferrer">
                  <div>Protokół posiedzenia</div>
                </a>
                <button
                  type="button"
                  className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]"
                  disabled={pdfBusy === "att-merged"}
                  onClick={downloadAttendanceMerged}
                >
                  <div>{pdfBusy === "att-merged" ? "Generowanie…" : "Lista obecności (PDF)"}</div>
                </button>
                <button
                  type="button"
                  className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]"
                  disabled={pdfBusy === "att-log"}
                  onClick={downloadAttendanceLogPdf}
                >
                  <div>{pdfBusy === "att-log" ? "Generowanie…" : "Raport obecności (PDF)"}</div>
                </button>
                <button
                  type="button"
                  className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]"
                  disabled={pdfBusy === "signature"}
                  onClick={downloadSignatureListPdf}
                >
                  <div>{pdfBusy === "signature" ? "Generowanie…" : "Lista obecności do podpisu (PDF)"}</div>
                </button>
                <div className="px-4 py-1 text-xs font-semibold" style={{ color: "var(--color-ink-3)", background: "var(--color-paper-2)" }}>Porządek i protokół</div>
                <button type="button" className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" disabled={pdfBusy === "agenda-pdf"} onClick={() => exportProtocol("agenda-pdf")}>
                  <div>{pdfBusy === "agenda-pdf" ? "Generowanie…" : "Porządek obrad (PDF)"}</div>
                </button>
                <button type="button" className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" disabled={pdfBusy === "agenda-docx"} onClick={() => exportProtocol("agenda-docx")}>
                  <div>{pdfBusy === "agenda-docx" ? "Generowanie…" : "Porządek obrad (DOCX)"}</div>
                </button>
                <button type="button" className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" disabled={pdfBusy === "protocol-pdf"} onClick={() => exportProtocol("protocol-pdf")}>
                  <div>{pdfBusy === "protocol-pdf" ? "Generowanie…" : "Protokół - projekt (PDF)"}</div>
                </button>
                <button type="button" className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" disabled={pdfBusy === "protocol-docx"} onClick={() => exportProtocol("protocol-docx")}>
                  <div>{pdfBusy === "protocol-docx" ? "Generowanie…" : "Protokół - projekt (DOCX)"}</div>
                </button>
                <button
                  type="button"
                  className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]"
                  disabled={pdfBusy === "all"}
                  onClick={downloadAllReports}
                >
                  <div>{pdfBusy === "all" ? "Generowanie…" : "Wszystkie raporty - jeden plik PDF"}</div>
                </button>
                <button
                  type="button"
                  className="block w-full text-left px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]"
                  disabled={pdfBusy === "zip"}
                  onClick={downloadAllReportsZip}
                >
                  <div>{pdfBusy === "zip" ? "Pakowanie…" : "Wszystkie raporty - ZIP (osobne pliki)"}</div>
                </button>
                <a className="block px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" href={`/api/meetings/${state.id}/reports/attendance.csv`}>
                  <div>Lista obecności (CSV)</div>
                </a>
                <a className="block px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm border-b border-[var(--color-rule-soft)]" href={`/api/meetings/${state.id}/reports/votes.csv`}>
                  <div>Zestawienie głosowań (CSV)</div>
                </a>
                <a className="block px-4 py-2 hover:bg-[var(--color-paper-2)] text-sm" href={`/api/audit/csv?meeting=${state.id}`}>
                  <div>Rejestr czynności (CSV)</div>
                </a>
              </div>
            </details>
          </div>

          <button
            className="btn"
            disabled={pending}
            onClick={() => setEditingMeeting(true)}
            title="Edytuj nazwę / numer / datę"
          >
            Edytuj
          </button>

          {state.status === "PREPARED" && (
            <button className="btn btn-primary" disabled={pending} onClick={() => act(`/api/meetings/${state.id}/open`)}>
              Otwórz posiedzenie
            </button>
          )}
          {(state.status === "OPEN" || state.status === "IN_PROGRESS") && (
            <button className="btn btn-danger" disabled={pending} onClick={() => act(`/api/meetings/${state.id}/close`, {}, "Zamknąć posiedzenie? Można cofnąć.")}>
              Zamknij posiedzenie
            </button>
          )}
          {state.status === "CLOSED" && (
            <button
              className="btn"
              disabled={pending}
              onClick={() => act(`/api/meetings/${state.id}/reopen`, {}, "Cofnąć zakończenie i wznowić posiedzenie?")}
            >
              Cofnij zakończenie
            </button>
          )}
          {state.status !== "OPEN" && state.status !== "IN_PROGRESS" && (
            <button
              className="btn"
              style={{ color: "var(--color-no)", borderColor: "var(--color-no)" }}
              disabled={pending}
              onClick={async () => {
                if (!window.confirm(`Trwale usunąć posiedzenie „${state.name}"? Usunięte zostaną wszystkie głosowania, obecność i historia. Tej operacji NIE można cofnąć.`)) return;
                if (!window.confirm("Na pewno? To ostateczne.")) return;
                const r = await fetch(`/api/meetings/${state.id}`, { method: "DELETE" });
                if (r.ok) window.location.href = "/meetings";
                else alert(await r.text());
              }}
            >
              Usuń trwale
            </button>
          )}
        </div>
      </header>

      {/* STAT ROW */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px mb-6 border border-[var(--color-rule)] bg-[var(--color-rule)]" style={{ overflow: "hidden" }}>
        <StatCell label="Uczestnicy" value={state.counts.eligible} sub="z prawem głosu" />
        <StatCell label="Obecni" value={state.counts.presentEligible} sub="z prawem głosu" highlight />
        <StatCell label="Online" value={state.participants.filter((p) => p.online).length} sub="połączeni" />
        <QuorumCell quorum={state.quorum} />
      </section>
      <OnlineList participants={state.participants} />

      {/* GRID 12 COL */}
      <div className="grid grid-cols-12 gap-4">

        {/* LEFT */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <div className="card">
            <SectionHeader title="Aktualny punkt" />
            <div className="p-5">
              {currentItem ? (
                <>
                  {!currentItem.unnumbered && <div className="eyebrow mb-2">Pkt <span className="mono">{currentItem.number}</span></div>}
                  <h3 style={{ fontSize: 20, lineHeight: 1.2 }}>{currentItem.title}</h3>
                  <div className="mt-4 flex gap-2 flex-wrap">
                    <button className="btn" onClick={() => act(`/api/agenda/${currentItem.id}/complete`)}>Zakończ punkt</button>
                    <button className="btn" onClick={() => act(`/api/agenda/${currentItem.id}/pause`, undefined, "Zawiesić punkt? Będzie można do niego wrócić.")}>
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
                <div style={{ color: "var(--color-ink-3)" }} className="text-sm">
                  Żaden punkt nie jest rozpatrywany. Wybierz punkt z porządku obrad poniżej.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <SectionHeader
              title="Porządek obrad"
              right={
                <div className="flex items-center gap-2">
                  <span className="eyebrow">{state.agenda.length} pkt</span>
                  <a href={`/meetings/${state.id}/agenda`} className="btn" style={{ padding: "4px 8px", fontSize: 11 }}>
                    Edytuj
                  </a>
                </div>
              }
            />
            <ol className="divide-y divide-[var(--color-rule-soft)]">
              {state.agenda.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  {/* Nazwa punktu - pełna szerokość u góry (czytelna, nieściśnięta) */}
                  <div className="flex items-start gap-3 min-w-0 mb-2">
                    <span className="mono text-xs mt-0.5 shrink-0" style={{ color: "var(--color-ink-3)", width: 32 }}>{a.unnumbered ? "-" : a.number}</span>
                    <span className="text-sm flex-1" style={{ overflowWrap: "anywhere" }}>{a.title}</span>
                    <AgendaStatusPill status={a.status} />
                  </div>
                  {/* Przyciski akcji - w rzędzie pod nazwą, wszystkie widoczne */}
                  <div className="flex items-center gap-2 flex-wrap" style={{ paddingLeft: 44 }}>
                    {state.status !== "CLOSED" && (() => {
                      const sl = state.speakerLists?.find((x) => x.agendaItemId === a.id);
                      const on = sl?.selfSignupEnabled ?? false;
                      return (
                        <button
                          className="btn"
                          style={{ padding: "4px 8px", fontSize: 11, ...(on ? { borderColor: "var(--color-seal)", color: "var(--color-seal)" } : {}) }}
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
                    {a.status !== "COMPLETED" && state.status !== "CLOSED" && (
                      <button
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: 11 }}
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
                        className="btn"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        onClick={() =>
                          act(`/api/agenda/${a.id}/start`, undefined,
                            a.status === "COMPLETED"
                              ? "Punkt został już zakończony. Otworzyć go ponownie? Punkty zakończone wcześniej można zakończyć ponownie po skończeniu pracy."
                              : undefined)
                        }
                      >
                        {a.status === "PAUSED" ? "Wznów" : a.status === "COMPLETED" ? "Otwórz ponownie" : "Rozpocznij"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* MIDDLE - głosowanie */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          {activeVote ? (
            <ActiveVotePanel
              vote={activeVote}
              onClose={() => { setJustClosedId(activeVote.id); act(`/api/votes/${activeVote.id}/close`); }}
              onInterrupt={() => act(`/api/votes/${activeVote.id}/interrupt`, {}, "Przerwać głosowanie?")}
              onCancel={() => act(`/api/votes/${activeVote.id}/cancel`, {}, "Anulować głosowanie? Wyniki zostaną odrzucone.")}
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
                      className="btn"
                      style={{ padding: "6px 10px", fontSize: 12 }}
                      onClick={() => setComposerMode("adhoc")}
                    >
                      + Nowe ad hoc
                    </button>
                  )
                }
              />
              <div className="p-8 text-center" style={{ color: "var(--color-ink-3)" }}>
                <p className="mb-4 text-sm">Brak aktywnego głosowania.</p>
                <p className="text-xs">
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
                <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setImportOpen(true)}>
                  Importuj z tekstu
                </button>
              )}
            />
            {allVotes.length === 0 ? (
              <div className="px-5 py-6 text-sm" style={{ color: "var(--color-ink-3)" }}>Brak.</div>
            ) : (
              <ul className="divide-y divide-[var(--color-rule-soft)] max-h-[600px] overflow-y-auto">
                {plannedVotes.length > 0 && (
                  <li className="px-5 py-2 text-xs font-semibold sticky top-0 z-10" style={{ background: "var(--color-paper-2)", color: "var(--color-ink-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Zaplanowane ({plannedVotes.length})
                  </li>
                )}
                {plannedVotes.map((v) => voteRow(v))}
                {doneVotes.length > 0 && (
                  <li className="px-5 py-2 text-xs font-semibold sticky top-0 z-10" style={{ background: "var(--color-paper-2)", color: "var(--color-ink-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
        <div className="col-span-12 lg:col-span-3 space-y-4">
          {/* Sterowanie widokiem prezentacyjnym */}
          <DisplayControlPanel
            meetingId={state.id}
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
        </div>
      </div>

      {/* Composer głosowania (modal) */}
      {resultsModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { act(`/api/meetings/${state.id}/display`, { displayPinnedVoteId: null, displayMode: "AUTO" }, undefined, "PATCH"); setResultsModal(null); }}>
          <div className="card" style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-[var(--color-rule-soft)] flex items-center justify-between" style={{ flexShrink: 0 }}>
              <h3 className="eyebrow" style={{ margin: 0 }}>Wynik głosowania</h3>
              <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>nr {resultsModal.number ?? "-"}</span>
            </div>
            <div className="p-5" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              <div className="text-xs mb-1" style={{ color: "var(--color-ink-3)" }}>{labelForType(resultsModal.type)}</div>
              <div className="text-sm font-medium mb-3">{resultsModal.title}</div>

              {resultsModal.type === "QUORUM" ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: "var(--color-ink)" }}>Sprawdzenie kworum</div>
                  <div className="text-sm">Potwierdziło obecność: <strong>{resultsModal.resultCastCount ?? 0}</strong> z {resultsModal.resultEligibleCount ?? 0} uprawnionych</div>
                </>
              ) : resultsModal.type === "LIST" ? (
                <>
                  <div className="text-xs mb-2" style={{ color: "var(--color-ink-3)" }}>Liczba głosów na kandydata:</div>
                  <div className="space-y-1">
                    {[...resultsModal.options].sort((a, b) => (b.resultCount ?? 0) - (a.resultCount ?? 0)).map((o) => (
                      <div key={o.id} className="flex items-center justify-between px-3 py-1.5" style={{ border: "1px solid var(--color-rule-soft)" }}>
                        <span className="text-sm">{o.label}</span>
                        <span className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>{o.resultCount ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : resultsModal.type === "PACKAGE" ? (
                <>
                  <div className="text-xs mb-2" style={{ color: "var(--color-ink-3)" }}>Wyniki per pozycja:</div>
                  <div className="space-y-1">
                    {resultsModal.options.map((o, i) => (
                      <div key={o.id} className="px-3 py-1.5" style={{ border: "1px solid var(--color-rule-soft)" }}>
                        <div className="text-sm font-medium">{o.positionNumber ?? i + 1}. {o.label}</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>
                          <span style={{ color: "var(--color-yes)" }}>za {o.packageYes ?? 0}</span>{"  "}
                          <span style={{ color: "var(--color-no)" }}>przeciw {o.packageNo ?? 0}</span>{"  "}
                          <span style={{ color: "var(--color-abstain)" }}>wstrzym. {o.packageAbstain ?? 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {resultsModal.resultPassed !== null && (
                    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, color: resultsModal.resultPassed ? "var(--color-yes)" : "var(--color-no)" }}>
                      {resultsModal.resultPassed ? "Przyjęto" : "Odrzucono"}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-3" style={{ border: "1px solid var(--color-rule-soft)" }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--color-yes)" }}>{resultsModal.resultYes ?? 0}</div>
                      <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>Za</div>
                    </div>
                    <div className="p-3" style={{ border: "1px solid var(--color-rule-soft)" }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--color-no)" }}>{resultsModal.resultNo ?? 0}</div>
                      <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>Przeciw</div>
                    </div>
                    <div className="p-3" style={{ border: "1px solid var(--color-rule-soft)" }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--color-abstain)" }}>{resultsModal.resultAbstain ?? 0}</div>
                      <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>Wstrzym.</div>
                    </div>
                  </div>
                </>
              )}

              <div className="text-xs mt-3" style={{ color: "var(--color-ink-3)" }}>
                {resultsModal.type === "QUORUM" ? "Potwierdziło" : "Głosowało"} {resultsModal.resultCastCount ?? 0} z {resultsModal.resultEligibleCount ?? 0} uprawnionych
              </div>

              {/* Przełączanie stron na PREZENTACJI - dostępne wprost w oknie wyników, bo gdy wynik
                  jest wpięty jako komunikat, strzałki panelu prezentacji bywają zasłonięte. */}
              {(resultsModal.type === "LIST" || resultsModal.type === "PACKAGE") && resultsModal.options.length > (resultsModal.type === "PACKAGE" ? 6 : 12) && (
                <div className="flex items-center justify-center gap-3 mt-4 pt-3 border-t border-[var(--color-rule-soft)]">
                  <button
                    className="btn"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    disabled={pending}
                    onClick={() => act(`/api/meetings/${state.id}/display`, { displayCandidatePage: Math.max(0, (state.display?.candidatePage ?? 0) - 1) }, undefined, "PATCH")}
                  >← poprzednia strona</button>
                  <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>strona {(state.display?.candidatePage ?? 0) + 1}</span>
                  <button
                    className="btn"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    disabled={pending}
                    onClick={() => {
                      const maxPage = resultsModal.type === "PACKAGE" ? Math.max(0, Math.ceil(resultsModal.options.length / 6) - 1) : resultsModal.options.length - 1;
                      act(`/api/meetings/${state.id}/display`, { displayCandidatePage: Math.min(maxPage, (state.display?.candidatePage ?? 0) + 1) }, undefined, "PATCH");
                    }}
                  >następna strona →</button>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[var(--color-rule-soft)]" style={{ flexShrink: 0 }}>
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  // "Zamknij" chowa wynik z prezentacji (odpina). Wynik pojawił się tam automatycznie
                  // po zakończeniu głosowania - operator go tu tylko zamyka/ukrywa.
                  act(`/api/meetings/${state.id}/display`, { displayPinnedVoteId: null, displayMode: "AUTO" }, undefined, "PATCH");
                  setResultsModal(null);
                }}
              >
                Zamknij (ukryj z prezentacji)
              </button>
            </div>
          </div>
        </div>
      )}

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

  return (
    <div className="card" style={{ borderColor: "var(--color-live)", borderWidth: 2 }}>
      <SectionHeader title="Trwa głosowanie" tone="live" />
      <div className="p-6">
        <div className="eyebrow mb-2 flex flex-wrap items-center gap-2">
          <span>{vote.visibility === "OPEN" ? "Jawne" : "Tajne"}</span>
          <span>-</span>
          <span>{labelForType(vote.type)}</span>
          <span>-</span>
          <span>{formatMajority(vote.majorityKind, vote.majorityBase)}</span>
        </div>
        <h3 style={{ fontSize: 22, lineHeight: 1.2 }}>{vote.title}</h3>

        {vote.pinRequired && vote.pinCode && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-2" style={{ background: "rgba(27,79,183,0.10)", border: "1px solid rgba(27,79,183,0.35)", borderRadius: 6 }}>
            <span className="eyebrow" style={{ color: "var(--color-seal)" }}>PIN głosowania</span>
            <span className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.25em", color: "var(--color-seal)" }}>{vote.pinCode}</span>
          </div>
        )}

        {/* Pasek postępu - ile osób zagłosowało (dla kworum: w stosunku do uprawnionych) */}
        <div className="mt-4 mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="eyebrow">{vote.type === "QUORUM" ? "Potwierdziło obecność" : "Oddało głos"}</span>
            <span className="mono">
              <span style={{ color: "var(--color-ink)" }}>{counter?.castCount ?? "-"}</span>
              <span style={{ color: "var(--color-ink-3)" }}>
                {" / "}
                {vote.type === "QUORUM"
                  ? (vote.resultEligibleCount ?? "?")
                  : (vote.resultPresentCount ?? "?")}
              </span>
            </span>
          </div>
          <div style={{ background: "var(--color-paper-2)", height: 6, borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              background: "var(--color-ink)",
              height: "100%",
              width: (() => {
                if (!counter) return "0%";
                const denom = vote.type === "QUORUM"
                  ? (vote.resultEligibleCount ?? 1)
                  : (vote.resultPresentCount ?? 1);
                return `${Math.min(100, (counter.castCount / Math.max(1, denom)) * 100)}%`;
              })(),
              transition: "width 300ms ease",
            }} />
          </div>
        </div>

        {/* Liczniki */}
        {vote.type === "QUORUM" ? (
          <div className="border border-[var(--color-rule)] p-6 text-center bg-white">
            <div className="eyebrow mb-1">Liczba potwierdzeń obecności</div>
            <div className="num" style={{ fontSize: 56, color: "var(--color-yes)", lineHeight: 1 }}>
              {counter?.castCount ?? "-"}
            </div>
            <div className="text-xs mt-2" style={{ color: "var(--color-ink-3)" }}>
              z {vote.resultEligibleCount ?? "?"} uprawnionych
            </div>
          </div>
        ) : vote.type === "PACKAGE" ? (
          <div className="border border-[var(--color-rule)]">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-px bg-[var(--color-rule)]">
              <div className="bg-[var(--color-paper-2)] px-3 py-2 text-xs eyebrow">Pozycja</div>
              <div className="bg-[var(--color-paper-2)] px-3 py-2 text-xs eyebrow text-center" style={{ minWidth: 56 }}>Za</div>
              <div className="bg-[var(--color-paper-2)] px-3 py-2 text-xs eyebrow text-center" style={{ minWidth: 56 }}>Przeciw</div>
              <div className="bg-[var(--color-paper-2)] px-3 py-2 text-xs eyebrow text-center" style={{ minWidth: 56 }}>Wstrz.</div>
              {(counter?.packageOptions ?? vote.options.map((o) => ({ id: o.id, label: o.label, yes: 0, no: 0, abstain: 0 }))).map((o, i) => (
                <PackageCounterRow key={o.id} idx={i} label={o.label} yes={counter ? o.yes : null} no={counter ? o.no : null} abstain={counter ? o.abstain : null} />
              ))}
            </div>
          </div>
        ) : !isList ? (
          <div className="grid grid-cols-3 gap-px bg-[var(--color-rule)] border border-[var(--color-rule)]">
            <BallotCounter label="Za" color="yes" value={counter?.yes} />
            <BallotCounter label="Przeciw" color="no" value={counter?.no} />
            <BallotCounter label="Wstrzymał się" color="abstain" value={counter?.abstain} />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-rule-soft)] border border-[var(--color-rule)]">
            {(counter?.perOption ?? vote.options.map((o) => ({ id: o.id, label: o.label, count: 0 }))).map((o, i) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-2 bg-white">
                <span className="text-sm"><span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>{i + 1}.</span>{o.label}</span>
                <span className="num text-base">{counter ? o.count : "-"}</span>
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

        <div className="mt-6 flex gap-2 flex-wrap">
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

  return (
    <div className="mt-4 p-3 border border-[var(--color-rule-soft)] bg-[var(--color-paper-2)]">
      <button
        type="button"
        className="btn"
        style={{ width: "100%", justifyContent: "space-between", fontSize: 12 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2"><IconUsers size={14} /> Oddaj głos w imieniu uczestnika</span>
        <span style={{ opacity: 0.5 }}>{open ? <IconChevronDown size={13} style={{ transform: "rotate(180deg)" }} /> : <IconChevronDown size={13} />}</span>
      </button>
      {open && (
        <div className="mt-2">
          <input
            className="input"
            placeholder="Wyszukaj uczestnika…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 12, marginBottom: 6 }}
          />
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--color-rule-soft)" }}>
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs" style={{ color: "var(--color-ink-3)" }}>
                Brak uczestników do głosowania.
              </div>
            )}
            {filtered.map((p) => (
              <div key={p.userId} className="border-b border-[var(--color-rule-soft)]">
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-xs truncate flex-1">
                    {p.name}
                    {castByUser?.[p.userId] && (
                      <span className="ml-2" style={{ color: "var(--color-ink-3)", fontWeight: 600 }}>
                        {isList ? `oddał (${castByUser[p.userId].optionIds.length})` : isPackage ? "oddał pakiet" : `oddał: ${choiceLabel(castByUser[p.userId].choice)}`}
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    {castByUser?.[p.userId] && (
                      <button type="button" className="btn" style={{ padding: "2px 6px", fontSize: 10, color: "var(--color-no)" }} disabled={pending} onClick={() => { if (window.confirm(`Wyzerować głos: ${p.name}?`)) onReset(p.userId); }} title="Usuń oddany głos">Zeruj</button>
                    )}
                    {vote.type === "QUORUM" ? (
                      <button type="button" className="btn btn-yes" style={{ padding: "2px 8px", fontSize: 10 }} disabled={pending} onClick={() => onCast(p.userId, "YES")}>OBECNY</button>
                    ) : isList || isPackage ? (
                      <button type="button" className="btn" style={{ padding: "2px 8px", fontSize: 10 }} disabled={pending} onClick={() => setExpandedUser(expandedUser === p.userId ? null : p.userId)}>
                        {expandedUser === p.userId ? "Zwiń" : (isPackage ? "Wybierz pozycje" : "Wybierz")}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn btn-yes" style={{ padding: "2px 6px", fontSize: 10 }} disabled={pending} onClick={() => onCast(p.userId, "YES")}>ZA</button>
                        <button type="button" className="btn btn-no" style={{ padding: "2px 6px", fontSize: 10 }} disabled={pending} onClick={() => onCast(p.userId, "NO")}>PR</button>
                        <button type="button" className="btn btn-abstain" style={{ padding: "2px 6px", fontSize: 10 }} disabled={pending} onClick={() => onCast(p.userId, "ABSTAIN")}>WS</button>
                      </>
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
    <div className="px-3 pb-3 bg-white">
      <div className="flex flex-col gap-1 mb-2">
        {vote.options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={sel.includes(o.id)} onChange={() => toggle(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-primary" style={{ padding: "3px 10px", fontSize: 11 }} disabled={pending} onClick={() => onSubmit(sel)}>
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
    { key: "YES", label: "ZA", cls: "btn-yes" },
    { key: "NO", label: "PR", cls: "btn-no" },
    { key: "ABSTAIN", label: "WS", cls: "btn-abstain" },
  ];
  return (
    <div className="px-3 pb-3 bg-white">
      <div className="flex flex-col gap-2 mb-2">
        {vote.options.map((o, i) => (
          <div key={o.id} className="flex items-center justify-between gap-2">
            <span className="text-xs flex-1 truncate">{o.positionNumber ?? i + 1}. {o.label}</span>
            <div className="flex gap-1 shrink-0">
              {meta.map((m) => (
                <button key={m.key} type="button" className={`btn ${choices[o.id] === m.key ? m.cls : ""}`} style={{ padding: "2px 6px", fontSize: 10 }} disabled={pending} onClick={() => set(o.id, m.key)}>{m.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary" style={{ padding: "3px 10px", fontSize: 11 }} disabled={pending || Object.keys(choices).length === 0} onClick={() => onSubmit(Object.entries(choices).map(([optionId, choice]) => ({ optionId, choice })))}>
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

    if (isEdit && editVote) {
      // Tryb edycji: PATCH pełnych pól (dozwolone tylko dla nieotwartych).
      const r = await fetch(`/api/votes/${editVote.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!r.ok) { setError(await r.text()); setSubmitting(false); return; }
      setSubmitting(false);
      onCreated();
      return;
    }

    const r = await fetch(`/api/meetings/${meetingId}/votes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!r.ok) { setError(await r.text()); setSubmitting(false); return; }
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
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(11,14,20,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "8vh 20px", zIndex: 50, overflowY: "auto",
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card no-grid"
        style={{ width: "100%", maxWidth: 640, background: "#FFFFFF" }}
      >
        <div className="px-6 py-4 border-b border-[var(--color-rule)] flex items-center justify-between">
          <h2 className="eyebrow">
            {isEdit ? "Edytuj głosowanie" : mode === "plan" ? `Zaplanuj głosowanie - ${agendaItemTitle ?? ""}` : "Nowe głosowanie"}
          </h2>
          <button type="button" onClick={onClose} className="btn" style={{ padding: "4px 10px", fontSize: 12 }}>Zamknij</button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="label" htmlFor="vc-title">Tytuł / wniosek</label>
            <input id="vc-title" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="label" htmlFor="vc-desc">Opis (opcjonalnie)</label>
            <textarea id="vc-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {mode === "adhoc" && (
            <div>
              <label className="label" htmlFor="vc-context">Kontekst w raporcie (opcjonalnie)</label>
              <input id="vc-context" className="input" placeholder="np. Wniosek zgłoszony w pkt 4" value={contextLabel} onChange={(e) => setContextLabel(e.target.value)} />
              <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Zastępuje nazwę posiedzenia w nagłówku raportu tego głosowania.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Typ</label>
              <select className="input" value={type} onChange={(e) => setType(e.target.value as VoteType)}>
                <option value="STANDARD">Zwykłe (za / przeciw / wstrzymuję się)</option>
                <option value="LIST">Lista kandydatów / opcji</option>
                <option value="PACKAGE">Pakietowe (wiele pozycji, każda za/przeciw/wstrzym)</option>
                <option value="QUORUM">Kworum (sprawdzenie obecności)</option>
              </select>
            </div>
            <div>
              <label className="label">Widoczność</label>
              <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as VoteVisibility)}>
                <option value="OPEN">Jawne (z imienną historią)</option>
                <option value="SECRET">Tajne (anonimowe po zamknięciu)</option>
              </select>
            </div>
          </div>

          {type !== "QUORUM" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Typ większości</label>
                <select
                  className="input"
                  value={majorityKind}
                  onChange={(e) => setMajorityKind(e.target.value as MajorityKind)}
                >
                  <option value="SIMPLE">Zwykła (ZA &gt; PRZECIW, wstrzymania nie liczą)</option>
                  <option value="ABSOLUTE">Bezwzględna</option>
                  <option value="QUALIFIED_TWO_THIRDS">Kwalifikowana 2/3</option>
                  <option value="QUALIFIED_THREE_FIFTHS">Kwalifikowana 3/5</option>
                </select>
              </div>
              {majorityKind !== "SIMPLE" && (
                <div>
                  <label className="label">Mianownik</label>
                  <select
                    className="input"
                    value={majorityBase}
                    onChange={(e) => setMajorityBase(e.target.value as MajorityBase)}
                  >
                    <option value="OF_VOTERS">Od głosujących (oddanych głosów)</option>
                    <option value="OF_PRESENT">Od obecnych</option>
                    <option value="OF_FULL_BODY">Od pełnego składu</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {type === "LIST" && (
            <div className="border-t border-[var(--color-rule-soft)] pt-5">
              <div className="flex items-center justify-between mb-3">
                <label className="label" style={{ marginBottom: 0 }}>Kandydaci / opcje</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    title="Wklej listę z tekstu - każda linia to jedna pozycja"
                    onClick={() => { setPasteText(""); setPasteTarget("list"); }}
                  >Wklej z tekstu</button>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    title="Posortuj pozycje alfabetycznie (z polskimi znakami)"
                    onClick={() => setOptions((arr) => {
                      const filled = arr.filter((v) => v.trim() !== "").sort((a, b) => a.localeCompare(b, "pl", { sensitivity: "base" }));
                      const empty = arr.filter((v) => v.trim() === "");
                      return [...filled, ...empty];
                    })}
                  >Sortuj A-Z</button>
                  <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setOptions((o) => [...o, ""])}>+ Dodaj</button>
                </div>
              </div>
              <ul className="space-y-2">
                {options.map((o, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="mono text-xs w-6 text-right" style={{ color: "var(--color-ink-3)" }}>{i + 1}.</span>
                    <input
                      className="input"
                      value={o}
                      placeholder="Nazwisko i imię"
                      onChange={(e) => setOptions((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))}
                    />
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "4px 8px", fontSize: 11 }}
                      onClick={() => setOptions((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      Usuń
                    </button>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="label">Co najmniej zaznaczeń</label>
                  <input type="number" min={0} className="input" value={minSel} onChange={(e) => setMinSel(parseInt(e.target.value || "0", 10))} />
                </div>
                <div>
                  <label className="label">Co najwyżej zaznaczeń</label>
                  <input type="number" min={1} className="input" value={maxSel} onChange={(e) => setMaxSel(parseInt(e.target.value || "1", 10))} />
                </div>
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--color-ink-3)" }}>
                Każde niezaznaczone pole = głos PRZECIW danemu kandydatowi.
              </p>
            </div>
          )}

          {type === "PACKAGE" && (
            <div className="border-t border-[var(--color-rule-soft)] pt-5">
              <div className="flex items-center justify-between mb-3">
                <label className="label" style={{ marginBottom: 0 }}>Pozycje pakietu</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                    title="Wklej pozycje z tekstu - każda linia to jedna pozycja"
                    onClick={() => { setPasteText(""); setPasteTarget("package"); }}
                  >Wklej z tekstu</button>
                  <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setPackageItems((o) => [...o, { label: "", description: "" }])}>+ Dodaj pozycję</button>
                </div>
              </div>
              <ul className="space-y-3">
                {packageItems.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mono text-xs w-6 text-right mt-2" style={{ color: "var(--color-ink-3)" }}>{i + 1}.</span>
                    <div className="flex-1 space-y-1">
                      <input
                        className="input"
                        value={it.label}
                        placeholder="Tytuł pozycji (np. Poprawka nr 1)"
                        onChange={(e) => setPackageItems((arr) => arr.map((v, idx) => (idx === i ? { ...v, label: e.target.value } : v)))}
                      />
                      <input
                        className="input"
                        value={it.description}
                        placeholder="Opis (opcjonalnie)"
                        style={{ fontSize: 13 }}
                        onChange={(e) => setPackageItems((arr) => arr.map((v, idx) => (idx === i ? { ...v, description: e.target.value } : v)))}
                      />
                    </div>
                    <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 11, marginTop: 4 }} onClick={() => setPackageItems((arr) => arr.filter((_, idx) => idx !== i))}>Usuń</button>
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
                <input type="checkbox" checked={requireAllPositions} onChange={(e) => setRequireAllPositions(e.target.checked)} />
                <span>Wymagaj oddania głosu na wszystkie pozycje</span>
              </label>
            </div>
          )}

          <div className="border-t border-[var(--color-rule-soft)] pt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={pinRequired} onChange={(e) => setPinRequired(e.target.checked)} />
              <span>Zabezpiecz PIN-em (radny wpisuje kod z ekranu sali){type === "QUORUM" ? " - zalecane przy kworum" : ""}</span>
            </label>
            {pinRequired && (
              <div className="flex items-center gap-2 mt-3">
                <input
                  className="input"
                  style={{ maxWidth: 120, fontSize: 18, letterSpacing: "0.3em", textAlign: "center" }}
                  value={pinCode}
                  placeholder="0000"
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
                <button type="button" className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setPinCode(String(Math.floor(1000 + Math.random() * 9000)))}>
                  Wylosuj
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--color-rule-soft)] pt-4">
            <label className="label">Pierwszy głos ważny (nie można zmienić)</label>
            <select className="input" value={firstVoteFinal} onChange={(e) => setFirstVoteFinal(e.target.value as "" | "yes" | "no")}>
              <option value="">Domyślnie (wg ustawień globalnych)</option>
              <option value="yes">Tak - pierwszy głos ostateczny</option>
              <option value="no">Nie - można zmieniać do zamknięcia</option>
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
              Dotyczy tylko tego głosowania. „Domyślnie" korzysta z konfiguracji globalnej (osobno jawne/tajne).
            </p>
          </div>

          {!isEdit && (
          <div className="border-t border-[var(--color-rule-soft)] pt-4">
            <button
              type="button"
              className="text-sm flex items-center gap-2"
              style={{ color: "var(--color-ink-2)" }}
              onClick={() => setShowExclusions((v) => !v)}
            >
              <span>{showExclusions ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}</span>
              <span>Wyłącz osoby z tego głosowania ({excludedIds.length})</span>
            </button>
            {showExclusions && (
              <div className="mt-3 max-h-[180px] overflow-y-auto border border-[var(--color-rule-soft)]">
                {participants.map((p) => {
                  const checked = excludedIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-paper-2)] text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setExcludedIds((arr) => checked ? arr.filter((id) => id !== p.id) : [...arr, p.id])}
                      />
                      <span className="flex-1">{p.name}</span>
                      {p.groupShort && <span className="eyebrow">{p.groupShort}</span>}
                    </label>
                  );
                })}
              </div>
            )}
            {excludedIds.length > 0 && (
              <p className="text-xs mt-2" style={{ color: "var(--color-ink-3)" }}>
                Wyłączone osoby nie będą widoczne w snapshocie uprawnionych ani w mianowniku większości.
              </p>
            )}
          </div>
          )}

          {!isEdit && (
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
            <input type="checkbox" checked={openImmediately} onChange={(e) => setOpenImmediately(e.target.checked)} />
            <span>Otwórz od razu</span>
          </label>
          )}

          {error && (
            <div className="px-3 py-2 text-sm" style={{ background: "var(--color-no-bg)", border: "1px solid var(--color-no)", color: "var(--color-no)" }}>
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-rule)] flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (isEdit ? "Zapisuję…" : "Tworzę…") : isEdit ? "Zapisz zmiany" : openImmediately ? "Utwórz i otwórz" : "Utwórz"}
          </button>
        </div>
      </form>

      {/* Modal wklejania pozycji z tekstu (textarea) - zamiast window.prompt. */}
      {pasteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setPasteTarget(null)}>
          <div className="card" style={{ width: "100%", maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-[var(--color-rule-soft)]">
              <h3 className="eyebrow" style={{ margin: 0 }}>Wklej {pasteTarget === "package" ? "pozycje pakietu" : "pozycje listy"} z tekstu</h3>
            </div>
            <div className="p-5">
              <p className="text-xs mb-2" style={{ color: "var(--color-ink-3)" }}>
                Każda linia to jedna pozycja. Puste linie są pomijane. Pozycje zostaną dopisane do istniejących.
              </p>
              <textarea
                autoFocus
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={10}
                className="input"
                style={{ width: "100%", fontFamily: "inherit", resize: "vertical" }}
                placeholder={"Jan Kowalski\nAnna Nowak\nPiotr Wiśniewski"}
              />
              <div className="text-xs mt-2" style={{ color: "var(--color-ink-3)" }}>
                Rozpoznane pozycje: {pasteText.split("\n").map((l) => l.trim()).filter(Boolean).length}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--color-rule-soft)] flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setPasteTarget(null)}>Anuluj</button>
              <button type="button" className="btn btn-primary" onClick={applyPaste}>Dodaj pozycje</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, right, tone }: { title: string; right?: React.ReactNode; tone?: "live" }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3 border-b"
      style={{
        borderColor: tone === "live" ? "var(--color-live)" : "var(--color-rule)",
        background: tone === "live" ? "var(--color-no-bg)" : undefined,
      }}
    >
      <h3 className="eyebrow" style={{ fontSize: 11 }}>{title}</h3>
      {right && <div>{right}</div>}
    </div>
  );
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
    <div className="mb-6">
      <button className="text-xs flex items-center gap-2" style={{ color: "var(--color-ink-2)" }} onClick={() => setOpen((v) => !v)}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: online.length > 0 ? "var(--color-yes)" : "var(--color-ink-3)", display: "inline-block" }} />
        <span>Online: {online.length} / {participants.length} {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1">
          {sorted.map((p) => (
            <span key={p.userId} className="pill" style={{ padding: "2px 8px", fontSize: 11, opacity: p.online ? 1 : 0.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.online ? "var(--color-yes)" : "var(--color-ink-3)", display: "inline-block", marginRight: 5 }} />
              {p.name}{p.groupShort ? ` (${p.groupShort})` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div className="bg-white p-4" style={{ minWidth: 0, overflow: "hidden" }}>
      <div className="eyebrow" style={{ overflowWrap: "break-word" }}>{label}</div>
      <div className={`mt-1 num`} style={{ fontSize: highlight ? 40 : 32, lineHeight: 1, fontWeight: highlight ? 500 : 400 }}>
        {value}
      </div>
      {sub && <div className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>{sub}</div>}
    </div>
  );
}

function QuorumCell({ quorum }: { quorum: QuorumStatus }) {
  const ok = quorum.met;
  return (
    <div className="p-4" style={{
      background: ok ? "var(--color-yes-bg)" : "var(--color-no-bg)",
      color: ok ? "var(--color-yes)" : "var(--color-no)",
    }}>
      <div className="eyebrow" style={{ color: "inherit", opacity: 0.85 }}>Kworum</div>
      <div className="mt-1 num" style={{ fontSize: 32, lineHeight: 1 }}>
        {quorum.presentCount} / {quorum.requiredCount}
      </div>
      <div className="text-xs mt-1" style={{ color: "inherit" }}>
        {ok ? "spełnione" : "niespełnione"} - {quorum.ruleLabel}
      </div>
    </div>
  );
}

function PackageCounterRow({ idx, label, yes, no, abstain }: { idx: number; label: string; yes: number | null; no: number | null; abstain: number | null }) {
  const cell = (v: number | null, color: string) => (
    <div className="bg-white px-3 py-2 text-center num" style={{ fontSize: 18, color: `var(--color-${color})`, minWidth: 56 }}>
      {v === null ? "-" : v}
    </div>
  );
  return (
    <>
      <div className="bg-white px-3 py-2 text-sm flex items-center">
        <span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>{idx + 1}.</span>{label}
      </div>
      {cell(yes, "yes")}
      {cell(no, "no")}
      {cell(abstain, "abstain")}
    </>
  );
}

function BallotCounter({ label, color, value }: { label: string; color: "yes" | "no" | "abstain"; value?: number }) {
  return (
    <div className="bg-white p-5">
      <div className="eyebrow" style={{ color: `var(--color-${color})` }}>{label}</div>
      <div className="num mt-2" style={{ fontSize: 40, lineHeight: 1, color: `var(--color-${color})` }}>
        {value === undefined ? "-" : value}
      </div>
    </div>
  );
}

function AgendaStatusPill({ status }: { status: AgendaItemStatus }) {
  if (status === "CURRENT") return <span className="pill pill-live">Rozpatrywany</span>;
  if (status === "PAUSED") return <span className="pill" style={{ background: "var(--color-abstain-bg)", color: "var(--color-abstain)" }}>Zawieszony</span>;
  if (status === "COMPLETED") return <span className="pill pill-ok">Zakończony</span>;
  if (status === "SKIPPED") return <span className="pill pill-neutral">Pominięty</span>;
  return <span className="pill pill-neutral">Oczekuje</span>;
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
    if (!r.ok) { alert(await r.text()); return; }
    setDraft("");
    onPublished();
  }

  async function toggleHidden(id: string, hidden: boolean) {
    const r = await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    if (!r.ok) { alert(await r.text()); return; }
    onPublished();
  }

  async function removeMessage(id: string) {
    if (!window.confirm("Usunąć komunikat?")) return;
    const r = await fetch(`/api/messages/${id}`, { method: "DELETE" });
    if (!r.ok) { alert(await r.text()); return; }
    onPublished();
  }

  return (
    <div className="card">
      <SectionHeader title="Komunikaty" />
      <div className="p-4">
        <textarea
          className="input"
          rows={2}
          placeholder="Treść komunikatu dla uczestników…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex justify-end mt-2">
          <button
            className="btn btn-primary"
            style={{ padding: "6px 12px", fontSize: 12 }}
            disabled={pending || sending || !draft.trim()}
            onClick={send}
          >
            {sending ? "Wysyłam…" : "Opublikuj"}
          </button>
        </div>
      </div>
      <ul className="divide-y divide-[var(--color-rule-soft)] max-h-[280px] overflow-y-auto">
        {messages.map((m) => (
          <li key={m.id} className="px-4 py-2" style={{ opacity: m.hidden ? 0.45 : 1 }}>
            <div className="flex justify-between items-start gap-2">
              <div className="text-sm flex-1">
                {m.content}
                {m.hidden && <span className="ml-2 text-xs" style={{ color: "var(--color-ink-3)", fontStyle: "italic" }}>(ukryty)</span>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  className="btn"
                  style={{ padding: "2px 6px", fontSize: 10 }}
                  onClick={() => toggleHidden(m.id, !m.hidden)}
                  title={m.hidden ? "Pokaż komunikat" : "Ukryj komunikat"}
                >
                  {m.hidden ? "Pokaż" : "Ukryj"}
                </button>
                <button
                  className="btn"
                  style={{ padding: "2px 6px", fontSize: 10, color: "var(--color-no)" }}
                  onClick={() => removeMessage(m.id)}
                  title="Usuń komunikat"
                >
                  <IconClose size={13} />
                </button>
              </div>
            </div>
            <div className="eyebrow mt-0.5 mono">{formatTime(m.publishedAt)}</div>
          </li>
        ))}
        {messages.length === 0 && (
          <li className="px-4 py-3 text-xs" style={{ color: "var(--color-ink-3)" }}>Brak komunikatów.</li>
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
      setError(await r.text());
      setSubmitting(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-lg my-8">
        <form onSubmit={save} className="card no-grid p-6" style={{ background: "var(--color-paper)" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Edycja posiedzenia</h3>
          <div className="space-y-3">
            <div>
              <label className="label">Nazwa</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Numer (np. „XII/2025”)</label>
              <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} required />
            </div>
            <div>
              <label className="label">Data i godzina</label>
              <input
                type="datetime-local"
                className="input"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                required
              />
              <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Czas warszawski.</p>
            </div>
            {error && <p className="text-sm" style={{ color: "var(--color-no)" }}>{error}</p>}
          </div>
          <div className="mt-5 flex gap-2 justify-end">
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
      </div>
    </div>
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
      if (!r.ok) { setMsg(await r.text()); setBusy(false); return; }
      onDone();
    } catch (e) {
      setMsg(String(e)); setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-1">Przelicz większość</h3>
        <p className="text-xs mb-2" style={{ color: "var(--color-ink-2)" }}>{vote.title}</p>
        <p className="text-xs mb-4" style={{ color: "var(--color-ink-3)" }}>
          Korekta błędnie zadeklarowanej większości. Wynik zostanie przeliczony z zachowanych liczników i zaktualizowany także na ekranach wizualizacji.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Rodzaj większości</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as MajorityKind)}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Podstawa</label>
            <select className="input" value={base} onChange={(e) => setBase(e.target.value as MajorityBase)}>
              <option value="OF_VOTERS">głosujących</option>
              <option value="OF_PRESENT">obecnych</option>
              <option value="OF_FULL_BODY">ustawowego składu</option>
            </select>
          </div>
        </div>
        {msg && <p className="text-xs mt-3" style={{ color: "var(--color-no)" }}>{msg}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn" onClick={onClose} disabled={busy}>Anuluj</button>
          <button className="btn btn-primary" onClick={recompute} disabled={busy}>
            {busy ? "Przeliczanie…" : "Przelicz wynik"}
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-lg my-8">
        <form onSubmit={save} className="card no-grid p-6" style={{ background: "var(--color-paper)" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Edycja głosowania</h3>
          <div className="space-y-3">
            <div>
              <label className="label">Nazwa głosowania</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
            </div>
            {showContext && (
              <div>
                <label className="label">Kontekst w raporcie</label>
                <input
                  className="input"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="np. Wniosek zgłoszony w pkt 4 (puste = nazwa posiedzenia)"
                />
                <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
                  Zastępuje nazwę posiedzenia w raporcie tego głosowania. Puste pole = użyj nazwy posiedzenia.
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-6">
            <button type="submit" className="btn btn-primary">Zapisz</button>
            <button type="button" className="btn" onClick={onClose}>Anuluj</button>
          </div>
        </form>
      </div>
    </div>
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
  act: (path: string, body?: Record<string, unknown>, confirmMsg?: string, method?: string) => void;
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
      <button type="button" className="w-full flex items-center justify-between px-5 py-3" onClick={() => setOpen((v) => !v)}>
        <span className="eyebrow" style={{ margin: 0 }}>Zapisy do przyszłych punktów{totalSignups > 0 ? ` (${totalSignups})` : ""}</span>
        <span style={{ opacity: 0.5, fontSize: 12 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {relevant.map((a) => {
            const list = listByItem.get(a.id)!;
            const waiting = list.entries.filter((e) => e.status === "WAITING").sort((x, y) => x.order - y.order);
            return (
              <div key={a.id} className="border border-[var(--color-rule-soft)] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-medium">{a.unnumbered ? a.title : `Pkt ${a.number}. ${a.title}`}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={list.selfSignupEnabled} onChange={(e) => act(`/api/speakerlists/${list.id}`, { selfSignupEnabled: e.target.checked }, undefined, "PATCH")} />
                      zapisy
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={list.visibleToParticipants} onChange={(e) => act(`/api/speakerlists/${list.id}`, { visibleToParticipants: e.target.checked }, undefined, "PATCH")} />
                      widoczna
                    </label>
                  </div>
                </div>
                {waiting.length === 0 ? (
                  <div className="text-xs mb-2" style={{ color: "var(--color-ink-3)" }}>Brak zapisanych.</div>
                ) : (
                  <ol className="space-y-1 mb-2">
                    {waiting.map((e, i) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">
                          <span style={{ color: "var(--color-ink-3)" }}>{i + 1}.</span> {e.userName}
                          {e.groupShort && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}> ({e.groupShort})</span>}
                          {e.priority && <span className="text-xs" style={{ color: "var(--color-yes)" }}> priorytet</span>}
                        </span>
                        <button className="btn" style={{ padding: "1px 8px", fontSize: 11, color: "var(--color-no)" }} onClick={() => act(`/api/speaker-entries/${e.id}/withdraw`, undefined, `Usunąć zapis: ${e.userName}?`)}>Usuń</button>
                      </li>
                    ))}
                  </ol>
                )}
                <AddToListRow listId={list.id} participants={participants} act={act} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Wiersz dopisania uczestnika do listy mówców (przyszły punkt lub wnioski formalne).
function AddToListRow({ listId, participants, act }: {
  listId: string;
  participants: { userId: string; name: string; hasVotingRight: boolean }[];
  act: (path: string, body?: Record<string, unknown>, confirmMsg?: string, method?: string) => void;
}) {
  const [userId, setUserId] = useState("");
  return (
    <div className="flex items-center gap-1">
      <select className="input" style={{ fontSize: 11, flex: 1 }} value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">- dopisz uczestnika -</option>
        {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}{!p.hasVotingRight && " (bez prawa)"}</option>)}
      </select>
      <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} disabled={!userId} onClick={() => { act(`/api/speakerlists/${listId}/entries`, { userId, entryType: "REGULAR" }); setUserId(""); }}>Zwykły</button>
      <button className="btn" style={{ padding: "3px 8px", fontSize: 11, borderColor: "var(--color-yes)", color: "var(--color-yes)" }} disabled={!userId} onClick={() => { act(`/api/speakerlists/${listId}/entries`, { userId, entryType: "REGULAR", priority: true }); setUserId(""); }}>Priorytet</button>
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
  const [text, setText] = useState("");

  const [visibility, setVisibility] = useState<"OPEN" | "SECRET">("OPEN");
  const [majorityKind, setMajorityKind] = useState<"SIMPLE" | "ABSOLUTE" | "QUALIFIED_2_3">("SIMPLE");
  const [majorityBase, setMajorityBase] = useState<"OF_VOTERS" | "OF_PRESENT" | "OF_STATUTORY">("OF_VOTERS");
  const [agendaItemId, setAgendaItemId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  const submit = async () => {
    setBusy(true); setError(null);
    const r = await fetch(`/api/meetings/${meetingId}/votes/bulk`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text, type: "STANDARD", visibility, majorityKind, majorityBase,
        adHoc: agendaItemId === "",
        agendaItemId: agendaItemId || null,
      }),
    });
    setBusy(false);
    if (!r.ok) { setError(await r.text()); return; }
    onDone();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="card" style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[var(--color-rule-soft)]">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Import głosowań z tekstu</h3>
          <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Jedna linia = jedno głosowanie. Ustawienia poniżej dotyczą wszystkich zaimportowanych głosowań.</p>
        </div>
        <div className="p-5 space-y-4">
          <textarea
            className="input" rows={8}
            placeholder={"np.\nUchwała w sprawie budżetu\nUchwała w sprawie planu zagospodarowania\nUchwała w sprawie zmiany statutu"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ fontSize: 13, fontFamily: "inherit" }}
          />
          <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>Rozpoznano głosowań: <b>{lines.length}</b></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Jawność</label>
              <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as "OPEN" | "SECRET")}>
                <option value="OPEN">Jawne</option>
                <option value="SECRET">Tajne</option>
              </select>
            </div>
            <div>
              <label className="label">Rodzaj większości</label>
              <select className="input" value={majorityKind} onChange={(e) => setMajorityKind(e.target.value as "SIMPLE" | "ABSOLUTE" | "QUALIFIED_2_3")}>
                <option value="SIMPLE">Zwykła</option>
                <option value="ABSOLUTE">Bezwzględna</option>
                <option value="QUALIFIED_2_3">Kwalifikowana 2/3</option>
              </select>
            </div>
            <div>
              <label className="label">Podstawa większości</label>
              <select className="input" value={majorityBase} onChange={(e) => setMajorityBase(e.target.value as "OF_VOTERS" | "OF_PRESENT" | "OF_STATUTORY")}>
                <option value="OF_VOTERS">Głosujących</option>
                <option value="OF_PRESENT">Obecnych</option>
                <option value="OF_STATUTORY">Ustawowego składu</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Punkt porządku (opcjonalnie)</label>
            <select className="input" value={agendaItemId} onChange={(e) => setAgendaItemId(e.target.value)}>
              <option value="">Bez punktu (ad hoc)</option>
              {agenda.map((a) => <option key={a.id} value={a.id}>{a.number}. {a.title}</option>)}
            </select>
          </div>

          {error && <div className="text-sm" style={{ color: "var(--color-no)" }}>{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={onClose} disabled={busy}>Anuluj</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy || lines.length === 0}>
              {busy ? "Importuję…" : `Importuj ${lines.length} głosowań`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
