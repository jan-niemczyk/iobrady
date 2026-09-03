"use client";

import { useEffect, useRef, useState } from "react";
import { comparePl } from "@/lib/sortPl";
import { meetingNameWithDate } from "@/lib/meetingName";

interface DisplayData {
  meeting: { id: string; name: string; displayNameOverride?: string | null; number: string; scheduledAt: string; status: string; agendaAutoMode?: string; autoOpenSpeakerList?: boolean };
  organization: string;
  presentation: { font: string; headerColor: string; logoUrl: string | null; overtimeSound: boolean };
  counts: { eligible: number; present: number };
  attendanceCheckOpen?: boolean;
  display: {
    mode: string;
    customMessage: string | null;
    messageObsStyle?: boolean;
    breakUntil?: string | null;
    showCastCount: boolean;
    showByName: boolean;
    summaryAfterClose: boolean;
    showIndividualVotes: boolean;
    candidatePage: number;
    candidateSort: string;
  };
  pinDisplay: { pin: string; present: number; authorized: number; voted: number } | null;
  currentAgendaItem: { number: string; title: string; unnumbered?: boolean } | null;
  pinnedAgendaItem: { number: string; title: string } | null;
  activeVote: VoteView | null;
  lastClosedVote: VoteView | null;
  pinnedVote: VoteView | null;
  speakerList: {
    agendaItemNumber: string | null;
    agendaItemTitle: string | null;
    entries: SpeakerEntry[];
  } | null;
  messages: { id: string; content: string }[];
  formalMotionsList?: { entries: SpeakerEntry[] } | null;
  agenda: { number: string; title: string; status: string; isSubItem?: boolean; unnumbered?: boolean; presenter?: string | null; committee?: string | null }[];
  voters?: { id: string; name: string; present: boolean; groupShort?: string | null; excluded?: boolean }[];
  liveBallots?: { userId: string; userName: string; choice: string | null }[];
}

interface VoteView {
  id: string;
  number: number | null;
  title: string;
  description: string | null;
  type: string;
  visibility: string;
  status: string;
  eligibleCount: number;
  presentCount: number;
  resultYes: number;
  resultNo: number;
  resultAbstain: number;
  resultCastCount: number;
  majorityKind: string;
  majorityBase: string;
  majorityThreshold: number | null;
  options: { label: string; count: number }[];
  packagePositions?: { id: string; label: string; positionNumber?: string | null; description?: string | null; yes: number; no: number; abstain: number; passed: boolean | null }[];
  requireAllPositions?: boolean;
}

interface SpeakerEntry {
  id: string;
  userName: string;
  groupShort: string | null;
  speakerRole?: string | null;
  entryType: string;
  priority?: boolean;
  status: string;
  startedAt: string | null;
  timeLimitSec: number | null;
  timeAdjustmentSec: number;
}

const C = {
  bg: "#FFFFFF",
  ink: "#0F1115",
  ink2: "#3A3F49",
  ink3: "#7A8092",
  accent: "#1B4FB7",
  yes: "#1F7A3A",
  no: "#C8102E",
  abstain: "#B8860B",
  abstainSoft: "#E0C470",
  rule: "rgba(15,17,21,0.10)",
  ruleSoft: "rgba(15,17,21,0.06)",
  highlightYes: "rgba(31,122,58,0.12)",
  highlightNo: "rgba(200,16,46,0.10)",
  highlightAbstain: "rgba(184,134,11,0.14)",
  highlightCast: "rgba(27,79,183,0.13)",
  highlightAbsent: "rgba(15,17,21,0.04)",
};

const FONT = `var(--pres-font, 'Outfit', system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif)`;

/** Mapuje nazwę fontu z ustawień na stos czcionek CSS. */
function fontStack(name: string): string {
  const map: Record<string, string> = {
    "Inter": `'Inter', system-ui, sans-serif`,
    "Lato": `'Lato', system-ui, sans-serif`,
    "Roboto": `'Roboto', system-ui, sans-serif`,
    "DM Sans": `'DM Sans', system-ui, sans-serif`,
    "Source Sans Pro": `'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif`,
    "Outfit": `'Outfit', system-ui, sans-serif`,
    "Open Sans": `'Open Sans', system-ui, sans-serif`,
    // Segoe UI: systemowy w Windows; poza Windows Inter (z Google Fonts) jako zastępstwo.
    "Segoe UI": `'Segoe UI', 'Inter', system-ui, sans-serif`,
  };
  return map[name] ?? map["Inter"];
}

function antiOrphan(text: string): string {
  const shortWords = /(^|\s)(a|i|o|u|w|z|A|I|O|U|W|Z|do|na|we|po|za|ze|od|by|aż|iż|że|to|nr|im|tj|m|pkt|Pkt)\s/g;
  return text.replace(shortWords, "$1$2\u00A0");
}

export function DisplayClient({ meetingId, bare }: { meetingId: string; bare?: boolean }) {
  const [data, setData] = useState<DisplayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const r = await fetch(`/api/display/${meetingId}`, { cache: "no-store" });
        if (!r.ok) { setError(`Błąd ${r.status}`); return; }
        const j = await r.json();
        if (!cancelled) { setData(j); setError(null); }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [meetingId]);

  // W trybie bare (osadzenie w nakładce) nie pokazujemy komunikatów ładowania/błędu -
  // przezroczyste tło, żeby nie migać napisami na transmisji.
  if (error) return bare ? <div /> : <Frame><Center>{error}</Center></Frame>;
  if (!data) return bare ? <div /> : <Frame><Center>Ładowanie…</Center></Frame>;

  const mode = data.display.mode;
  type ViewKind = "default" | "agenda" | "agenda-list" | "vote-active" | "vote-results"
    | "message" | "break" | "speaker-list" | "formal-motions" | "blank" | "attendance" | "pin";
  let view: ViewKind = "default";

  // Tryb „pokaż PIN" ma pierwszeństwo przed każdym innym widokiem, ale TYLKO na prezentacji.
  // Na transmisji (bare) PIN nigdy się nie pojawia.
  if (!bare && data.pinDisplay) view = "pin";
  else if (mode === "BLANK") view = "blank";
  else if (mode === "MESSAGE") view = "message";
  else if (mode === "BREAK") view = "break";
  else if (mode === "PINNED_AGENDA") view = "agenda";
  // PINNED_VOTE tylko gdy jest co pokazać; po odpięciu (zamknięciu komunikatu) spadamy do AUTO poniżej.
  else if (mode === "PINNED_VOTE" && data.pinnedVote) view = "vote-results";
  else if (mode === "SPEAKER_LIST") view = "speaker-list";
  else if (mode === "FORMAL_MOTIONS") view = "formal-motions";
  else if (mode === "ATTENDANCE") view = "attendance";
  else if (mode === "AGENDA_LIST") view = "agenda-list";
  else if (mode === "DEFAULT") view = "default";
  else {
    const hasSpeakers = !!data.speakerList && data.speakerList.entries.some((e) => e.status === "WAITING" || e.status === "SPEAKING");
    const motionSpeaking = !!data.formalMotionsList && data.formalMotionsList.entries.some((e) => e.status === "SPEAKING");
    if (data.activeVote) view = "vote-active";
    // Wyniki zamkniętego głosowania pokazujemy TYLKO gdy operator je przypnie (pinnedVote).
    // Zamknięcie okna wyników przez operatora odpina je -> znikają z prezentacji na stałe
    // (nie wracają samoczynnie po odświeżeniu/nowym kliencie).
    else if (data.pinnedVote) view = "vote-results";
    // Trwa zwykłe sprawdzenie obecności -> ekran listy obecności (w trybie AUTO, bez przełączania trybu).
    else if (data.attendanceCheckOpen) view = "attendance";
    // Wniosek formalny przejmuje ekran TYLKO gdy ktoś w jego ramach przemawia
    // (same oczekujące nie przerywają trwającego przemówienia/dyskusji).
    else if (motionSpeaking) view = "formal-motions";
    // Lista mówców pojawia się w AUTO, gdy ktokolwiek jest zgłoszony lub przemawia
    // (niezależnie od ustawienia autoOpenSpeakerList).
    else if (hasSpeakers) view = "speaker-list";
    else if (data.currentAgendaItem) view = data.meeting.agendaAutoMode === "SINGLE" ? "agenda" : "agenda-list";
    else view = "default";
  }

  // W trybie komunikatu OBS na prezentacji chowamy górny pasek (zostaje sam zegar w rogu).
  const messageObs = view === "message" && !!data.display.messageObsStyle;
  const showTopBar = view !== "blank" && view !== "break" && !bare && !messageObs;
  const pres = data.presentation;

  return (
    <Frame fontVar={fontStack(pres.font)}>
      {showTopBar && (
        <TopBar
          meeting={data.meeting}
          organization={data.organization}
          headerColor={pres.headerColor}
          logoUrl={pres.logoUrl}
          minimal={view === "default"}
        />
      )}

      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: view === "blank" || view === "break" || messageObs ? 0 :
          bare ? (view === "agenda-list" || view === "speaker-list" || view === "attendance" ? "18px 28px" : "14px 28px") :
          view === "agenda-list" || view === "speaker-list" || view === "attendance" ? "28px 48px" :
          "20px 48px",
        justifyContent:
          view === "agenda-list" || view === "speaker-list" || view === "attendance" || view === "vote-active" || view === "vote-results"
            ? "flex-start" : "center",
        minHeight: 0,
        overflow: "hidden",
        fontFamily: FONT,
      }}>
        {view === "pin" && data.pinDisplay && (
          <PinDisplayView pin={data.pinDisplay} />
        )}
        {view === "vote-active" && data.activeVote && (
          <VoteInProgress vote={data.activeVote} display={data.display} liveBallots={data.liveBallots} voters={data.voters} bare={bare} />
        )}
        {view === "vote-results" && data.pinnedVote && (
          <VoteResults
            vote={data.pinnedVote}
            display={data.display}
            liveBallots={data.liveBallots}
            voters={data.voters}
            bare={bare}
          />
        )}
        {view === "agenda" && (data.pinnedAgendaItem ?? data.currentAgendaItem) && (
          <SingleAgendaItem item={(data.pinnedAgendaItem ?? data.currentAgendaItem)!} />
        )}
        {view === "agenda-list" && (
          <AgendaListView agenda={data.agenda} currentNumber={data.currentAgendaItem?.number ?? null} />
        )}
        {view === "speaker-list" && data.speakerList && (
          <SpeakerListView
            list={data.speakerList}
            speaker={data.speakerList.entries.find((e) => e.status === "SPEAKING")}
            soundEnabled={pres.overtimeSound}
          />
        )}
        {view === "formal-motions" && (
          <FormalMotionsView list={data.formalMotionsList ?? null} soundEnabled={pres.overtimeSound} />
        )}
        {view === "attendance" && (
          <AttendanceView voters={data.voters ?? []} counts={data.counts} />
        )}
        {view === "message" && (
          <MessageView
            text={data.display.customMessage ?? ""}
            obsStyle={!!data.display.messageObsStyle}
            organization={data.organization}
            meetingName={meetingNameWithDate(data.meeting.name, data.meeting.scheduledAt)}
            logoUrl={pres.logoUrl}
          />
        )}
        {view === "break" && (
          <BreakView
            breakUntil={data.display.breakUntil ?? null}
            bare={bare}
            headerColor={pres.headerColor}
            logoUrl={pres.logoUrl}
            organization={data.organization}
            meetingName={meetingNameWithDate(data.meeting.name, data.meeting.scheduledAt)}
          />
        )}
        {view === "default" && (
          <DefaultView name={meetingNameWithDate(data.meeting.name, data.meeting.scheduledAt)} nameOverride={data.meeting.displayNameOverride} organization={data.organization} logoUrl={pres.logoUrl} />
        )}
        {view === "blank" && null}
      </main>

      {/* Komunikaty operator→radni NIE są pokazywane na wizualizacji (tylko w aplikacji radnego).
          Tryb pełnoekranowego komunikatu (MESSAGE) to osobna funkcja sterowana przez operatora. */}
    </Frame>
  );
}

