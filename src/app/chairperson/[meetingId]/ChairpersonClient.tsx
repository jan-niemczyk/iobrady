"use client";

import { useEffect, useState } from "react";
import { meetingNameWithDate } from "@/lib/meetingName";

const C = {
  ink: "#0F1115", ink2: "#3A3F49", ink3: "#7A8092",
  accent: "#1B4FB7", yes: "#1F7A3A", no: "#C8102E", abstain: "#B8860B",
  rule: "rgba(15,17,21,0.10)", ruleSoft: "rgba(15,17,21,0.06)",
  hlAccent: "rgba(27,79,183,0.08)", hlYes: "rgba(31,122,58,0.12)",
  hlNo: "rgba(200,16,46,0.10)", hlAbstain: "rgba(184,134,11,0.14)",
  hlNoStrong: "rgba(200,16,46,0.06)", hlWarn: "rgba(184,134,11,0.08)",
};
const FONT = `var(--pres-font, 'Outfit', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif)`;

interface Entry {
  id: string; userName: string; groupShort: string | null; functionTitle?: string | null;
  isGuest?: boolean; entryType: string; priority?: boolean; status: string;
  startedAt: string | null; timeLimitSec: number | null; timeAdjustmentSec: number;
}
interface ChairData {
  organization?: { name: string | null; logoUrl: string | null };
  meeting: { id: string; number: string; name: string; status: string; scheduledAt: string };
  counts: { eligible: number; present: number; absent: number };
  quorum: { met: boolean; need: number };
  currentItem: { number: string; title: string; status: string } | null;
  upcomingItems: { number: string; title: string; status: string }[];
  agendaProgress?: { current: number | null; total: number };
  speakerList: { entries: Entry[] } | null;
  formalMotions?: { id: string; userName: string; groupShort: string | null; status: string; startedAt: string | null; timeLimitSec: number | null; timeAdjustmentSec: number }[];
  discussionClock?: { mode: string; scope: string; budgetSec: number | null; elapsedSec: number; running: boolean } | null;
  isBreak?: boolean; breakUntil?: string | null; breakMessage?: string | null;
  activeVote: {
    id: string; number: number | null; title: string; type: string; visibility: string;
    eligibleCount: number; presentCount: number;
    liveYes: number | null; liveNo: number | null; liveAbstain: number | null;
    liveCastCount: number; liveOptions: { label: string; count: number }[];
    notVoted: { name: string; groupShort: string | null }[];
  } | null;
  lastClosedVote: { id: string; number: number | null; title: string; type: string; visibility: string; resultYes: number; resultNo: number; resultAbstain: number; resultCastCount: number; resultPassed: boolean | null; closedAt: string | null; options: { label: string; count: number; positionNumber?: string | null; yes: number; no: number; abstain: number }[]; named: { yes: (string | null)[]; no: (string | null)[]; abstain: (string | null)[] } | null } | null;
  messages: { id: string; content: string; publishedAt: string }[];
}

