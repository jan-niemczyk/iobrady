"use client";

import { useEffect, useRef, useState } from "react";
import { meetingNameWithDate } from "@/lib/meetingName";

// ─── Typy (podzbiór /api/display/[meetingId]) ────────────────────────────
interface VoteView {
  id: string;
  number: number | null;
  title: string;
  type: string;
  visibility: string;
  status: string;
  eligibleCount: number;
  presentCount: number;
  resultYes: number;
  resultNo: number;
  resultAbstain: number;
  resultCastCount: number;
  resultPassed?: boolean | null;
  majorityKind: string;
  majorityThreshold: number | null;
  options: { label: string; count: number }[];
}
interface SpeakerEntry { userName: string; groupShort: string | null; speakerRole: string | null; status: string; startedAt: string | null; timeLimitSec: number | null; timeAdjustmentSec: number; }
interface Voter { name: string; groupShort: string | null; choice: string | null; present: boolean }
interface LiveBallot { userId: string; userName: string; choice: string | null }
interface OverlayData {
  meeting: { name: string; number: string; status: string; scheduledAt?: string };
  organization: string;
  presentation: { font: string; logoUrl: string | null };
  overlay: { font: string; resultsMode: string; boardTiming: string; showSpeechClock: boolean };
  barColors: { item: string; speaker: string; vote: string; session: string };
  display: { mode: string; customMessage: string | null; messageOnOverlay?: boolean; showByName: boolean; summaryAfterClose: boolean };
  currentAgendaItem: { number: string; title: string } | null;
  pinnedAgendaItem: { number: string; title: string } | null;
  activeVote: VoteView | null;
  lastClosedVote: VoteView | null;
  pinnedVote: VoteView | null;
  speakerList: { agendaItemNumber: string | null; agendaItemTitle: string | null; entries: SpeakerEntry[] } | null;
  voters?: Voter[];
  liveBallots?: LiveBallot[];
}

function fontStack(name: string): string {
  const map: Record<string, string> = {
    "Inter": `'Inter', system-ui, sans-serif`,
    "Lato": `'Lato', system-ui, sans-serif`,
    "Roboto": `'Roboto', system-ui, sans-serif`,
    "DM Sans": `'DM Sans', system-ui, sans-serif`,
    "Source Sans Pro": `'Source Sans 3', system-ui, sans-serif`,
    "Outfit": `'Outfit', system-ui, sans-serif`,
    "Open Sans": `'Open Sans', system-ui, sans-serif`,
    "Segoe UI": `'Segoe UI', 'Inter', system-ui, sans-serif`,
  };
  return map[name] ?? map["Inter"];
}

function majorityLabel(kind: string): string | null {
  switch (kind) {
    case "ABSOLUTE": return "Bezwzględna";
    case "QUALIFIED_TWO_THIRDS": return "2/3";
    case "QUALIFIED_THREE_FIFTHS": return "3/5";
    case "SIMPLE": return "Zwykła";
    default: return null;
  }
}

// Stała, czytelna paleta - niezależna od koloru organu (dobry kontrast na wideo, także na telefonie).
const PANEL = "rgba(255,255,255,0.97)";
const INK = "#0F172A";
const MUTED = "#64748B";
const BAR_VOTE = "#E11D48";     // czerwony - używany w liczniku mówcy przy przekroczeniu
const YES = "#16A34A", NO = "#DC2626", ABS = "#CA8A04", ACCENT = "#1D4ED8";

const ANIM = "520ms cubic-bezier(0.16,1,0.3,1)";  // jednolita animacja wjazdu
const LARGE_BODY = 40;  // od tylu uczestników pokazujemy tylko podsumy (bez list imiennych)