// ─── Pomocnicze ─────────────────────────────────────────────────────────

function Frame({ children, fontVar }: { children: React.ReactNode; fontVar?: string }) {
  return (
    <div style={{
      height: "100vh",
      background: C.bg,
      color: C.ink,
      ["--pres-font" as string]: fontVar,
      fontFamily: FONT,
      display: "flex",
      flexDirection: "column",
      letterSpacing: "-0.01em",
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, display: "grid", placeItems: "center", fontSize: 28, color: C.ink3, fontFamily: FONT }}>{children}</div>;
}

// ─── PASEK GÓRNY z zegarem i opcjonalnym licznikiem mówcy ───────────────

/** Sygnał misy dźwiękowej (na wzór wgranego nagrania), rezonans skrócony do ~2 s. */
let sharedAudioCtx: AudioContext | null = null;
function playOvertimeGong() {
  try {
    type WithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || (window as WithWebkit).webkitAudioContext;
    if (!Ctor) return;
    sharedAudioCtx = sharedAudioCtx ?? new Ctor();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    // Uderzenie w misę dźwiękową: czysty, dzwoniący ton. Częstotliwości i proporcje
    // odwzorowane z wgranego nagrania (dominanty ~634 i ~1764 Hz + harmoniczna 3196 Hz).
    // Rezonans celowo skrócony (oryginał brzmiał ~19 s, tutaj ~2 s).
    const strike = (offset: number) => {
      const t0 = ctx.currentTime + offset;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.9, t0);
      master.connect(ctx.destination);

      // [częstotliwość Hz, względna amplituda, czas zaniku s]
      const partials: [number, number, number][] = [
        [634, 1.0, 2.0],    // ton podstawowy
        [1764, 0.85, 1.7],  // druga dominanta (charakterystyczne „dzwonienie")
        [3196, 0.2, 1.1],   // wyższa harmoniczna
        [1268, 0.12, 1.3],  // dopełnienie
      ];
      for (const [freq, amp, decay] of partials) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(amp, t0 + 0.006); // bardzo szybki atak
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + decay + 0.1);
      }
    };
    // Trzy uderzenia w równych odstępach - klasyczny sygnał końca czasu.
    strike(0);
    strike(1.1);
    strike(2.2);
  } catch {
    // brak dźwięku - ignorujemy
  }
}

/** Zwraca true, gdy kolor tła jest ciemny (tekst powinien być jasny). Luminancja wg WCAG. */
function isColorDark(hex: string): boolean {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return true; // nieznany format - zakładamy ciemne tło
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L < 0.45;
}

function TopBar({
  meeting, organization, headerColor, logoUrl, minimal,
}: {
  meeting: DisplayData["meeting"];
  organization: string;
  headerColor: string;
  logoUrl: string | null;
  minimal?: boolean;
}) {
  // Kolor tekstu dobierany automatycznie do jasności tła nagłówka (kontrast).
  const colored = !!headerColor && headerColor.toUpperCase() !== "#FFFFFF";
  const dark = colored ? isColorDark(headerColor) : false;
  const fg = colored ? (dark ? "#FFFFFF" : "#0F1115") : C.ink;
  const fgMuted = colored ? (dark ? "rgba(255,255,255,0.75)" : "rgba(15,17,21,0.65)") : C.ink3;
  return (
    <header style={{
      position: "sticky",
      top: 0,
      zIndex: 10,
      background: colored ? headerColor : C.bg,
      color: fg,
      padding: "18px 48px",
      minHeight: 88,
      boxSizing: "border-box",
      borderBottom: minimal && !colored ? "none" : `1px solid ${colored ? headerColor : C.rule}`,
      display: "flex",
      alignItems: "center",
      justifyContent: minimal ? "flex-end" : "space-between",
      gap: 32,
      fontFamily: FONT,
      flexShrink: 0,
    }}>
      {/* Na ekranie domyślnym nie powielamy logo/organizacji/nazwy (są w części zasadniczej) - zostaje sam zegar. */}
      {!minimal && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0, flex: 1 }}>
          {logoUrl && (
            <img src={logoUrl} alt="" style={{ height: 52, width: "auto", flexShrink: 0, objectFit: "contain" }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: fgMuted }}>
              {antiOrphan(organization)}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: fg }}>
              {antiOrphan(meeting.name)}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexShrink: 0, color: fg }}>
        <Clock color={fg} />
      </div>
    </header>
  );
}

function Clock({ color }: { color?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return (
    <div style={{
      fontFamily: FONT,
      fontVariantNumeric: "tabular-nums",
      fontFeatureSettings: '"tnum" 1',
      fontSize: 32,
      fontWeight: 600,
      color: color ?? C.ink,
      lineHeight: 1,
      letterSpacing: "-0.02em",
      whiteSpace: "nowrap",
    }}>
      {hh}:{mm}
    </div>
  );
}

/** Duży licznik czasu wypowiedzi - po prawej stronie nazwy punktu (widok listy mówców). */
function SpeechTimer({ entry, soundEnabled }: { entry: SpeakerEntry; soundEnabled?: boolean }) {
  const [now, setNow] = useState(Date.now());
  const gongPlayedFor = useRef<string | null>(null);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);
  if (!entry.startedAt) return null;
  const elapsed = Math.floor((now - new Date(entry.startedAt).getTime()) / 1000);
  const effectiveLimit = entry.timeLimitSec != null ? entry.timeLimitSec + (entry.timeAdjustmentSec ?? 0) : null;
  const overtime = effectiveLimit != null && elapsed >= effectiveLimit;

  if (overtime && soundEnabled && gongPlayedFor.current !== entry.id) {
    gongPlayedFor.current = entry.id;
    playOvertimeGong();
  }
  if (!overtime && gongPlayedFor.current === entry.id) gongPlayedFor.current = null;

  const display = overtime ? elapsed - effectiveLimit! : effectiveLimit != null ? effectiveLimit - elapsed : elapsed;
  const sign = overtime ? "-" : "";
  const h = Math.floor(display / 3600);
  const m = Math.floor((display % 3600) / 60);
  const s = display % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div style={{
      flexShrink: 0,
      width: 300,
      textAlign: "right",
      fontFamily: FONT,
      fontVariantNumeric: "tabular-nums",
    }}>
      <div style={{
        fontSize: 13, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase",
        color: overtime ? C.no : C.ink3, marginBottom: 2,
      }}>
        Czas wypowiedzi
      </div>
      <div style={{
        fontSize: 72, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: overtime ? C.no : C.ink, lineHeight: 1, letterSpacing: "-0.03em",
        fontFeatureSettings: '"tnum" 1',
      }}>
        {sign}{pad(h)}:{pad(m)}:{pad(s)}
      </div>
    </div>
  );
}


// ─── DOMYŚLNY EKRAN ─────────────────────────────────────────────────────