function fmtClock(sec: number): string {
  const neg = sec < 0; const s = Math.abs(sec);
  const mm = Math.floor(s / 60), ss = s % 60;
  return `${neg ? "−" : ""}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function nowHHMM(): string {
  return new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}
function entryBadge(entryType: string, priority?: boolean): { label: string; color: string; bg: string } | null {
  if (entryType === "FORMAL_MOTION") return { label: "Wniosek formalny", color: C.no, bg: C.hlNo };
  if (entryType === "AD_VOCEM") return { label: "Ad vocem", color: C.accent, bg: "rgba(27,79,183,0.10)" };
  if (priority) return { label: "Priorytet", color: C.abstain, bg: C.hlAbstain };
  return null;
}

export function ChairpersonClient({ meetingId }: { meetingId: string }) {
  const [data, setData] = useState<ChairData | null>(null);
  const [clock, setClock] = useState(nowHHMM());
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/chairperson/${meetingId}`, { cache: "no-store" });
        if (r.ok && alive) setData(await r.json());
      } catch { /* ignore */ }
    };
    load();
    const poll = setInterval(load, 1500);
    return () => { alive = false; clearInterval(poll); };
  }, [meetingId]);

  useEffect(() => {
    const t = setInterval(() => { setClock(nowHHMM()); setTick((x) => x + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div style={{ padding: 40, fontFamily: FONT, color: C.ink3 }}>Wczytywanie…</div>;

  const speaking = data.speakerList?.entries.find((e) => e.status === "SPEAKING") ?? null;
  const waiting = data.speakerList?.entries.filter((e) => e.status === "WAITING") ?? [];
  const vote = data.activeVote;
  const isVoting = vote != null;
  const isBreak = data.isBreak && !isVoting;

  // Wnioski formalne: ktoś przemawia lub zapisany w kolejce wniosków.
  const motions = data.formalMotions ?? [];
  const motionSpeaking = motions.find((m) => m.status === "SPEAKING") ?? null;
  const motionsWaiting = motions.filter((m) => m.status === "WAITING");
  // #6: widok wniosków przejmuje ekran TYLKO gdy ktoś w ich ramach przemawia.
  // Same oczekujące wnioski nie przełączają ekranu (może trwać inne przemówienie).
  const hasMotionSpeaking = motionSpeaking != null;

  // Trzymanie wyników: przez 25 s po zamknięciu głosowania pokazujemy pełny wynik (jak prezentacja).
  const lcv = data.lastClosedVote;
  const holdResults = !isVoting && !isBreak && lcv?.closedAt
    ? (Date.now() - new Date(lcv.closedAt).getTime()) / 1000 < 25
    : false;

  // Dyskusja pokazuje się, gdy ktoś przemawia LUB ktokolwiek jest zapisany (#9).
  const hasDiscussion = speaking != null || waiting.length > 0;

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100vh", padding: 16, fontFamily: FONT, color: C.ink }}>
      <Header data={data} clock={clock} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 12, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ItemBanner item={data.currentItem} />
          {isBreak ? <BreakView data={data} clock={clock} />
            : isVoting ? <VotingView vote={vote!} />
            : holdResults && lcv ? <ResultsHoldView vote={lcv} />
            : hasMotionSpeaking ? <FormalMotionsChairView speaking={motionSpeaking} waiting={motionsWaiting} />
            : hasDiscussion ? <DiscussionView speaking={speaking} clock={data.discussionClock} waiting={waiting} />
            : <IdleView data={data} />}
        </div>
        <SidePanels data={data} isVoting={isVoting} />
      </div>
    </div>
  );
}

// #10 - widok wniosków formalnych u przewodniczącego: aktualnie przemawiający + licznik + kolejka.
function FormalMotionsChairView({ speaking, waiting }: {
  speaking: NonNullable<ChairData["formalMotions"]>[number] | null;
  waiting: NonNullable<ChairData["formalMotions"]>;
}) {
  const limit = speaking ? (speaking.timeLimitSec ?? 0) + (speaking.timeAdjustmentSec ?? 0) : 0;
  const elapsed = speaking?.startedAt ? Math.floor((Date.now() - new Date(speaking.startedAt).getTime()) / 1000) : 0;
  const remaining = limit > 0 ? limit - elapsed : null;
  const over = remaining != null && remaining < 0;
  const fmt = (s: number) => `${s < 0 ? "-" : ""}${String(Math.floor(Math.abs(s) / 60)).padStart(2, "0")}:${String(Math.abs(s) % 60).padStart(2, "0")}`;
  return (
    <>
      <StateLabel color={C.no} text="Wnioski formalne" />
      {speaking ? (
        <div style={{ background: "#FFFFFF", border: `2px solid ${C.no}`, borderRadius: 12, padding: "18px 24px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.no, fontWeight: 700 }}>Trwa wniosek formalny</div>
          <div style={{ fontSize: 36, fontWeight: 700, marginTop: 6, lineHeight: 1.1 }}>{speaking.userName}</div>
          {speaking.groupShort && <div style={{ fontSize: 18, color: C.ink3, marginTop: 2 }}>Klub „{speaking.groupShort}"</div>}
          <div style={{ fontSize: 48, fontWeight: 700, marginTop: 12, fontVariantNumeric: "tabular-nums", color: over ? C.no : C.ink }}>
            {limit > 0 ? fmt(remaining!) : fmt(elapsed)}
          </div>
          {limit > 0 && <div style={{ fontSize: 13, color: C.ink3 }}>limit {fmt(limit)}</div>}
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "18px 24px", fontSize: 18, color: C.ink2 }}>
          Zgłoszono wnioski formalne - oczekują na udzielenie głosu.
        </div>
      )}
      <div style={{ background: C.hlWarn, border: `1px solid rgba(184,134,11,0.4)`, borderRadius: 12, padding: "14px 18px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.abstain, fontWeight: 700 }}>Kolejka wniosków ({waiting.length})</div>
        {waiting.length === 0 ? <div style={{ fontSize: 13, color: C.ink3, marginTop: 6 }}>Brak oczekujących</div> : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {waiting.map((e, i) => (
              <div key={e.id} style={{ fontSize: 16, fontWeight: 600 }}>
                {i + 1}. {e.userName}{e.groupShort ? <span style={{ color: C.ink3, fontWeight: 400 }}> (klub „{e.groupShort}")</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Pełny wynik trzymany chwilę po zamknięciu głosowania (jawne: z listą imienną).
function ResultsHoldView({ vote }: { vote: NonNullable<ChairData["lastClosedVote"]> }) {
  const named = vote.named;
  const isList = vote.type === "LIST";
  const isPackage = vote.type === "PACKAGE";
  const isQuorum = vote.type === "QUORUM";
  const label = isQuorum
    ? (vote.resultPassed ? "Kworum jest" : "Brak kworum")
    : (vote.resultPassed ? "Przyjęto" : "Odrzucono");
  return (
    <>
      <StateLabel color={vote.resultPassed ? C.yes : C.no} text={label} />
      <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "18px 24px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>
          Wynik - głosowanie nr {vote.number ?? "-"} {isList ? "(lista)" : isPackage ? "(pakiet)" : isQuorum ? "(kworum)" : ""}
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>{vote.title}</div>

        {isQuorum ? (
          <div style={{ marginTop: 16, fontSize: 22, fontWeight: 700 }}>
            Potwierdziło obecność: {vote.resultCastCount}
          </div>
        ) : isList ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {[...vote.options].sort((a, b) => b.count - a.count).map((o, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "rgba(27,79,183,0.06)", borderRadius: 8, padding: "8px 18px", fontSize: 18 }}>
                <span style={{ fontWeight: 600 }}>{o.label}</span>
                <span style={{ fontWeight: 700, color: C.accent }}>{vote.visibility === "SECRET" ? "-" : o.count}</span>
              </div>
            ))}
          </div>
        ) : isPackage ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {vote.options.map((o, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 14, alignItems: "center", background: "rgba(27,79,183,0.06)", borderRadius: 8, padding: "8px 18px", fontSize: 17 }}>
                <span style={{ fontWeight: 600 }}>{o.positionNumber ?? i + 1}. {o.label}</span>
                <span style={{ color: C.yes, fontWeight: 700 }}>za {vote.visibility === "SECRET" ? "-" : o.yes}</span>
                <span style={{ color: C.no, fontWeight: 700 }}>przeciw {vote.visibility === "SECRET" ? "-" : o.no}</span>
                <span style={{ color: C.abstain, fontWeight: 700 }}>wstrz. {vote.visibility === "SECRET" ? "-" : o.abstain}</span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 24, marginTop: 16, fontSize: 22, fontWeight: 700 }}>
              <span style={{ color: C.yes }}>Za {vote.resultYes}</span>
              <span style={{ color: C.no }}>Przeciw {vote.resultNo}</span>
              <span style={{ color: C.abstain }}>Wstrzym. {vote.resultAbstain}</span>
            </div>
            {named && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                {named.yes.length > 0 && <div><b style={{ color: C.yes }}>Za:</b> {named.yes.join(", ")}</div>}
                {named.no.length > 0 && <div><b style={{ color: C.no }}>Przeciw:</b> {named.no.join(", ")}</div>}
                {named.abstain.length > 0 && <div><b style={{ color: C.abstain }}>Wstrzymało się:</b> {named.abstain.join(", ")}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Header({ data, clock }: { data: ChairData; clock: string }) {
  const org = data.organization;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 12px", borderBottom: `1px solid ${C.rule}`, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {org?.logoUrl && (
          <img src={org.logoUrl} alt="" style={{ height: 48, width: "auto", objectFit: "contain", flexShrink: 0 }} />
        )}
        <div>
          {org?.name && <div style={{ fontSize: 12, color: C.ink3, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{org.name}</div>}
          <div style={{ fontSize: 15, fontWeight: 600 }}>{data.meeting.scheduledAt ? meetingNameWithDate(data.meeting.name, data.meeting.scheduledAt) : data.meeting.name}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <Stat label="Godzina" value={clock} />
        {data.agendaProgress?.current != null && <Stat label="Punkt" value={`${data.agendaProgress.current} / ${data.agendaProgress.total}`} />}
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 11, color: C.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function ItemBanner({ item }: { item: ChairData["currentItem"] }) {
  return (
    <div style={{ background: C.hlAccent, borderLeft: `5px solid ${C.accent}`, padding: "16px 22px" }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: C.accent, fontWeight: 600 }}>Punkt porządku obrad</div>
      <div style={{ fontSize: 40, fontWeight: 700, marginTop: 4, lineHeight: 1.15 }}>
        {item ? `Pkt ${item.number}. ${item.title}` : "Brak aktywnego punktu"}
      </div>
    </div>
  );
}

function StateLabel({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color, fontWeight: 600 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block" }} /> {text}
    </div>
  );
}

function DiscussionView({ speaking, clock, waiting }: { speaking: Entry | null; clock: ChairData["discussionClock"]; waiting: Entry[] }) {
  const limit = speaking ? (speaking.timeLimitSec ?? 0) + (speaking.timeAdjustmentSec ?? 0) : 0;
  const elapsed = speaking?.startedAt ? Math.floor((Date.now() - new Date(speaking.startedAt).getTime()) / 1000) : 0;
  const remaining = limit > 0 ? limit - elapsed : elapsed;
  const over = limit > 0 && remaining < 0;
  const netStr = clock ? (clock.mode === "COUNT_DOWN" && clock.budgetSec != null
    ? `${fmtClock(clock.budgetSec - clock.elapsedSec)} / ${fmtClock(clock.budgetSec)}`
    : fmtClock(clock.elapsedSec)) : null;

  return (
    <>
      <StateLabel color={C.accent} text="Trwa dyskusja" />
      {speaking ? (
        <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "22px 26px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>Przemawia</div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1.05 }}>{speaking.userName}</div>
              <div style={{ fontSize: 15, color: C.ink2, marginTop: 5 }}>
                {[speaking.functionTitle, speaking.groupShort ? `Klub „${speaking.groupShort}"` : null].filter(Boolean).join(" - ") || "-"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 44, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: over ? C.no : C.ink }}>{fmtClock(remaining)}</div>
              <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
                {limit > 0 ? `limit ${fmtClock(limit)}` : "bez limitu"}{netStr ? `  netto ${netStr}` : ""}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "18px 24px", fontSize: 18, color: C.ink2 }}>
          Zapisano mówców do dyskusji - oczekują na udzielenie głosu.
        </div>
      )}

      <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "14px 18px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600, marginBottom: 10 }}>Kolejka mówców ({waiting.length})</div>
        {waiting.length === 0 ? <div style={{ fontSize: 13, color: C.ink3 }}>Brak zapisanych mówców</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {waiting.map((e, i) => {
              const badge = entryBadge(e.entryType, e.priority);
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: i === 0 ? C.accent : C.ink3, fontWeight: i === 0 ? 700 : 400, width: 18 }}>{i === 0 ? "▸" : i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{e.userName}</span>
                    <span style={{ fontSize: 13, color: C.ink2 }}>
                      {[e.functionTitle, e.groupShort ? `Klub „${e.groupShort}"` : null].filter(Boolean).length > 0
                        ? " - " + [e.functionTitle, e.groupShort ? `Klub „${e.groupShort}"` : null].filter(Boolean).join(" - ") : ""}
                    </span>
                  </div>
                  {badge && <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, padding: "2px 8px", borderRadius: 5, textTransform: "uppercase" }}>{badge.label}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function VotingView({ vote }: { vote: NonNullable<ChairData["activeVote"]> }) {
  const secret = vote.visibility === "SECRET";
  const isList = vote.type === "LIST";
  const isPackage = vote.type === "PACKAGE";
  const isQuorum = vote.type === "QUORUM";

  const typeLabel = isList ? "lista" : isPackage ? "pakiet" : isQuorum ? "kworum" : (secret ? "tajne" : "jawne");

  return (
    <>
      <StateLabel color={C.no} text="Trwa głosowanie" />
      <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "18px 24px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>
          Głosowanie nr {vote.number ?? "-"} - {typeLabel}
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>{vote.title}</div>

        {(isList || isPackage) && vote.liveOptions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
            {vote.liveOptions.map((o, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(27,79,183,0.06)", borderRadius: 8, padding: "8px 18px" }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{o.label}</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: C.accent, fontVariantNumeric: "tabular-nums" }}>{secret ? "-" : o.count}</span>
              </div>
            ))}
            <div style={{ fontSize: 13, color: C.ink3, marginTop: 4 }}>
              {isPackage ? "Głosowanie pakietowe - wyniki per pozycja" : "Głosowanie na liście - liczba głosów"}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
            {[
              { label: "Głosowało", value: vote.liveCastCount, color: C.accent, bg: "rgba(27,79,183,0.10)" },
              ...(isQuorum ? [] : [
                { label: "Za", value: vote.liveYes, color: C.yes, bg: C.hlYes },
                { label: "Przeciw", value: vote.liveNo, color: C.no, bg: C.hlNo },
                { label: "Wstrzymało się", value: vote.liveAbstain, color: C.abstain, bg: C.hlAbstain },
              ]),
            ].map((t) => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: t.bg, borderRadius: 8, padding: "8px 18px" }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: t.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t.label}</span>
                <span style={{ fontSize: 26, fontWeight: 700, color: t.color, fontVariantNumeric: "tabular-nums" }}>
                  {secret && t.label !== "Głosowało" ? "-" : (t.value ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 14, color: C.ink2, textAlign: "center" }}>
          {isQuorum ? "Sprawdzenie kworum - " : ""}Oddano <b>{vote.liveCastCount}</b> z {vote.presentCount} obecnych
        </div>
      </div>

      {vote.notVoted.length > 0 && (
        <div style={{ background: C.hlWarn, border: `1px solid rgba(184,134,11,0.4)`, borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.abstain, fontWeight: 700 }}>Jeszcze nie oddali głosu ({vote.notVoted.length})</div>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {vote.notVoted.map((p, i) => (
              <span key={i} style={{ fontSize: 15, fontWeight: 600, background: "#FFFFFF", border: `1px solid rgba(15,17,21,0.15)`, borderRadius: 20, padding: "5px 14px" }}>
                {p.name}{p.groupShort ? <span style={{ color: C.ink3, fontWeight: 400 }}> ({p.groupShort})</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function BreakView({ data, clock }: { data: ChairData; clock: string }) {
  let countdown: { text: string; over: boolean } | null = null;
  if (data.breakUntil) {
    const diffMs = new Date(data.breakUntil).getTime() - Date.now();
    const over = diffMs < 0;
    const s = Math.floor(Math.abs(diffMs) / 1000);
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const body = hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    countdown = { text: `${over ? "−" : ""}${body}`, over };
  }
  const resumeAt = data.breakUntil ? new Date(data.breakUntil).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <>
      <StateLabel color={C.abstain} text="Przerwa" />
      <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "34px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: C.ink2, textTransform: "uppercase", letterSpacing: "0.05em" }}>Przerwa w obradach</div>
        {countdown ? (
          <>
            <div style={{ fontSize: 72, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1, marginTop: 12, color: countdown.over ? C.no : C.ink }}>{countdown.text}</div>
            {resumeAt && !countdown.over && <div style={{ fontSize: 14, color: C.ink3, marginTop: 10 }}>Wznowienie o {resumeAt}</div>}
          </>
        ) : (
          <div style={{ fontSize: 14, color: C.ink3, marginTop: 12 }}>Godzina: {clock}</div>
        )}
        {data.breakMessage && <div style={{ fontSize: 15, color: C.ink, marginTop: 12 }}>{data.breakMessage}</div>}
      </div>
    </>
  );
}

function IdleView({ data }: { data: ChairData }) {
  return (
    <>
      <StateLabel color={C.ink3} text="Oczekiwanie - brak aktywnej dyskusji i głosowania" />
      <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>Stan posiedzenia</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 16 }}>
          <MiniStat value={data.counts.present} label="Obecni" />
          <MiniStat value={data.counts.absent} label="Nieobecni" />
          <MiniStat value={`${data.agendaProgress?.current ?? "-"} / ${data.agendaProgress?.total ?? "-"}`} label="Punkt" />
        </div>
      </div>
      {data.lastClosedVote && (
        <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>Ostatni wynik - głosowanie nr {data.lastClosedVote.number ?? "-"}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{data.lastClosedVote.title}</div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 15 }}>
            <span style={{ color: C.yes, fontWeight: 600 }}>Za {data.lastClosedVote.resultYes}</span>
            <span style={{ color: C.no, fontWeight: 600 }}>Przeciw {data.lastClosedVote.resultNo}</span>
            <span style={{ color: C.abstain, fontWeight: 600 }}>Wstrzym. {data.lastClosedVote.resultAbstain}</span>
          </div>
        </div>
      )}
    </>
  );
}
function MiniStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ background: C.ruleSoft, borderRadius: 8, padding: 12, textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: C.ink2 }}>{label}</div>
    </div>
  );
}

function SidePanels({ data, isVoting }: { data: ChairData; isVoting: boolean }) {
  const q = data.quorum; const met = q.met;
  const motions = data.formalMotions ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: met ? "#FFFFFF" : C.hlNoStrong, border: met ? `1px solid ${C.rule}` : `2px solid ${C.no}`, borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>Kworum</div>
        <div style={{ fontSize: 19, fontWeight: 600, color: met ? C.yes : C.no, marginTop: 3 }}>{met ? "✓ Osiągnięte" : "✕ Brak kworum"}</div>
        <div style={{ fontSize: 13, color: C.ink2, marginTop: 6 }}>Obecni <b>{data.counts.present}</b> / {data.counts.eligible}  wymagane {q.need}</div>
      </div>

      {motions.length > 0 && (
        <div style={{ background: C.hlNoStrong, border: `2px solid ${C.no}`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: C.no, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.no, display: "inline-block" }} /> Wnioski formalne ({motions.length})
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {motions.map((mo, i) => (
              <div key={mo.id} style={{ fontSize: 14 }}>
                <b>{i + 1}. {mo.userName}</b>{mo.groupShort ? <span style={{ fontSize: 12, color: C.ink3 }}> ({mo.groupShort})</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {isVoting && data.speakerList && (data.speakerList.entries.filter((e) => e.status === "WAITING").length > 0) && (
        <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>Kolejka mówców</div>
          <div style={{ marginTop: 6, fontSize: 13, color: C.ink3 }}>Wstrzymana na czas głosowania</div>
        </div>
      )}

      <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>Porządek obrad</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {data.currentItem && (
            <div style={{ fontSize: 14, fontWeight: 600, color: C.accent }}>{data.currentItem.number}. {data.currentItem.title}</div>
          )}
          {data.upcomingItems.map((a) => (
            <div key={a.number} style={{ fontSize: 13, color: C.ink2 }}>{a.number}. {a.title}</div>
          ))}
        </div>
      </div>

      {data.messages.length > 0 && (
        <div style={{ background: "#FFFFFF", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: C.ink3, fontWeight: 600 }}>Komunikaty</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {data.messages.map((msg) => (
              <div key={msg.id} style={{ fontSize: 13, color: C.ink2 }}>{msg.content}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