export function OverlayClient({ meetingId }: { meetingId: string }) {
  const [data, setData] = useState<OverlayData | null>(null);
  const [now, setNow] = useState(new Date());
  const closedShownAt = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    const fetchData = async () => {
      try {
        const r = await fetch(`/api/display/${meetingId}`, { cache: "no-store" });
        if (r.ok && alive) setData(await r.json());
      } catch { /* ignoruj */ }
    };
    fetchData();
    const poll = setInterval(fetchData, 1500);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(clock); };
  }, [meetingId]);

  const isBreak = !!data && (data.display.mode === "BREAK" || data.meeting.status === "PAUSED");
  const isMessage = !!data && data.display.mode === "MESSAGE" && (data.display.messageOnOverlay ?? true);
  const isAttendance = !!data && data.display.mode === "ATTENDANCE";

  // Sygnalizacja stanu dla OBS: atrybut na <html> + tytuł zakładki (bez nazwy produktu).
  useEffect(() => {
    const state = isBreak ? "break" : isMessage ? "message" : "live";
    document.title = isBreak ? "Przerwa" : isMessage ? "Komunikat" : "Transmisja";
    document.documentElement.setAttribute("data-obrady-state", state);
  }, [isBreak, isMessage]);

  if (!data) return <div style={{ width: "100vw", height: "100vh", background: "transparent" }} />;

  const font = fontStack(data.overlay.font);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  // „Trwa głosowanie" tylko dla realnie otwartego głosowania.
  const openVote = (data.activeVote && data.activeVote.status === "OPEN") ? data.activeVote : null;
  // Zamknięte do pokazania: przypięte (PINNED_VOTE) albo ostatnie zamknięte w AUTO (przez 10 s).
  const lc = data.lastClosedVote;
  const pinnedClosed = data.pinnedVote && data.pinnedVote.status === "CLOSED" ? data.pinnedVote : null;
  let recentClosed: VoteView | null = pinnedClosed;
  if (!recentClosed && lc && lc.status === "CLOSED") {
    if (!closedShownAt.current[lc.id]) closedShownAt.current[lc.id] = Date.now();
    if (Date.now() - closedShownAt.current[lc.id] < 10_000) recentClosed = lc;
  }

  const speaking = data.speakerList?.entries.find((e) => e.status === "SPEAKING") ?? null;
  const item = data.pinnedAgendaItem ?? data.currentAgendaItem;
  const large = (data.voters?.length ?? 0) >= LARGE_BODY;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "transparent", fontFamily: font, overflow: "hidden", position: "relative" }}>
      {isBreak ? (
        <BreakScreen text="Przerwa w obradach" org={data.organization} logo={data.presentation.logoUrl} clock={`${hh}:${mm}`} font={font} variant="break" />
      ) : isMessage ? (
        <BreakScreen text={data.display.customMessage ?? ""} org={data.organization} logo={data.presentation.logoUrl} clock={`${hh}:${mm}`} font={font} variant="message" />
      ) : (
        <>
          {/* ── GÓRNY BLOK: logo + organ (KAPITALIKI) + zegar ── */}
          <div style={{ position: "absolute", top: 32, left: 44, right: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, animation: `ovIn ${ANIM}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {data.presentation.logoUrl && (
                <img src={data.presentation.logoUrl} alt="" style={{ height: 60, width: "auto", objectFit: "contain", filter: "drop-shadow(0 3px 12px rgba(0,0,0,0.45))" }} />
              )}
              <div style={{ padding: "8px 16px", borderRadius: 11, background: PANEL, color: INK, fontSize: 16, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", boxShadow: "0 6px 24px rgba(0,0,0,0.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60vw" }}>
                {data.organization}
              </div>
            </div>
            <div style={{ padding: "9px 18px", borderRadius: 11, background: PANEL, color: INK, fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1', letterSpacing: "0.02em", boxShadow: "0 6px 24px rgba(0,0,0,0.3)" }}>
              {hh}:{mm}
            </div>
          </div>

          {/* ── LISTA OBECNOŚCI na żądanie (tryb ATTENDANCE) ── */}
          {isAttendance && (data.voters ?? []).length > 0 && (
            data.overlay.resultsMode === "BOARD" && !large ? (
              // Tryb tablicy: lista obecności identycznie jak na prezentacji (osadzona, bez nagłówka).
              <div style={{ position: "absolute", top: 100, left: 20, right: 20, bottom: 140 }}>
                <ResultsBoard meetingId={meetingId} />
              </div>
            ) : (
              <div style={{ position: "absolute", top: 118, left: 44, right: 44, maxWidth: "52vw", animation: `ovResult 360ms cubic-bezier(0.16,1,0.3,1)` }}>
                <AttendancePanel voters={data.voters ?? []} compact={large} />
              </div>
            )
          )}

          {/* ── GŁOSOWANIE: w trybie BOARD pokazuj tablicę już od rozpoczęcia; po zamknięciu przez 10 s ── */}
          {(() => {
            const boardMode = data.overlay.resultsMode === "BOARD" && !large;
            // Które głosowanie „obsługujemy": otwarte lub świeżo zamknięte.
            const activeOrClosed = openVote ?? recentClosed;
            if (isAttendance || !activeOrClosed) return null;

            // BOARD: tablica z prezentacji. Od startu tylko gdy wybrano FROM_START,
            // w przeciwnym razie dopiero po zamknięciu (przez okno 10 s).
            if (boardMode) {
              const fromStart = data.overlay.boardTiming === "FROM_START";
              const showBoard = fromStart ? true : !!recentClosed;
              if (!showBoard) return null;
              return (
                <div style={{ position: "absolute", top: 100, left: 20, right: 20, bottom: 140 }}>
                  <ResultsBoard meetingId={meetingId} />
                </div>
              );
            }

            // BARS: tylko PO zamknięciu (w trakcie nie pokazujemy wyników - jest pasek „Trwa głosowanie").
            if (!recentClosed) return null;
            const groupByName = new Map((data.voters ?? []).map((v) => [v.name, v.groupShort]));
            const named: Voter[] = (data.liveBallots ?? []).map((b) => ({
              name: b.userName,
              groupShort: groupByName.get(b.userName) ?? null,
              choice: b.choice,
              present: true,
            }));
            // Dla kworum wyniki imienne budujemy z obecności (present), nie z liveBallots.
            const isQ = recentClosed.type === "QUORUM";
            const votersForResults: Voter[] = isQ ? (data.voters ?? []) : named;
            return (
              <div style={{ position: "absolute", top: 118, left: 44, width: "50vw", maxHeight: "calc(100vh - 210px)", overflow: "hidden", animation: `ovResult 360ms cubic-bezier(0.16,1,0.3,1)` }}>
                <ResultsBars vote={recentClosed} voters={(data.display.showByName || isQ) && !large ? votersForResults : []} />
              </div>
            );
          })()}

          {/* ── DOLNE PASKI ── */}
          <div style={{ position: "absolute", left: 44, right: 44, bottom: 40, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            {openVote && (
              <Strip key={`vote-${openVote.id}`} color={data.barColors.vote} pulse>
                <strong style={{ letterSpacing: "0.02em", flexShrink: 0 }}>
                  {openVote.type === "QUORUM" ? "Sprawdzanie kworum:" : "Trwa głosowanie:"}
                </strong>&nbsp;<Marquee text={openVote.title} />
                {openVote.visibility === "SECRET" && openVote.type !== "QUORUM" && <span style={{ opacity: 0.85, flexShrink: 0 }}>&nbsp;- tajne</span>}
              </Strip>
            )}
            {!openVote && speaking && (
              <Strip key={`sp-${speaking.userName}`} color={data.barColors.speaker} inline>
                <span style={{ opacity: 0.85, fontWeight: 600 }}>Przemawia:</span>&nbsp;
                <strong>{speaking.userName}</strong>
                {speaking.speakerRole && <span style={{ opacity: 0.85 }}>,&nbsp;{speaking.speakerRole}</span>}
                {data.overlay.showSpeechClock && <SpeechClockInline entry={speaking} />}
              </Strip>
            )}
            {!openVote && item && (
              <Strip key={`item-${item.number}`} color={data.barColors.item}>
                <strong style={{ flexShrink: 0 }}>Pkt {item.number}. porz. obrad:</strong>&nbsp;<Marquee text={item.title} />
              </Strip>
            )}

            {/* Nazwa posiedzenia - zawsze na samym dole, pełna szerokość, kapitaliki, rozstrzelona */}
            <div style={{
              width: "100%", display: "flex", alignItems: "center",
              background: data.barColors.session, color: "#fff",
              padding: "6px 20px", borderRadius: 9,
              fontSize: 15, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              animation: `ovStrip ${ANIM}`,
            }}>
              {meetingNameWithDate(data.meeting.name, data.meeting.scheduledAt)}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes ovIn { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ovStrip { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ovResult { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes ovPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes ovFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ovMarquee { from { transform: translateX(0); } to { transform: translateX(calc(-1 * var(--scroll, 0px))); } }
      `}</style>
    </div>
  );
}

// ── Przewijanie długiego tekstu (jednolite dla całej nakładki) ──
function Marquee({ text }: { text: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [scroll, setScroll] = useState(0); // dystans do przewinięcia (szerokość tekstu + odstęp)
  useEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const overflow = i.scrollWidth - o.clientWidth;
    setScroll(overflow > 4 ? i.scrollWidth + 48 : 0);
  }, [text]);
  // Spokojne, jednokierunkowe tempo ~55 px/s.
  const dur = scroll ? Math.max(12, scroll / 55) : 0;
  if (!scroll) {
    return (
      <div ref={outer} style={{ overflow: "hidden", minWidth: 0, flex: 1 }}>
        <span ref={inner} style={{ display: "inline-block", whiteSpace: "nowrap" }}>{text}</span>
      </div>
    );
  }
  return (
    <div ref={outer} style={{ overflow: "hidden", minWidth: 0, flex: 1 }}>
      <div style={{
        display: "inline-flex", whiteSpace: "nowrap",
        ["--scroll" as string]: `${scroll}px`,
        animation: `ovMarquee ${dur}s linear infinite`,
      }}>
        {/* dwie kopie z odstępem - płynna, ciągła pętla bez cofania */}
        <span ref={inner} style={{ paddingRight: 48 }}>{text}</span>
        <span style={{ paddingRight: 48 }} aria-hidden>{text}</span>
      </div>
    </div>
  );
}