function DefaultView({ name, nameOverride, organization, logoUrl }: { name: string; nameOverride?: string | null; organization: string; logoUrl?: string | null }) {
  const hasOverride = !!nameOverride && nameOverride.trim() !== "";
  return (
    <div style={{ textAlign: "center", maxWidth: 1400, margin: "0 auto", width: "100%", fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0 }}>
      {/* Herb / logo organizacji */}
      {logoUrl && (
        <img src={logoUrl} alt="" style={{ height: 180, width: "auto", objectFit: "contain", marginBottom: 32 }} />
      )}
      {/* Nazwa organu - kapitaliki */}
      <div style={{
        fontSize: 30, fontWeight: 700, letterSpacing: "0.18em",
        textTransform: "uppercase", color: C.ink, lineHeight: 1.25,
      }}>
        {antiOrphan(organization)}
      </div>
      <div style={{ height: 4, width: 96, background: C.accent, margin: "36px auto 40px", borderRadius: 2 }} />
      {/* Nazwa posiedzenia */}
      {hasOverride ? (
        <div style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.022em", whiteSpace: "pre-wrap", wordBreak: "break-word", color: C.ink }}>
          {nameOverride}
        </div>
      ) : (
        <div style={{ maxWidth: 1200, fontSize: 52, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.022em", wordBreak: "break-word", color: C.ink }}>
          {antiOrphan(name)}
        </div>
      )}
    </div>
  );
}

// ─── PORZĄDEK OBRAD ─────────────────────────────────────────────────────

function AgendaListView({
  agenda, currentNumber,
}: { agenda: DisplayData["agenda"]; currentNumber: string | null }) {
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (currentRef.current) currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentNumber]);

  return (
    <div style={{ width: "100%", fontFamily: FONT, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <h2 style={{ fontSize: 42, fontWeight: 600, marginBottom: 24, color: C.ink, flexShrink: 0, fontFamily: FONT }}>
        Porządek obrad
      </h2>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6, overflow: "auto", flex: 1, minHeight: 0 }}>
        {agenda.map((a) => {
          const isCurrent = a.number === currentNumber;
          const isDone = a.status === "COMPLETED";
          const isPaused = a.status === "PAUSED";
          return (
            <li
              key={a.number}
              ref={isCurrent ? currentRef : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginLeft: a.isSubItem ? 56 : 0,
                padding: isCurrent ? "18px 22px" : "10px 22px",
                borderRadius: 8,
                border: isCurrent ? `2px solid ${C.yes}` : `1px solid ${C.rule}`,
                background: isCurrent ? C.highlightYes : "transparent",
                fontSize: isCurrent ? 28 : a.isSubItem ? 20 : 22,
                fontWeight: isCurrent ? 600 : 400,
                opacity: isDone ? 0.55 : 1,
              }}
            >
              <span style={{
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                color: isCurrent ? C.yes : C.accent,
                opacity: isCurrent ? 1 : 0.75,
                minWidth: isCurrent ? 56 : 44,
              }}>
                {a.unnumbered ? "-" : `${a.number}.`}
              </span>
              <span style={{ flex: 1 }}>
                {antiOrphan(a.title)}
                {(a.presenter || a.committee) && !isCurrent && (
                  <span style={{ display: "block", fontSize: 15, color: C.ink3, fontWeight: 400, marginTop: 2 }}>
                    {[a.presenter && `referuje: ${a.presenter}`, a.committee && `opinia: ${a.committee}`].filter(Boolean).join("     ")}
                  </span>
                )}
                {(a.presenter || a.committee) && isCurrent && (
                  <span style={{ display: "block", fontSize: 18, color: C.ink3, fontWeight: 400, marginTop: 4 }}>
                    {[a.presenter && `referuje: ${a.presenter}`, a.committee && `opinia: ${a.committee}`].filter(Boolean).join("     ")}
                  </span>
                )}
              </span>
              {isPaused && <span style={{ fontSize: 14, color: C.ink3 }}>zawieszony</span>}
              {isDone && <span style={{ fontSize: 20, color: C.yes }}>✓</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── POJEDYNCZY PUNKT - "Pkt X. porz. obrad" + tytuł centralnie ─────────

function SingleAgendaItem({ item }: { item: { number: string; title: string; unnumbered?: boolean } }) {
  return (
    <div style={{
      position: "relative",
      width: "100%",
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      fontFamily: FONT,
      minHeight: 0,
      padding: "0 48px",
    }}>
      {/* Etykieta w lewym górnym rogu - jak w widoku listy mówców; pomijana dla pozycji bez numeru */}
      {!item.unnumbered && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          fontSize: 40,
          fontWeight: 700,
          color: C.ink,
          whiteSpace: "nowrap",
        }}>
          Pkt {item.number}. porz. obrad
        </div>
      )}
      {/* Nazwa punktu - wyśrodkowana, stały rozmiar 50px */}
      <div style={{
        maxWidth: 1600,
        textAlign: "center",
        fontSize: 50,
        fontWeight: 500,
        lineHeight: 1.2,
        letterSpacing: "-0.015em",
        color: C.ink,
      }}>
        {antiOrphan(item.title)}
      </div>
    </div>
  );
}

// ─── GŁOSOWANIE W TOKU ──────────────────────────────────────────────────

function VoteInProgress({
  vote, display, liveBallots, voters, bare,
}: {
  vote: VoteView;
  display: DisplayData["display"];
  liveBallots?: DisplayData["liveBallots"];
  voters?: DisplayData["voters"];
  bare?: boolean;
}) {
  const isList = vote.type === "LIST";
  const isQuorum = vote.type === "QUORUM";
  const isPackage = vote.type === "PACKAGE";

  // W TRAKCIE głosowania pakiet zachowuje się jak lista: tablica imienna (kto oddał) dla jawnych,
  // bez pokazywania pozycji ani indywidualnych głosów. Wynik cząstkowy pojawia się dopiero po zamknięciu.
  const showNameBoard = display.showByName && voters && vote.visibility !== "SECRET";

  // Podsuma: zawsze trzy kafelki (uprawnionych/obecnych/oddano)
  const stats = (
    <SummaryRowAttendance
      eligible={vote.eligibleCount}
      present={vote.presentCount}
      cast={vote.resultCastCount}
      castLabel={isQuorum ? "Potwierdziło" : "Oddało głos"}
    />
  );

  if (showNameBoard && liveBallots) {
    return (
      <NameBoardLayout
        vote={vote}
        live
        bare={bare}
        ballots={liveBallots}
        voters={voters!}
        showIndividualVotes={!isList && !isPackage && display.showIndividualVotes}
        isQuorum={isQuorum}
        stats={stats}
        threshold={vote.majorityThreshold}
        thresholdLabel={vote.majorityThreshold != null ? majorityLabel(vote.majorityKind, vote.majorityBase) : null}
        majLabel={majorityTileLabel(vote.majorityKind)}
        majValue={vote.majorityThreshold}
      />
    );
  }

  // Klasyczny widok z dużymi licznikami - bez tablicy
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", width: "100%", fontFamily: FONT, display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", minHeight: 0 }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 12,
          padding: "8px 18px",
          borderRadius: 999,
          background: C.highlightNo,
          color: C.no,
          fontSize: 14, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase",
        }}>
          <PulseDot />
          Trwa głosowanie {vote.visibility === "SECRET" ? "tajne" : "jawne"}
        </span>
      </div>

      {vote.number != null && (
        <div style={{ fontSize: 22, color: C.ink3, marginBottom: 12, fontWeight: 500, textAlign: "center" }}>
          Głosowanie nr {vote.number}
        </div>
      )}

      {/* Tytuł - stały rozmiar, spójny między widokami (bez animacji przy przełączaniu) */}
      <div style={{ margin: "0 auto 28px", maxWidth: 1600, textAlign: "center" }}>
        <div style={{
          fontSize: 44, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.02em",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {antiOrphan(vote.title)}
        </div>
      </div>

      {/* Podsuma - wierszami w pionie, duża, w stylu listy obecności */}
      <StatColumns
        items={isQuorum ? [
          // Kworum = sprawdzenie obecności od zera. Obecny = kto oddał głos; nieobecny = reszta uprawnionych.
          { label: "Uprawnionych", value: vote.eligibleCount },
          { label: "Obecnych", value: vote.resultCastCount, color: C.yes },
          { label: "Nieobecnych", value: Math.max(0, vote.eligibleCount - vote.resultCastCount), color: C.no },
        ] : isPackage && vote.requireAllPositions !== false ? [
          // Pakiet z wymogiem oddania głosu na WSZYSTKIE pozycje: liczba głosujących jest wspólna
          // dla całego pakietu - pokazujemy ją jako osobny kafelek „GŁOSOWAŁO" (równej wielkości).
          { label: "Uprawnionych", value: vote.eligibleCount },
          { label: "Obecnych", value: vote.presentCount, color: C.yes },
          { label: "Głosowało", value: vote.resultCastCount, color: C.accent },
        ] : [
          { label: "Uprawnionych", value: vote.eligibleCount },
          { label: "Obecnych", value: vote.presentCount, color: C.yes },
          { label: display.showCastCount || vote.visibility === "SECRET"
              ? "Oddało głos"
              : null,
            value: vote.resultCastCount,
            color: C.accent },
        ]}
      />

      {/* Pakiet W TRAKCIE głosowania: nie pokazujemy pozycji (analogicznie do listy) - tylko licznik
          obecnych / oddanych głosów (a przy tablicy imiennej - kto oddał, dla jawnych). Pozycje z
          wynikami cząstkowymi pokazują się dopiero w wyniku (VoteResults). */}

      {vote.majorityThreshold != null && (
        <div style={{ marginTop: 24, fontSize: 20, color: C.ink3, fontWeight: 500, textAlign: "center" }}>
          Wymagana większość:{" "}
          <span style={{ fontWeight: 600, color: C.accent }}>{vote.majorityThreshold}</span>{" "}
          ({majorityLabel(vote.majorityKind, vote.majorityBase)})
        </div>
      )}
    </div>
  );
}

// Pozycje pakietu na prezentacji, z paginacją (jak lista kandydatów) - domyślnie 6 na stronę.
// Przełączanie sterowane wspólnym licznikiem display.candidatePage (operator "następna strona").
function PackagePositionsView({ positions, secret, page }: {
  positions: { id: string; positionNumber?: string | null; label: string; yes: number; no: number; abstain: number }[];
  secret: boolean;
  page: number;
}) {
  const PER_PAGE = 6;
  const pageCount = Math.max(1, Math.ceil(positions.length / PER_PAGE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const slice = positions.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);
  return (
    <div style={{ margin: "0 auto 20px", maxWidth: 1200, width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      {slice.map((p, i) => (
        <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 16, alignItems: "center", padding: "10px 20px", border: `1px solid ${C.rule}`, borderRadius: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 500 }}>{p.positionNumber ? `${p.positionNumber}. ` : `${safePage * PER_PAGE + i + 1}. `}{p.label}</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: C.yes, fontVariantNumeric: "tabular-nums" }}>za {secret ? "-" : p.yes}</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: C.no, fontVariantNumeric: "tabular-nums" }}>przeciw {secret ? "-" : p.no}</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: C.abstain, fontVariantNumeric: "tabular-nums" }}>wstrz. {secret ? "-" : p.abstain}</span>
        </div>
      ))}
      {pageCount > 1 && (
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 18, color: C.ink3, fontWeight: 500 }}>
          Strona {safePage + 1} z {pageCount} (pozycje {safePage * PER_PAGE + 1}-{Math.min(positions.length, safePage * PER_PAGE + PER_PAGE)} z {positions.length})
        </div>
      )}
    </div>
  );
}

// Trzy kafelki podsumy w jednym rzędzie (jak na liście obecności)
function SummaryRowAttendance({
  eligible, present, cast, castLabel = "Oddało głos", majorityLabelText, majorityValue,
}: { eligible: number; present: number; cast: number; castLabel?: string; majorityLabelText?: string | null; majorityValue?: number | null }) {
  const showMajority = !!majorityLabelText && majorityValue != null;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: showMajority ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr",
      gap: 16,
      width: "100%",
      fontFamily: FONT,
    }}>
      <StatTile label="Uprawnionych" value={eligible} />
      <StatTile label="Obecnych" value={present} color={C.yes} />
      <StatTile label={castLabel} value={cast} color={C.accent} />
      {showMajority && <StatTile label={majorityLabelText!} value={majorityValue!} color={C.ink2} />}
    </div>
  );
}

// Kafelek statystyki dużej rozmiarówki. stacked=true: etykieta nad liczbą, wyśrodkowane
// (dla rzędu kafelków, by wszystkie były równe niezależnie od długości etykiety).
function StatTile({ label, value, color, textValue, compact, stacked }: { label: string; value?: number; color?: string; textValue?: string; compact?: boolean; stacked?: boolean }) {
  return (
    <div style={{
      padding: compact ? "10px 14px" : "16px 22px",
      border: `1px solid ${C.rule}`,
      borderRadius: 12,
      display: "flex",
      flexDirection: stacked ? "column" : "row",
      alignItems: "center",
      justifyContent: stacked ? "center" : "space-between",
      gap: stacked ? 6 : 8,
      textAlign: stacked ? "center" : "left",
      fontFamily: FONT,
    }}>
      <span style={{
        fontSize: compact ? 18 : 22, fontWeight: 600, letterSpacing: compact ? "0.05em" : "0.14em",
        textTransform: "uppercase", color: C.ink3, whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: textValue ? (compact ? 28 : 34) : (compact ? 44 : 56), fontWeight: 600, fontVariantNumeric: "tabular-nums",
        color: color ?? C.ink, lineHeight: 1, letterSpacing: "-0.025em",
      }}>
        {textValue ?? value}
      </span>
    </div>
  );
}

// Wersja w pionie (klasyczny widok głosowania bez tablicy) - duże etykiety i liczby w jednym rzędzie
function StatColumns({
  items,
}: { items: { label: string | null; value?: number; color?: string; textValue?: string }[] }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      maxWidth: 1000,
      margin: "0 auto",
      width: "100%",
    }}>
      {items.filter((i) => i.label != null).map((i, idx) => (
        <StatTile key={idx} label={i.label!} value={i.value} color={i.color} textValue={i.textValue} />
      ))}
    </div>
  );
}

function PulseDot() {
  return (
    <span style={{
      width: 10, height: 10, borderRadius: "50%",
      background: C.no,
      animation: "esog-pulse 1.6s infinite",
    }}>
      <style>{`@keyframes esog-pulse { 0%{box-shadow:0 0 0 0 ${C.no}99} 70%{box-shadow:0 0 0 12px ${C.no}00} 100%{box-shadow:0 0 0 0 ${C.no}00} }`}</style>
    </span>
  );
}

// ─── WYNIKI ZAMKNIĘTEGO GŁOSOWANIA ──────────────────────────────────────

function VoteResults({
  vote, display, liveBallots, voters, bare,
}: {
  vote: VoteView;
  display: DisplayData["display"];
  liveBallots?: DisplayData["liveBallots"];
  voters?: DisplayData["voters"];
  bare?: boolean;
}) {
  const isList = vote.type === "LIST";
  const isQuorum = vote.type === "QUORUM";
  const isPackage = vote.type === "PACKAGE";
  const isStandard = !isList && !isQuorum && !isPackage;

  // Pakiet ma własny widok: tytuł + pozycje z kolumnami ZA/PRZECIW/WSTRZYM.
  if (isPackage) {
    return <PackageResults vote={vote} bare={bare} requireAll={vote.requireAllPositions !== false} />;
  }
  // Tryb "po zamknięciu tylko podsuma": VoteResults to widok zamkniętego głosowania,
  // więc gdy flaga włączona, nie pokazujemy tablicy nazwisk (sama podsuma).
  const showNameBoard = display.showByName && !display.summaryAfterClose
    && (isStandard || isQuorum) && voters && vote.visibility !== "SECRET";

  // Wymagana większość: etykieta (nazwa) + próg liczbowy. Null dla zwykłej - nie pokazujemy.
  const majLabel = majorityTileLabel(vote.majorityKind);
  const majValue = vote.majorityThreshold;

  // Podsuma w WIERSZACH (jak w trakcie) - dla klasycznego widoku bez tablicy
  const statsRows = isStandard ? (
    <StatColumns
      items={[
        { label: "Głosowało", value: vote.resultCastCount, color: C.accent },
        ...(majLabel && majValue != null ? [{ label: majLabel, value: majValue, color: C.ink2 }] : []),
        { label: "ZA", value: vote.resultYes, color: C.yes },
        { label: "Przeciw", value: vote.resultNo, color: C.no },
        { label: "Wstrzymało się", value: vote.resultAbstain, color: C.abstain },
      ]}
    />
  ) : isQuorum ? (
    <StatColumns
      items={[
        { label: "Uprawnionych", value: vote.eligibleCount },
        { label: "Obecni", value: vote.resultCastCount, color: C.yes },
        { label: "Nieobecni", value: vote.eligibleCount - vote.resultCastCount, color: C.ink3 },
      ]}
    />
  ) : (
    <SummaryRowAttendance
      eligible={vote.eligibleCount}
      present={vote.presentCount}
      cast={vote.resultCastCount}
      castLabel="Głosowało"
      majorityLabelText={majLabel}
      majorityValue={majValue}
    />
  );

  // Podsuma KOMPAKTOWA (rząd kafelków) - nad tablicą nazwisk, by nie zajmować pionu.
  // Po zamknięciu dorzucamy wymaganą większość do rzędu kafelków (jest miejsce).
  const statsCompact = isStandard ? (
    <SummaryGlosowanie
      cast={vote.resultCastCount}
      yes={vote.resultYes}
      no={vote.resultNo}
      abstain={vote.resultAbstain}
      majLabel={bare ? majLabel : null}
      majValue={bare ? majValue : null}
      bare={bare}
    />
  ) : isQuorum ? (
    <SummaryRowAttendance
      eligible={vote.eligibleCount}
      present={vote.resultCastCount}
      cast={vote.eligibleCount - vote.resultCastCount}
      castLabel="Nieobecni"
    />
  ) : (
    <SummaryRowAttendance
      eligible={vote.eligibleCount}
      present={vote.presentCount}
      cast={vote.resultCastCount}
      castLabel="Głosowało"
      majorityLabelText={majLabel}
      majorityValue={majValue}
    />
  );

  if (showNameBoard && liveBallots) {
    return (
      <NameBoardLayout
        vote={vote}
        live={false}
        bare={bare}
        ballots={liveBallots}
        voters={voters!}
        // Po zakończeniu JAWNEGO głosowania ZAWSZE pokazujemy indywidualne stanowiska
        showIndividualVotes={isStandard}
        isQuorum={isQuorum}
        stats={statsCompact}
        threshold={vote.majorityThreshold}
        thresholdLabel={vote.majorityThreshold != null ? majorityLabel(vote.majorityKind, vote.majorityBase) : null}
        majLabel={majLabel}
        majValue={majValue}
      />
    );
  }

  // Klasyczny widok wyników (bez tablicy)
  return (
    <div style={{
      width: "100%", fontFamily: FONT,
      display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minHeight: 0,
    }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{
          fontSize: 18, fontWeight: 600, letterSpacing: "0.2em",
          textTransform: "uppercase", color: C.ink3,
        }}>
          {vote.number != null ? `Głosowanie nr ${vote.number}` : "Głosowanie"}
        </span>
      </div>

      <div style={{ margin: "0 auto 28px", textAlign: "center", maxWidth: 1600 }}>
        <div style={{
          fontSize: 44, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.02em",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {antiOrphan(vote.title)}
        </div>
      </div>

      {statsRows}

      {isList && (
        <CandidateResults
          options={vote.options}
          page={display.candidatePage}
        />
      )}
    </div>
  );
}

// Tryb „pokaż PIN": u góry podsuma potwierdzeń, na środku duży PIN.
// Etykieta rodzaju zgłoszenia mówcy (wniosek formalny / ad vocem / priorytet / zwykłe).
function entryTypeLabel(entryType: string, priority?: boolean): string | null {
  if (entryType === "FORMAL_MOTION") return "Wniosek formalny";
  if (entryType === "AD_VOCEM") return "Ad vocem";
  if (priority) return "Zgłoszenie z priorytetem";
  return null;
}

function PinDisplayView({ pin }: { pin: { pin: string; present: number; authorized: number; voted: number } }) {
  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 40 }}>
      <div style={{ display: "flex", gap: 56 }}>
        <StatBig label="Obecni" value={pin.present} color={C.accent} />
        <StatBig label="Autoryzowani PIN-em" value={pin.authorized} color={C.yes} />
        <StatBig label="Oddało głos" value={pin.voted} color={C.ink2} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.ink3, marginBottom: 16 }}>
          Wprowadź PIN, aby głosować
        </div>
        <div style={{
          fontSize: 220, fontWeight: 800, letterSpacing: "0.15em", lineHeight: 1,
          fontVariantNumeric: "tabular-nums", color: C.ink,
        }}>
          {pin.pin}
        </div>
      </div>
    </div>
  );
}