// ── Wąski „dzielony" pasek dolny ──
function Strip({ color, children, pulse, inline }: { color: string; children: React.ReactNode; pulse?: boolean; inline?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      alignSelf: inline ? "flex-start" : "stretch",
      width: inline ? "auto" : "100%", maxWidth: "100%",
      background: color, color: "#fff", borderRadius: 12, overflow: "hidden",
      boxShadow: "0 8px 30px rgba(0,0,0,0.32)", animation: `ovStrip ${ANIM}`,
    }}>
      {pulse && <span style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(255,255,255,0.95)", margin: "0 0 0 20px", flexShrink: 0, animation: "ovPulse 1.3s infinite" }} />}
      <div style={{ padding: "13px 24px", fontSize: 24, fontWeight: 500, lineHeight: 1.2, minWidth: 0, flex: inline ? "unset" : 1, display: "flex", alignItems: "center", whiteSpace: inline ? "nowrap" : undefined }}>
        {children}
      </div>
    </div>
  );
}

function SpeechClockInline({ entry }: { entry: SpeakerEntry }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, []);
  if (!entry.startedAt || entry.timeLimitSec == null) return null;
  const elapsed = Math.floor((now - new Date(entry.startedAt).getTime()) / 1000);
  const limit = entry.timeLimitSec + (entry.timeAdjustmentSec ?? 0);
  const over = elapsed >= limit;
  const left = Math.abs(over ? elapsed - limit : limit - elapsed);
  const m = String(Math.floor(left / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");
  return (
    <span style={{ marginLeft: 18, padding: "3px 12px", borderRadius: 8, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1', fontWeight: 800, fontSize: 20, background: "rgba(255,255,255,0.9)", color: over ? BAR_VOTE : INK, border: `2px solid ${over ? BAR_VOTE : "rgba(255,255,255,0.6)"}` }}>
      {over ? "-" : ""}{m}:{s}
    </span>
  );
}

// ── WYNIKI: zwarta podsuma (nazwa + liczba) + wyniki imienne ──
function ResultsBars({ vote, voters }: { vote: VoteView; voters: Voter[] }) {
  const isList = vote.type === "LIST";
  const isQuorum = vote.type === "QUORUM";
  const majLabel = majorityLabel(vote.majorityKind);

  // Kworum: potwierdzenie obecności, nie za/przeciw.
  if (isQuorum) {
    return (
      <div style={{ background: PANEL, color: INK, borderRadius: 16, overflow: "hidden", boxShadow: "0 16px 50px rgba(0,0,0,0.4)" }}>
        <div style={{ padding: "12px 20px", background: "#0F172A", color: "#fff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>Sprawdzenie kworum</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{vote.title}</div>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", justifyContent: "center", gap: 40 }}>
          <BigStat label="Potwierdziło obecność" value={vote.resultCastCount} color={YES} />
          <BigStat label="Uprawnionych" value={vote.eligibleCount} color={ACCENT} />
          {vote.majorityThreshold != null && <BigStat label="Wymagane kworum" value={vote.majorityThreshold} color={MUTED} />}
        </div>
        {voters.length > 0 && <QuorumNames voters={voters} />}
      </div>
    );
  }

  const stats: { label: string; value: number; color: string }[] = [
    { label: "Głosowało", value: vote.resultCastCount, color: ACCENT },
    { label: "Za", value: vote.resultYes, color: YES },
    { label: "Przeciw", value: vote.resultNo, color: NO },
    { label: "Wstrzymało się", value: vote.resultAbstain, color: ABS },
  ];
  if (vote.majorityThreshold != null && majLabel) {
    stats.push({ label: `Wymagane (${majLabel})`, value: vote.majorityThreshold, color: MUTED });
  }

  return (
    <div style={{ background: PANEL, color: INK, borderRadius: 16, overflow: "hidden", boxShadow: "0 16px 50px rgba(0,0,0,0.4)" }}>
      <div style={{ padding: "12px 22px", background: "#0F172A", color: "#fff" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
          Wyniki głosowania{vote.number != null ? ` nr ${vote.number}` : ""}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vote.title}</div>
      </div>

      <div style={{ padding: "12px 20px" }}>
        {!isList ? (
          // Poziome kafelki: etykieta z lewej, liczba z prawej. Węższe, by zmieścić więcej.
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stats.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 16px", borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.label}</span>
                <span style={{ fontSize: 26, fontWeight: 800, color: r.color, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1', lineHeight: 1 }}>{r.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...vote.options].sort((a, b) => b.count - a.count).map((o, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 16px", borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: ACCENT, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1', lineHeight: 1, flexShrink: 0, marginLeft: 16 }}>{o.count}</span>
              </div>
            ))}
          </div>
        )}

        {voters.length > 0 && !isList && <NamedResults voters={voters} />}
      </div>
    </div>
  );
}

// Wyniki imienne - kolumny wg oddanego głosu.
function NamedResults({ voters }: { voters: Voter[] }) {
  const bg = (c: string | null) => c === "YES" ? "rgba(22,163,74,0.16)" : c === "NO" ? "rgba(220,38,38,0.16)" : c === "ABSTAIN" ? "rgba(202,138,4,0.16)" : "#EEF2F7";
  const fg = (c: string | null) => c === "YES" ? "#166534" : c === "NO" ? "#991B1B" : c === "ABSTAIN" ? "#854D0E" : "#475569";
  // Kolejność: za, przeciw, wstrzymało, brak - żeby kolory grupowały się wizualnie.
  const order = (c: string | null) => c === "YES" ? 0 : c === "NO" ? 1 : c === "ABSTAIN" ? 2 : 3;
  const sorted = [...voters].sort((a, b) => order(a.choice) - order(b.choice) || a.name.localeCompare(b.name, "pl"));
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>Wyniki imienne</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {sorted.map((v, i) => (
          <span key={i} style={{
            display: "inline-block", padding: "5px 12px", borderRadius: 8,
            background: bg(v.choice), color: fg(v.choice),
            fontSize: 15, fontWeight: 600, whiteSpace: "nowrap",
          }}>
            {v.name}{v.groupShort ? <span style={{ opacity: 0.7 }}> ({v.groupShort})</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── WYNIKI: wariant BOARD = tablica z prezentacji (bez nagłówka/dołu), skalowana ──
// ── WYNIKI: wariant BOARD = tablica z prezentacji (bez nagłówka/dołu) ──
function ResultsBoard({ meetingId }: { meetingId: string }) {
  // Iframe wypełnia całą wyspę 1:1 - bez sztucznego skalowania i marginesów bocznych.
  // Prezentacja w trybie bare układa się responsywnie i wypełnia szerokość.
  return (
    <div style={{ width: "100%", height: "100%", borderRadius: 16, overflow: "hidden", boxShadow: "0 16px 50px rgba(0,0,0,0.4)", background: "#fff" }}>
      <iframe
        src={`/display/${meetingId}?bare=1`}
        title="Tablica"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ── Lista obecności (tryb ATTENDANCE) - obecni vs nieobecni ──
function AttendancePanel({ voters, compact }: { voters: Voter[]; compact?: boolean }) {
  const present = voters.filter((v) => v.present);
  const absent = voters.filter((v) => !v.present);
  return (
    <div style={{ background: PANEL, color: INK, borderRadius: 16, overflow: "hidden", boxShadow: "0 16px 50px rgba(0,0,0,0.4)" }}>
      <div style={{ padding: "12px 22px", background: "#0F172A", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.02em" }}>Lista obecności</div>
        <div style={{ display: "flex", gap: 22 }}>
          <MiniStat label="Obecni" value={present.length} color="#4ADE80" />
          <MiniStat label="Nieobecni" value={absent.length} color="#FCA5A5" />
        </div>
      </div>
      {compact ? (
        // Duży organ: tylko podsuma liczbowa (bez listy nazwisk).
        <div style={{ padding: "22px", display: "flex", justifyContent: "center", gap: 48 }}>
          <BigStat label="Obecni" value={present.length} color={YES} />
          <BigStat label="Nieobecni" value={absent.length} color={NO} />
          <BigStat label="Uprawnionych" value={voters.length} color={ACCENT} />
        </div>
      ) : (
        <div style={{ padding: "16px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6, maxHeight: "64vh", overflow: "hidden" }}>
          {voters.map((v, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, background: v.present ? "rgba(22,163,74,0.1)" : "#F1F5F9", opacity: v.present ? 1 : 0.6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.present ? YES : "#94A3B8", flexShrink: 0 }} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 15, color: INK }}>
                {v.name}{v.groupShort ? <span style={{ color: MUTED }}> ({v.groupShort})</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Wyniki imienne kworum - chipy obecnych (zielone) i nieobecnych (szare).
function QuorumNames({ voters }: { voters: Voter[] }) {
  const sorted = [...voters].sort((a, b) => (a.present === b.present ? a.name.localeCompare(b.name, "pl") : a.present ? -1 : 1));
  return (
    <div style={{ padding: "0 20px 18px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>Potwierdzenia obecności</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {sorted.map((v, i) => (
          <span key={i} style={{
            display: "inline-block", padding: "5px 12px", borderRadius: 8,
            background: v.present ? "rgba(22,163,74,0.16)" : "#EEF2F7",
            color: v.present ? "#166534" : "#94A3B8",
            fontSize: 15, fontWeight: 600, whiteSpace: "nowrap",
            textDecoration: v.present ? "none" : "line-through",
          }}>
            {v.name}{v.groupShort ? <span style={{ opacity: 0.7 }}> ({v.groupShort})</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function BigStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 72, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>{label}</div>
    </div>
  );
}

function BreakScreen({ text, org, logo, clock, font, variant }: { text: string; org: string; logo: string | null; clock: string; font: string; variant: "break" | "message" }) {
  const bg = variant === "break"
    ? "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)"
    : "linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)";
  return (
    <div style={{ position: "absolute", inset: 0, background: bg, color: "#fff", fontFamily: font, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, animation: "ovFade 400ms ease" }}>
      {logo && <img src={logo} alt="" style={{ height: 96, width: "auto", objectFit: "contain" }} />}
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>{org}</div>
      <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-0.02em", textAlign: "center", maxWidth: "80vw", lineHeight: 1.15 }}>{text || "-"}</div>
      <div style={{ fontSize: 44, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1', color: "rgba(255,255,255,0.9)" }}>{clock}</div>
    </div>
  );
}