function StatBig({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 72, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 18, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: C.ink3, marginTop: 8 }}>{label}</div>
    </div>
  );
}

// Widok wyników głosowania pakietowego (po zamknięciu): tytuł + pozycje z kolumnami.
// Gdy wymagane wszystkie pozycje - frekwencja „Głosowało" w pasku nad kolumnami (wspólna).
// Gdy głosowanie częściowe - dodatkowa kolumna „Głosowało" per pozycja (różna liczba na pozycję).
function PackageResults({ vote, bare, requireAll }: { vote: VoteView; bare?: boolean; requireAll: boolean }) {
  const positions = vote.packagePositions ?? [];
  const numW = bare ? 40 : 54;
  const colW = bare ? 78 : 108;
  const fsLabel = bare ? 19 : 24;
  const fsNum = bare ? 24 : 32;
  const fsHead = bare ? 12 : 15;

  const totalGlosowalo = vote.resultCastCount;

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: bare ? 8 : 14 }}>
        {vote.number != null && (
          <div style={{ fontSize: bare ? 15 : 19, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink3 }}>
            Głosowanie nr {vote.number}
          </div>
        )}
        <div style={{ fontSize: bare ? 22 : 30, fontWeight: 600, lineHeight: 1.2 }}>{antiOrphan(vote.title)}</div>
      </div>

      {/* Kafelki podsumy jak w trwającym głosowaniu; przy wymogu wszystkich pozycji dochodzi "Głosowało". */}
      {requireAll ? (
        <div style={{ marginBottom: bare ? 8 : 14 }}>
          <SummaryRowAttendance
            eligible={vote.eligibleCount}
            present={vote.presentCount}
            cast={totalGlosowalo}
            castLabel="Głosowało"
          />
        </div>
      ) : null}

      {/* nagłówek kolumn */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 12px", color: C.ink3, fontSize: fsHead, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        <span style={{ width: numW }}></span>
        <span style={{ flex: 1 }}></span>
        {!requireAll && <span style={{ width: colW, textAlign: "center", color: C.ink3 }}>Głosowało</span>}
        <span style={{ width: colW, textAlign: "center", color: C.yes }}>Za</span>
        <span style={{ width: colW, textAlign: "center", color: C.no }}>Przeciw</span>
        <span style={{ width: colW, textAlign: "center", color: C.abstain }}>Wstrzym.</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: bare ? 5 : 8, overflow: "auto", flex: 1, minHeight: 0 }}>
        {positions.map((p, i) => (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: bare ? "7px 12px" : "10px 16px",
            background: C.highlightAbsent, borderRadius: 10,
          }}>
            <span style={{ width: numW, fontSize: fsNum, fontWeight: 700, color: C.ink3, fontVariantNumeric: "tabular-nums" }}>
              {p.positionNumber ?? i + 1}
            </span>
            <span style={{ flex: 1, fontSize: fsLabel, fontWeight: 500, lineHeight: 1.15 }}>{p.label}</span>
            {!requireAll && (
              <span style={{ width: colW, textAlign: "center", fontSize: fsNum, fontWeight: 700, color: C.ink2, fontVariantNumeric: "tabular-nums" }}>{p.yes + p.no + p.abstain}</span>
            )}
            <span style={{ width: colW, textAlign: "center", fontSize: fsNum, fontWeight: 700, color: C.yes, fontVariantNumeric: "tabular-nums" }}>{p.yes}</span>
            <span style={{ width: colW, textAlign: "center", fontSize: fsNum, fontWeight: 700, color: C.no, fontVariantNumeric: "tabular-nums" }}>{p.no}</span>
            <span style={{ width: colW, textAlign: "center", fontSize: fsNum, fontWeight: 700, color: C.abstain, fontVariantNumeric: "tabular-nums" }}>{p.abstain}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Podsuma standardowa: GŁOSOWAŁO / [większość] / ZA / PRZECIW / WSTRZYMAŁO SIĘ.
// Na transmisji (bare) mniejszy font i większość zaraz po „Głosowało".
function SummaryGlosowanie({
  cast, yes, no, abstain, majLabel, majValue, bare,
}: { cast: number; yes: number; no: number; abstain: number; majLabel?: string | null; majValue?: number | null; bare?: boolean }) {
  const showMaj = majLabel && majValue != null;
  const cols = showMaj ? 5 : 4;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: bare ? 10 : 14,
      width: "100%",
      fontFamily: FONT,
    }}>
      <StatTile label="Głosowało" value={cast} color={C.accent} compact={bare} />
      {showMaj && <StatTile label={majLabel!} value={majValue!} color={C.ink2} compact={bare} />}
      <StatTile label="ZA" value={yes} color={C.yes} compact={bare} />
      <StatTile label="Przeciw" value={no} color={C.no} compact={bare} />
      <StatTile label="Wstrzymało się" value={abstain} color={C.abstain} compact={bare} />
    </div>
  );
}

function majorityLabel(kind: string, base: string): string {
  const k = kind === "SIMPLE" ? "zwykła"
    : kind === "ABSOLUTE" ? "bezwzględna"
    : kind === "QUALIFIED_TWO_THIRDS" ? "2/3"
    : kind === "QUALIFIED_THREE_FIFTHS" ? "3/5"
    : kind;
  const b = base === "OF_VOTERS" ? "głosujących"
    : base === "OF_PRESENT" ? "obecnych"
    : base === "OF_FULL_BODY" ? "ustawowego składu" : base;
  return `${k} - ${b}`;
}

/** Etykieta kafelka wymaganej większości. Zwraca null dla zwykłej (nie pokazujemy kafelka). */
function majorityTileLabel(kind: string): string | null {
  switch (kind) {
    case "SIMPLE": return null;               // zwykła - progu nie pokazujemy
    case "ABSOLUTE": return "W. bezwzględna";
    case "QUALIFIED_TWO_THIRDS": return "W. 2/3";
    case "QUALIFIED_THREE_FIFTHS": return "W. 3/5";
    default: return null;
  }
}

// ─── TABLICA NAZWISK (live lub po zamknięciu) ───────────────────────────

function NameBoardLayout({
  vote, live, bare, ballots, voters, showIndividualVotes, isQuorum, stats, majLabel, majValue,
}: {
  vote: VoteView;
  live: boolean;
  bare?: boolean;
  ballots: NonNullable<DisplayData["liveBallots"]>;
  voters: NonNullable<DisplayData["voters"]>;
  showIndividualVotes: boolean;
  isQuorum: boolean;
  stats: React.ReactNode;
  threshold?: number | null;
  thresholdLabel?: string | null;
  majLabel?: string | null;
  majValue?: number | null;
}) {
  const choiceByUser = new Map<string, string | null>();
  for (const b of ballots) choiceByUser.set(b.userId, b.choice);
  // Wykluczeni z posiedzenia - wyczernieni, mają pierwszeństwo nad stanem głosu.
  for (const v of voters) if (v.excluded) choiceByUser.set(v.id, "_EXCLUDED_");

  // Powyżej 40 osób kafelki przestają się mieścić - przechodzimy na układ inline
  // (nazwiska "w ciągu", grupowane wg stanowiska), który skaluje się dużo lepiej.
  const useInline = voters.length > 40;

  // Dla kafelków: 2 kolumny do 24 osób, dalej 3.
  const colCount = voters.length >= 25 ? 3 : 2;
  const perColumn = Math.ceil(voters.length / colCount);
  const cols: typeof voters[] = [];
  for (let i = 0; i < colCount; i++) {
    cols.push(voters.slice(i * perColumn, (i + 1) * perColumn));
  }

  return (
    <div style={{ width: "100%", fontFamily: FONT, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          {live && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "4px 12px", borderRadius: 999,
              background: C.highlightNo, color: C.no,
              fontSize: 16, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase",
            }}>
              <PulseDot /> Trwa głosowanie
            </span>
          )}          {!live && (
            <span style={{
              fontSize: 24, fontWeight: 600, letterSpacing: "0.05em",
              textTransform: "uppercase", color: C.ink3,
            }}>
              {vote.number != null ? `Głosowanie nr ${vote.number}` : "Głosowanie"}
            </span>
          )}
          {/* Wymagana większość - owal po prawej (prezentacja). Na transmisji (bare)
              pokazujemy ją w kafelkach podsumy, więc owal chowamy. */}
          {!bare && majLabel && majValue != null && (
            <span style={{
              marginLeft: "auto",
              display: "inline-flex", alignItems: "baseline", gap: 10,
              padding: "6px 18px", borderRadius: 999,
              border: `2px solid ${C.rule}`, background: C.highlightAbsent,
              whiteSpace: "nowrap",
            }}>
              <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.ink3 }}>
                {majLabel}
              </span>
              <span style={{ fontSize: 26, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                {majValue}
              </span>
            </span>
          )}
        </div>
        <div style={{
          fontSize: 27, fontWeight: 600, lineHeight: 1.3,
          maxHeight: "3.9em", overflow: "hidden",
        }}>
          {antiOrphan(vote.title)}
        </div>
      </div>

      <div style={{ marginBottom: 12, flexShrink: 0 }}>{stats}</div>

      {useInline ? (
        <InlineNameBoard
          voters={voters}
          choiceByUser={choiceByUser}
          showIndividualVotes={showIndividualVotes}
          isQuorum={isQuorum}
          live={live}
        />
      ) : (
        <NameGrid
          cols={cols}
          choiceByUser={choiceByUser}
          showIndividualVotes={showIndividualVotes}
          isQuorum={isQuorum}
          live={live}
        />
      )}
    </div>
  );
}

function NameGrid({
  cols, choiceByUser, showIndividualVotes, isQuorum, live,
}: {
  cols: NonNullable<DisplayData["voters"]>[];
  choiceByUser: Map<string, string | null>;
  showIndividualVotes: boolean;
  isQuorum: boolean;
  live: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rows = Math.max(...cols.map((c) => c.length), 1);

  // Skalowanie: mierzymy dostępną wysokość kontenera i dobieramy wysokość kafelka
  // oraz rozmiar czcionki tak, by WSZYSTKIE rzędy zmieściły się na ekranie.
  // Startujemy od małych wartości, żeby pierwszy render nigdy nie wypchnął kontenera
  // (a tym samym nie uciął ostatnich rzędów), a potem powiększamy do dostępnej wysokości.
  const [scale, setScale] = useState<{ fs: number; padV: number; gap: number }>({ fs: 15, padV: 3, gap: 4 });
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const h = el.clientHeight;
      if (h <= 0) { raf = requestAnimationFrame(measure); return; }
      const gap = rows > 16 ? 3 : 4;
      // wysokość przypadająca na jeden rząd (z odjęciem przerw między kafelkami)
      let perRow = (h - (rows - 1) * gap) / rows;
      // OGRANICZENIE: kafelek nie może być wyższy niż 76px, żeby przy małej liczbie osób
      // nie rozpychał się na cały ekran (estetyka). Nadmiar miejsca zostaje jako pusta przestrzeń.
      perRow = Math.min(perRow, 76);
      const usable = perRow - 2;
      // font ~40% wysokości kafelka, ograniczony do 15-30 px
      const fs = Math.max(15, Math.min(30, Math.floor(usable * 0.42)));
      const padV = Math.max(2, Math.min(20, Math.floor((usable - fs * 1.2) / 2)));
      setScale({ fs, padV, gap });
    };
    raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [rows, cols.length]);

  return (
    <div ref={wrapRef} style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
      gap: 6,
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    }}>
      {cols.map((col, ci) => (
        <ul key={ci} style={{
          listStyle: "none", padding: 0, margin: 0,
          display: "flex", flexDirection: "column", gap: scale.gap,
        }}>
          {col.map((v, i) => {
            const c = choiceByUser.get(v.id);
            const hasVoted = choiceByUser.has(v.id);
            const offset = cols.slice(0, ci).reduce((acc, cc) => acc + cc.length, 0);

            let label: string;
            let color: string = C.ink3;
            let bg: string = "transparent";

            if (c === "_EXCLUDED_") {
              // Wykluczony z posiedzenia - wyszarzony (nie czarny), nie liczy się do obecności/głosowania.
              label = "wykluczony";
              color = C.ink3;
              bg = "rgba(15,17,21,0.12)";
            } else if (!v.present && !isQuorum) {
              label = "nieobecny";
              color = C.ink3;
              bg = C.highlightAbsent;
            } else if (showIndividualVotes && c) {
              if (isQuorum) {
                label = "obecny";
                color = C.accent;
                bg = C.highlightCast;
              } else {
                label = c === "YES" ? "za" : c === "NO" ? "przeciw" : c === "ABSTAIN" ? "wstrzymuję się" : "obecny";
                color = c === "YES" ? C.yes : c === "NO" ? C.no : c === "ABSTAIN" ? C.abstain : C.ink3;
                bg = c === "YES" ? C.highlightYes : c === "NO" ? C.highlightNo : c === "ABSTAIN" ? C.highlightAbstain : "transparent";
              }
            } else if (hasVoted) {
              label = c === "_PRESENT_" ? "obecny" : (isQuorum ? "obecny" : "oddany");
              color = C.accent;
              bg = C.highlightCast;
            } else {
              if (isQuorum) {
                label = "nieobecny";
                color = C.ink3;
                bg = C.highlightAbsent;
              } else if (live) {
                label = "";
                color = C.ink3;
                bg = "transparent";
              } else {
                label = "obecny";
                color = C.accent;
                bg = C.highlightCast;
              }
            }

            return (
              <li key={v.id} style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                padding: `${scale.padV}px 14px`,
                background: bg,
                borderRadius: 6,
                border: `1px solid ${C.ruleSoft}`,
                fontSize: scale.fs,
                fontWeight: 500,
                gap: 10,
                minWidth: 0,
                lineHeight: 1.15,
                opacity: c === "_EXCLUDED_" ? 0.55 : 1,
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: C.ink3, fontVariantNumeric: "tabular-nums", marginRight: 6, fontWeight: 400 }}>{offset + i + 1}.</span>
                  {v.name}
                  {v.groupShort && <span style={{ color: C.ink3, fontWeight: 400, marginLeft: 5 }}>({v.groupShort})</span>}
                </span>
                <span style={{ color, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}

// Układ inline dla dużych list (>40): nazwiska "w ciągu", grupowane wg stanowiska.
function InlineNameBoard({
  voters, choiceByUser, showIndividualVotes, isQuorum, live,
}: {
  voters: NonNullable<DisplayData["voters"]>;
  choiceByUser: Map<string, string | null>;
  showIndividualVotes: boolean;
  isQuorum: boolean;
  live: boolean;
}) {
  // Klasyfikacja każdej osoby do grupy.
  type Group = "yes" | "no" | "abstain" | "cast" | "present" | "absent";
  const groups: Record<Group, NonNullable<DisplayData["voters"]>> = {
    yes: [], no: [], abstain: [], cast: [], present: [], absent: [],
  };
  for (const v of voters) {
    const c = choiceByUser.get(v.id);
    const hasVoted = choiceByUser.has(v.id);
    if (!v.present && !isQuorum) { groups.absent.push(v); continue; }
    if (isQuorum) {
      if (hasVoted) groups.cast.push(v); else groups.absent.push(v);
      continue;
    }
    if (showIndividualVotes && c) {
      if (c === "YES") groups.yes.push(v);
      else if (c === "NO") groups.no.push(v);
      else if (c === "ABSTAIN") groups.abstain.push(v);
      else groups.cast.push(v);
    } else if (hasVoted) {
      groups.cast.push(v);
    } else if (live) {
      groups.present.push(v); // jeszcze nie głosował, czekamy
    } else {
      groups.cast.push(v); // po zamknięciu: obecny
    }
  }

  const sections: { key: Group; title: string; color: string }[] = showIndividualVotes && !isQuorum
    ? [
        { key: "yes", title: "ZA", color: C.yes },
        { key: "no", title: "PRZECIW", color: C.no },
        { key: "abstain", title: "WSTRZYMAŁO SIĘ", color: C.abstain },
        ...(live ? [{ key: "present" as Group, title: "JESZCZE NIE GŁOSOWALI", color: C.ink3 }] : []),
        { key: "absent", title: "NIEOBECNI", color: C.ink2 },
      ]
    : [
        { key: isQuorum ? "cast" : "cast", title: isQuorum ? "POTWIERDZILI OBECNOŚĆ" : "ODDALI GŁOS", color: C.accent },
        ...(live ? [{ key: "present" as Group, title: "NIE ODDALI GŁOSU", color: C.ink2 }] : []),
        { key: "absent", title: "NIEOBECNI", color: C.ink2 },
      ];

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
      {sections.map((s) => {
        const list = groups[s.key];
        if (list.length === 0) return null;
        return (
          <div key={s.key} style={{ minHeight: 0 }}>
            <div style={{
              fontSize: 18, fontWeight: 700, color: s.color,
              borderBottom: `2px solid ${s.color}`, paddingBottom: 3, marginBottom: 8,
              letterSpacing: "0.04em",
            }}>
              {s.title}
            </div>
            <div style={{ fontSize: 19, fontWeight: 500, lineHeight: 1.5, color: C.ink }}>
              {list.map((v, i) => (
                <span key={v.id}>
                  {v.name}{v.groupShort ? ` (${v.groupShort})` : ""}{i < list.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── LISTA OBECNOŚCI ────────────────────────────────────────────────────

function AttendanceView({
  voters, counts,
}: { voters: NonNullable<DisplayData["voters"]>; counts: DisplayData["counts"] }) {
  const colCount = voters.length >= 25 ? 3 : 2;
  const perColumn = Math.ceil(voters.length / colCount);
  const cols: typeof voters[] = [];
  for (let i = 0; i < colCount; i++) cols.push(voters.slice(i * perColumn, (i + 1) * perColumn));
  const absent = counts.eligible - counts.present;

  // Obecni oznaczeni jak "oddany" (niebieski), nieobecni jak "nieobecny" - NameGrid
  // renderuje je identycznie jak w głosowaniach (z tym samym skalowaniem kafelków).
  const choiceByUser = new Map<string, string | null>();
  for (const v of voters) {
    if (v.excluded) choiceByUser.set(v.id, "_EXCLUDED_");
    else if (v.present) choiceByUser.set(v.id, "_PRESENT_");
  }

  return (
    <div style={{ width: "100%", fontFamily: FONT, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <h2 style={{ fontSize: 42, fontWeight: 600, marginBottom: 14, flexShrink: 0, fontFamily: FONT }}>Lista obecności</h2>
      <div style={{ marginBottom: 14, flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <StatTile label="Uprawnionych" value={counts.eligible} />
          <StatTile label="Obecnych" value={counts.present} color={C.accent} />
          <StatTile label="Nieobecnych" value={absent} color={C.no} />
        </div>
      </div>
      <NameGrid
        cols={cols}
        choiceByUser={choiceByUser}
        showIndividualVotes={false}
        isQuorum={false}
        live={false}
      />
    </div>
  );
}

// ─── LISTA MÓWCÓW ───────────────────────────────────────────────────────

// Osobny ekran „Wnioski formalne": aktualnie rozpatrywany wniosek + kolejka oczekujących.
function FormalMotionsView({ list, soundEnabled }: { list: { entries: SpeakerEntry[] } | null; soundEnabled?: boolean }) {
  const speaking = list?.entries.find((e) => e.status === "SPEAKING");
  const waiting = list?.entries.filter((e) => e.status === "WAITING") ?? [];
  const showEmpty = !speaking && waiting.length === 0;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", flex: 1, fontFamily: FONT, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32, marginBottom: 20 }}>
        <div style={{ fontSize: 38, fontWeight: 600, color: C.no }}>Wnioski formalne</div>
        {speaking && <SpeechTimer entry={speaking} soundEnabled={soundEnabled} />}
      </div>

      {speaking && (
        <div style={{ padding: "20px 28px", border: `2px solid ${C.no}`, borderRadius: 12, background: "rgba(200,16,46,0.04)", marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink3, marginBottom: 6 }}>Przemawia</div>
          <div style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
            {speaking.userName}
            {speaking.groupShort && <span style={{ fontSize: 28, fontWeight: 400, color: C.ink3, marginLeft: 14 }}>({speaking.groupShort})</span>}
          </div>
          {speaking.speakerRole && (
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ink3, marginTop: 6 }}>{speaking.speakerRole}</div>
          )}
        </div>
      )}

      {showEmpty ? (
        <div style={{ fontSize: 30, fontWeight: 500, color: "#8FA4C7", textAlign: "center", padding: "48px 0" }}>Brak zgłoszonych wniosków formalnych.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "auto", minHeight: 0 }}>
          {waiting.slice(0, 14).map((e, i) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 24, fontWeight: 500 }}>
              <span style={{ fontWeight: 600, color: C.ink3, minWidth: 32, fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>
                {e.userName}
                {e.speakerRole && <span style={{ color: C.ink3, fontWeight: 400 }}>, {e.speakerRole}</span>}
                {e.groupShort && <span style={{ color: C.ink3, fontWeight: 400, marginLeft: 8 }}>({e.groupShort})</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpeakerListView({ list, speaker, soundEnabled }: { list: NonNullable<DisplayData["speakerList"]>; speaker?: SpeakerEntry; soundEnabled?: boolean }) {
  const speaking = list.entries.find((e) => e.status === "SPEAKING");
  const waiting = list.entries.filter((e) => e.status === "WAITING");
  const showEmpty = !speaking && waiting.length === 0;

  return (
    <div style={{
      width: "100%",
      display: "flex",
      flexDirection: "column",
      flex: 1,
      fontFamily: FONT,
      minHeight: 0,
    }}>
      {/* Nagłówek punktu + duży licznik czasu wypowiedzi po prawej stronie */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32, marginBottom: 18 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {list.agendaItemNumber && (
            <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 4, color: C.ink }}>
              Pkt {list.agendaItemNumber}. porz. obrad
            </div>
          )}
          {list.agendaItemTitle && (
            <div style={{
              fontSize: 30, color: C.ink, fontWeight: 500, lineHeight: 1.25,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {antiOrphan(list.agendaItemTitle)}
            </div>
          )}
        </div>
        {speaker && <SpeechTimer entry={speaker} soundEnabled={soundEnabled} />}
      </div>
      <div style={{ fontSize: 38, fontWeight: 600, marginBottom: 20 }}>
        Lista mówców
      </div>

      {speaking && (
        <div style={{
          padding: "20px 28px",
          border: `2px solid ${C.accent}`,
          borderRadius: 12,
          background: "rgba(27,79,183,0.04)",
          marginBottom: 18,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.2em",
            textTransform: "uppercase", color: C.ink3, marginBottom: 6,
          }}>
            Przemawia
          </div>
          {entryTypeLabel(speaking.entryType, speaking.priority) && (
            <div style={{
              display: "inline-block", fontSize: 16, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: C.accent, marginBottom: 8,
              padding: "3px 10px", borderRadius: 6, background: C.highlightCast,
            }}>
              {entryTypeLabel(speaking.entryType, speaking.priority)}
            </div>
          )}
          <div style={{
            fontSize: 44, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.02em",
          }}>
            {speaking.userName}
            {speaking.groupShort && (
              <span style={{ fontSize: 28, fontWeight: 400, color: C.ink3, marginLeft: 14 }}>
                ({speaking.groupShort})
              </span>
            )}
          </div>
          {speaking.speakerRole && (
            <div style={{
              fontSize: 20, fontWeight: 600, letterSpacing: "0.12em",
              textTransform: "uppercase", color: C.ink3, marginTop: 6,
            }}>
              {speaking.speakerRole}
            </div>
          )}
        </div>
      )}

      {showEmpty ? (
        <div style={{
          fontSize: 30, fontWeight: 500,
          color: "#8FA4C7", textAlign: "center", padding: "48px 0",
        }}>
          Brak zgłoszeń.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "auto", minHeight: 0 }}>
          {waiting.slice(0, 14).map((e, i) => (
            <div key={e.id} style={{
              display: "flex", alignItems: "center", gap: 16,
              padding: "12px 20px",
              border: `1px solid ${C.rule}`,
              borderRadius: 8,
              fontSize: 24, fontWeight: 500,
            }}>
              <span style={{
                fontWeight: 600, color: C.ink3, minWidth: 32,
                fontVariantNumeric: "tabular-nums",
              }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>
                {e.userName}
                {e.speakerRole && <span style={{ color: C.ink3, fontWeight: 400 }}>, {e.speakerRole}</span>}
                {e.groupShort && <span style={{ color: C.ink3, fontWeight: 400, marginLeft: 8 }}>({e.groupShort})</span>}
              </span>
              {e.entryType === "FORMAL_MOTION" && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.abstain,
                  padding: "4px 10px", border: `1px solid ${C.abstain}`, borderRadius: 4, letterSpacing: "0.1em",
                }}>WNIOSEK FORMALNY</span>
              )}
              {e.entryType === "AD_VOCEM" && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.no,
                  padding: "4px 10px", border: `1px solid ${C.no}`, borderRadius: 4, letterSpacing: "0.1em",
                }}>AD VOCEM</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── KOMUNIKAT ──────────────────────────────────────────────────────────

// Widok przerwy: pełny ekran w kolorze nagłówka, wyśrodkowany herb, nazwa organu,
// nazwa posiedzenia, „Przerwa w obradach", licznik odliczający i aktualny zegar.
function BreakView({
  breakUntil, bare, headerColor, logoUrl, organization, meetingName,
}: {
  breakUntil: string | null;
  bare?: boolean;
  headerColor?: string;
  logoUrl?: string | null;
  organization?: string;
  meetingName?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Kolor tła przerwy = kolor posiedzenia; stosujemy go także na transmisji (bare),
  // aby przerwa nie była przezroczysta / niespójna kolorystycznie.
  const colored = !!headerColor && headerColor.toUpperCase() !== "#FFFFFF";
  const dark = colored ? isColorDark(headerColor!) : false;
  const fg = colored ? (dark ? "#FFFFFF" : "#0F1115") : C.ink;
  const fgMuted = colored ? (dark ? "rgba(255,255,255,0.75)" : "rgba(15,17,21,0.65)") : C.ink3;

  let countdown: { text: string; over: boolean } | null = null;
  if (breakUntil) {
    const diffMs = new Date(breakUntil).getTime() - Date.now();
    const over = diffMs < 0;
    const s = Math.floor(Math.abs(diffMs) / 1000);
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const body = hh > 0
      ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
      : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    countdown = { text: `${over ? "−" : ""}${body}`, over };
  }
  const resumeAt = breakUntil ? new Date(breakUntil).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : null;
  const nowClock = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: FONT, minHeight: 0, textAlign: "center", position: "relative",
      background: colored ? headerColor : (bare ? "transparent" : C.bg),
      color: fg, width: "100%", height: "100%", padding: "0 60px",
    }}>
      <div style={{ position: "absolute", top: bare ? 16 : 28, right: bare ? 20 : 36, fontSize: bare ? 18 : 26, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: fgMuted }}>
        {nowClock}
      </div>
      {logoUrl && (
        <img src={logoUrl} alt="" style={{ height: bare ? 70 : 110, width: "auto", objectFit: "contain", marginBottom: 20 }} />
      )}
      {organization && (
        <div style={{ fontSize: bare ? 16 : 22, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: fgMuted }}>
          {antiOrphan(organization)}
        </div>
      )}
      {meetingName && (
        <div style={{ fontSize: bare ? 24 : 34, fontWeight: 600, marginTop: 6, color: fg }}>
          {antiOrphan(meetingName)}
        </div>
      )}
      <div style={{ fontSize: bare ? 34 : 52, fontWeight: 500, color: fg, marginTop: 28 }}>
        Przerwa w obradach
      </div>
      {countdown && (
        <div style={{ fontSize: bare ? 90 : 150, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1, marginTop: 16, color: countdown.over ? (colored ? (dark ? "#FF8A8A" : C.no) : C.no) : fg }}>
          {countdown.text}
        </div>
      )}
      {resumeAt && countdown && !countdown.over && (
        <div style={{ fontSize: bare ? 18 : 26, color: fgMuted, marginTop: 14 }}>Wznowienie o {resumeAt}</div>
      )}
    </div>
  );
}

function MessageView({ text, obsStyle, organization, meetingName, logoUrl }: {
  text: string;
  obsStyle?: boolean;
  organization?: string;
  meetingName?: string;
  logoUrl?: string | null;
}) {
  if (obsStyle) {
    // Styl transmisji/OBS: kolorowe tło, logo, organizacja, duży komunikat + nazwa posiedzenia z datą.
    // Zegar pozostaje w górnym pasku prezentacji (TopBar), więc tutaj go nie dublujemy.
    return (
      <div style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 26, padding: "0 80px", textAlign: "center", fontFamily: FONT, position: "relative",
        background: "linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)", color: "#fff",
        width: "100%", height: "100%", borderRadius: 0,
      }}>
        {/* Zegar zostaje w prawym górnym rogu (jak zawsze), mimo że pasek górny jest ukryty. */}
        <div style={{ position: "absolute", top: 28, right: 36 }}>
          <Clock color="rgba(255,255,255,0.9)" />
        </div>
        {logoUrl && <img src={logoUrl} alt="" style={{ height: 96, width: "auto", objectFit: "contain" }} />}
        {organization && (
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)" }}>
            {organization}
          </div>
        )}
        {/* Nazwa posiedzenia (z datą) u góry, a POD nią treść komunikatu - jak na transmisji. */}
        {meetingName && (
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15, color: "#fff", maxWidth: "82vw" }}>
            {antiOrphan(meetingName)}
          </div>
        )}
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2, maxWidth: "82vw", whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.95)" }}>
          {text ? antiOrphan(text) : "-"}
        </div>
      </div>
    );
  }
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "0 80px", fontFamily: FONT, minHeight: 0, textAlign: "center",
    }}>
      <div style={{
        fontSize: 60, fontWeight: 500, lineHeight: 1.25, color: C.ink,
        whiteSpace: "pre-wrap",
      }}>
        {text ? antiOrphan(text) : "-"}
      </div>
    </div>
  );
}


// ─── WYNIKI LISTY KANDYDATÓW (obsługa 100+, kolumny + auto-paginacja) ──────

function CandidateResults({ options, page }: {
  options: { label: string; count: number }[];
  page: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Sortowanie: wg liczby głosów malejąco; przy remisie alfabetycznie (po polsku).
  const sorted = [...options].sort((a, b) =>
    b.count - a.count || comparePl(a.label, b.label),
  );

  const total = sorted.length;
  const colCount = total <= 12 ? 1 : total <= 40 ? 2 : 3;

  // Ile rzędów realnie zmieści się w pionie - mierzymy dostępną wysokość.
  // Realna wysokość kafelka = font*lineHeight + 2*padding + 2px border. Dobieramy z zapasem.
  const rowH = colCount === 1 ? 64 : colCount === 2 ? 52 : 46;
  const [rowsPerCol, setRowsPerCol] = useState(6);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const el = wrapRef.current;
      if (!el) { raf = requestAnimationFrame(measure); return; }
      const h = el.clientHeight;
      if (h <= 0) { raf = requestAnimationFrame(measure); return; }
      const gap = 6;
      // zapas 56px na kropki stron + margines bezpieczeństwa, żeby ostatni wiersz się nie ucinał
      const rows = Math.max(3, Math.floor((h - 56) / (rowH + gap)));
      setRowsPerCol(rows);
    };
    raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [rowH]);

  const perPage = colCount * rowsPerCol;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * perPage;
  const pageItems = sorted.slice(start, start + perPage);

  const cols: { label: string; count: number; idx: number }[][] = [];
  const colSize = Math.ceil(pageItems.length / colCount);
  for (let c = 0; c < colCount; c++) {
    cols.push(pageItems.slice(c * colSize, (c + 1) * colSize).map((o, i) => ({
      ...o, idx: start + c * colSize + i,
    })));
  }

  const fs = colCount === 1 ? 26 : colCount === 2 ? 21 : 18;
  const pad = colCount === 1 ? "12px 22px" : colCount === 2 ? "9px 16px" : "7px 13px";
  const cntFs = colCount === 1 ? 36 : colCount === 2 ? 27 : 23;

  return (
    <div ref={wrapRef} style={{ margin: "16px 0 0", width: "100%", fontFamily: FONT, minHeight: 0, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 10, flex: 1, minHeight: 0 }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {col.map((o) => (
              <div key={o.idx} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: pad, border: `1px solid ${C.rule}`, borderRadius: 8,
                fontSize: fs, fontWeight: 500, minWidth: 0,
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  <span style={{ color: C.ink3, marginRight: 10, fontVariantNumeric: "tabular-nums" }}>{o.idx + 1}.</span>
                  {antiOrphan(o.label)}
                </span>
                <span style={{ fontSize: cntFs, fontWeight: 600, fontVariantNumeric: "tabular-nums", marginLeft: 12, flexShrink: 0 }}>
                  {o.count}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {pageCount > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12, flexShrink: 0 }}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <span key={i} style={{
              width: 10, height: 10, borderRadius: "50%",
              background: i === safePage ? C.accent : C.rule,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FitText ────────────────────────────────────────────────────────────

/**
 * Skaluje tekst do mniejszego rozmiaru TYLKO gdy nie mieści się w kontenerze.
 * Inaczej zostaje przy max. Bez transition.
 */
// Pamięć zmierzonych rozmiarów per (tekst+zakres) - dzięki temu po odświeżeniu danych
// (SSE/polling co kilka sekund) FitText nie zaczyna od nowa z ukrytym tekstem, więc
// nie ma efektu "mignięcia/animacji" przy tej samej treści.
const fitSizeCache = new Map<string, number>();

function FitText({
  children, min, max, weight = 600,
}: { children: React.ReactNode; min: number; max: number; weight?: 400 | 500 | 600 }) {
  const ref = useRef<HTMLDivElement>(null);
  const cacheKey = `${String(children)}|${min}|${max}`;
  const cached = fitSizeCache.get(cacheKey);
  const [size, setSize] = useState(cached ?? max);
  // Jeśli znamy rozmiar dla tej treści, od razu pokazujemy (bez ukrywania).
  const [measured, setMeasured] = useState(cached != null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const measure = () => {
      const parent = el.parentElement;
      if (!parent) return;
      const maxW = parent.clientWidth;
      const maxH = parent.clientHeight || window.innerHeight * 0.6;
      let lo = min, hi = max, best = min;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        el.style.fontSize = `${mid}px`;
        if (el.scrollWidth <= maxW && el.scrollHeight <= maxH) {
          best = mid; lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      fitSizeCache.set(cacheKey, best);
      setSize(best);
      setMeasured(true);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, min, max]);

  return (
    <div ref={ref} style={{
      fontFamily: FONT,
      fontSize: size,
      fontWeight: weight,
      lineHeight: 1.15,
      letterSpacing: "-0.022em",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      visibility: measured ? "visible" : "hidden",
      transition: "none",
    }}>
      {children}
    </div>
  );
}
