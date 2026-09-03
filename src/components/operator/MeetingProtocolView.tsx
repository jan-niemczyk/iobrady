"use client";

import { useEffect } from "react";
import type { MeetingStatus, AgendaItemStatus, VoteType, VoteVisibility, VoteStatus, MajorityType, MajorityKind, MajorityBase, AttendanceStatus, SpeakerStatus } from "@prisma/client";
import { MEETING_STATUS_LABEL, AGENDA_ITEM_STATUS_LABEL, formatDateTime, formatTime } from "@/lib/labels";
import { formatMajority } from "@/lib/majority";
import type { QuorumStatus } from "@/lib/quorum";

const VOTE_TYPE_LABEL: Record<VoteType, string> = {
  STANDARD: "standardowe",
  LIST: "lista kandydatów",
  PACKAGE: "pakietowe",
  QUORUM: "kworum",
};

interface Props {
  organizationName: string;
  meeting: {
    id: string; number: string; name: string; description: string | null;
    meetingType: string | null;
    scheduledAt: string; openedAt: string | null; closedAt: string | null;
    status: MeetingStatus;
  };
  quorum: QuorumStatus;
  participants: {
    id: string; lastName: string; firstName: string;
    groupShort: string | null;
    hasVotingRight: boolean; isInvitedGuest: boolean;
    attendance: AttendanceStatus | null;
  }[];
  agenda: {
    id: string; order: number; number: string; title: string;
    description: string | null; presenter: string | null;
    status: AgendaItemStatus;
    startedAt: string | null; completedAt: string | null;
  }[];
  votes: {
    id: string; title: string; type: VoteType; visibility: VoteVisibility;
    agendaItemNumber: string | null;
    majority: MajorityType; majorityKind: MajorityKind; majorityBase: MajorityBase; status: VoteStatus;
    openedAt: string | null; closedAt: string | null;
    resultPassed: boolean | null;
    resultYes: number | null; resultNo: number | null; resultAbstain: number | null;
    resultCastCount: number | null;
    resultEligibleCount: number | null;
    options: { label: string; resultCount: number | null }[];
  }[];
  speakerLists: {
    id: string;
    agendaItemNumber: string | null;
    agendaItemTitle: string | null;
    entries: {
      name: string; status: SpeakerStatus;
      consumedSec: number | null; timeLimitSec: number | null;
    }[];
  }[];
  messages: { id: string; content: string; publishedAt: string }[];
}

export function MeetingProtocolView(p: Props) {
  // ustaw tytuł karty dla "Print as PDF" - będzie nazwą pliku
  useEffect(() => {
    document.title = `Protokół ${p.meeting.number} - ${p.organizationName}`;
  }, [p.meeting.number, p.organizationName]);

  const eligible = p.participants.filter((q) => q.hasVotingRight);
  const guests = p.participants.filter((q) => q.isInvitedGuest);
  const present = p.participants.filter((q) => q.attendance === "PRESENT");
  const absent = eligible.filter((q) => q.attendance !== "PRESENT");

  return (
    <>
      {/* Pasek z akcjami - ukryty przy druku */}
      <div className="no-print" style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--color-paper)",
        borderBottom: "1px solid var(--color-rule)",
        padding: "10px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <a href={`/meetings/${p.meeting.id}`} className="btn">← Wróć do panelu</a>
        <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>
          Aby wyeksportować do PDF: <span className="mono">Ctrl + P</span> → <em>Zapisz jako PDF</em>.
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>Drukuj / Zapisz jako PDF</button>
      </div>

      <article className="no-grid" style={{
        background: "#FFFFFF",
        maxWidth: 820, margin: "32px auto", padding: "48px 56px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        fontFamily: "var(--font-sans)",
      }}>
        {/* ─── Nagłówek ─── */}
        <header className="text-center" style={{ borderBottom: "2px solid var(--color-ink)", paddingBottom: 16, marginBottom: 24 }}>
          <div className="eyebrow" style={{ fontSize: 11 }}>{p.organizationName}</div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 500, lineHeight: 1.1, marginTop: 6 }}>
            Protokół z posiedzenia nr <span className="mono">{p.meeting.number}</span>
          </h1>
          <div className="mt-2 text-sm" style={{ color: "var(--color-ink-2)" }}>
            {p.meeting.name}
            {p.meeting.meetingType && <> - {p.meeting.meetingType}</>}
          </div>
        </header>

        {/* ─── Dane podstawowe ─── */}
        <Section title="Dane posiedzenia">
          <KV k="Termin planowany" v={formatDateTime(p.meeting.scheduledAt)} />
          {p.meeting.openedAt && <KV k="Otwarcie" v={formatDateTime(p.meeting.openedAt)} />}
          {p.meeting.closedAt && <KV k="Zamknięcie" v={formatDateTime(p.meeting.closedAt)} />}
          <KV k="Status" v={MEETING_STATUS_LABEL[p.meeting.status]} />
          {p.meeting.description && <KV k="Opis" v={p.meeting.description} />}
        </Section>

        {/* ─── Kworum ─── */}
        <Section title="Kworum">
          <p className="text-sm">
            Reguła: <strong>{p.quorum.ruleLabel}</strong>.
            Uprawnionych do głosowania: <span className="mono">{p.quorum.eligibleCount}</span>,
            obecnych z prawem głosu: <span className="mono">{p.quorum.presentCount}</span>,
            wymagane minimum: <span className="mono">{p.quorum.requiredCount}</span>.
          </p>
          <p className="text-sm mt-2">
            Status: <strong style={{ color: p.quorum.met ? "var(--color-yes)" : "var(--color-no)" }}>
              {p.quorum.met ? "KWORUM SPEŁNIONE" : "BRAK KWORUM"}
            </strong>
          </p>
        </Section>

        {/* ─── Uczestnicy ─── */}
        <Section title={`Uczestnicy (${p.participants.length})`}>
          <div className="text-sm mb-3" style={{ color: "var(--color-ink-2)" }}>
            Z prawem głosu: <span className="mono">{eligible.length}</span> - Obecni: <span className="mono">{present.length}</span> - Nieobecni: <span className="mono">{absent.length}</span>
            {guests.length > 0 && <> - Goście: <span className="mono">{guests.length}</span></>}
          </div>

          <h3 className="eyebrow mt-4 mb-2">Obecni</h3>
          <ol className="text-sm grid grid-cols-2 gap-x-6 gap-y-0.5">
            {present.map((q) => (
              <li key={q.id} className="flex items-baseline justify-between gap-2">
                <span style={{ textTransform: "uppercase" }}>{q.lastName} {q.firstName}</span>
                {q.groupShort && <span className="mono text-xs" style={{ color: "var(--color-ink-3)" }}>{q.groupShort}</span>}
              </li>
            ))}
          </ol>

          {absent.length > 0 && (
            <>
              <h3 className="eyebrow mt-4 mb-2">Nieobecni</h3>
              <ol className="text-sm grid grid-cols-2 gap-x-6 gap-y-0.5">
                {absent.map((q) => (
                  <li key={q.id} className="flex items-baseline justify-between gap-2">
                    <span style={{ textTransform: "uppercase" }}>{q.lastName} {q.firstName}</span>
                    {q.groupShort && <span className="mono text-xs" style={{ color: "var(--color-ink-3)" }}>{q.groupShort}</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
        </Section>

        {/* ─── Porządek obrad ─── */}
        <Section title="Porządek obrad">
          <ol className="text-sm space-y-2">
            {p.agenda.map((a) => (
              <li key={a.id} className="page-avoid-break">
                <div className="flex items-baseline justify-between gap-2">
                  <span><span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>{a.number}.</span>{a.title}</span>
                  <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>{AGENDA_ITEM_STATUS_LABEL[a.status]}</span>
                </div>
                {a.presenter && <div className="text-xs ml-6 mt-0.5" style={{ color: "var(--color-ink-3)" }}>Referent: {a.presenter}</div>}
                {a.startedAt && a.completedAt && (
                  <div className="text-xs ml-6 mono" style={{ color: "var(--color-ink-3)" }}>
                    {formatTime(a.startedAt)} - {formatTime(a.completedAt)}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>

        {/* ─── Głosowania ─── */}
        {p.votes.length > 0 && (
          <Section title={`Głosowania (${p.votes.length})`}>
            <ol className="text-sm space-y-4">
              {p.votes.map((v, i) => (
                <li key={v.id} className="page-avoid-break border-l-2 pl-4" style={{ borderColor: v.resultPassed ? "var(--color-yes)" : "var(--color-no)" }}>
                  <div className="flex justify-between gap-2">
                    <span>
                      <span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>{i + 1}.</span>
                      {v.agendaItemNumber && <span className="mono mr-2" style={{ color: "var(--color-ink-3)" }}>(pkt {v.agendaItemNumber})</span>}
                      <strong>{v.title}</strong>
                    </span>
                    <span className="mono text-xs shrink-0" style={{ color: "var(--color-ink-3)" }}>
                      {v.closedAt ? formatTime(v.closedAt) : formatTime(v.openedAt)}
                    </span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
                    {VOTE_TYPE_LABEL[v.type]} - {v.visibility === "OPEN" ? "jawne" : "tajne"} - {formatMajority(v.majorityKind, v.majorityBase)}
                  </div>
                  <div className="mt-2">
                    {v.type === "LIST" ? (
                      <div>
                        <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>
                          Głosowało: <span className="mono">{v.resultCastCount ?? 0}</span>
                          {v.majorityKind === "ABSOLUTE" && (
                            <> - Wymagana większość bezwzględna: <span className="mono">{Math.floor((v.resultCastCount ?? 0) / 2) + 1}</span></>
                          )}
                          {v.majorityKind === "QUALIFIED_TWO_THIRDS" && (
                            <> - Wymagana większość 2/3: <span className="mono">{Math.ceil((2 * (v.resultCastCount ?? 0)) / 3)}</span></>
                          )}
                          {v.majorityKind === "QUALIFIED_THREE_FIFTHS" && (
                            <> - Wymagana większość 3/5: <span className="mono">{Math.ceil((3 * (v.resultCastCount ?? 0)) / 5)}</span></>
                          )}
                        </div>
                        <ol className="text-xs mt-1 ml-3">
                          {[...v.options]
                            .sort((a, b) => (b.resultCount ?? 0) - (a.resultCount ?? 0))
                            .map((o, j) => (
                              <li key={j} className="flex justify-between">
                                <span>{j + 1}. {o.label}</span>
                                <span className="mono">{o.resultCount ?? 0}</span>
                              </li>
                            ))}
                        </ol>
                      </div>
                    ) : v.type === "QUORUM" ? (
                      <div className="text-xs">
                        Obecnych: <span className="mono">{v.resultCastCount ?? v.resultEligibleCount ?? 0}</span> -{" "}
                        <strong style={{ color: v.resultPassed ? "var(--color-yes)" : "var(--color-no)" }}>
                          {v.resultPassed ? "kworum potwierdzone" : "brak kworum"}
                        </strong>
                      </div>
                    ) : (
                      <div className="text-xs">
                        <span style={{ color: "var(--color-yes)" }}>ZA: <span className="mono">{v.resultYes ?? 0}</span></span>{" - "}
                        <span style={{ color: "var(--color-no)" }}>PRZECIW: <span className="mono">{v.resultNo ?? 0}</span></span>{" - "}
                        <span style={{ color: "var(--color-abstain)" }}>WSTRZ.: <span className="mono">{v.resultAbstain ?? 0}</span></span>{" - "}
                        <strong style={{ color: v.resultPassed ? "var(--color-yes)" : "var(--color-no)" }}>
                          {v.resultPassed ? "PRZYJĘTO" : "ODRZUCONO"}
                        </strong>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* ─── Listy mówców ─── */}
        {p.speakerLists.length > 0 && (
          <Section title="Wystąpienia">
            {p.speakerLists.map((sl) => (
              <div key={sl.id} className="page-avoid-break mb-4">
                {sl.agendaItemNumber && (
                  <div className="eyebrow mb-2">
                    Punkt {sl.agendaItemNumber}: {sl.agendaItemTitle}
                  </div>
                )}
                <ol className="text-sm">
                  {sl.entries.map((e, i) => (
                    <li key={i} className="flex justify-between gap-2 py-0.5">
                      <span>{i + 1}. {e.name}</span>
                      <span className="mono text-xs" style={{ color: "var(--color-ink-3)" }}>
                        {e.status === "FINISHED" && e.consumedSec != null
                          ? formatDurationProtocol(e.consumedSec) + " użytego"
                          : e.status === "WITHDRAWN" ? "wycofany"
                          : e.status === "WAITING" ? "nie zabrał głosu"
                          : "-"}
                        {e.timeLimitSec != null && <> / limit: {formatDurationProtocol(e.timeLimitSec)}</>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </Section>
        )}

        {/* ─── Komunikaty ─── */}
        {p.messages.length > 0 && (
          <Section title="Komunikaty operatora">
            <ul className="text-sm space-y-2">
              {p.messages.map((m) => (
                <li key={m.id}>
                  <span className="mono text-xs mr-2" style={{ color: "var(--color-ink-3)" }}>{formatTime(m.publishedAt)}</span>
                  {m.content}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ─── Stopka ─── */}
        <footer className="mt-12 pt-6 border-t border-[var(--color-rule)] text-xs grid grid-cols-2 gap-8" style={{ color: "var(--color-ink-3)" }}>
          <div>
            <div className="mb-12">Podpis prowadzącego obrady:</div>
            <div style={{ borderTop: "1px solid var(--color-ink-3)", paddingTop: 4 }}>imię i nazwisko</div>
          </div>
          <div>
            <div className="mb-12">Podpis sekretarza:</div>
            <div style={{ borderTop: "1px solid var(--color-ink-3)", paddingTop: 4 }}>imię i nazwisko</div>
          </div>
        </footer>

        <p className="text-center mt-8 text-xs mono" style={{ color: "var(--color-ink-3)" }}>
          Wygenerowano automatycznie przez iOBRADY - {formatDateTime(new Date())}
        </p>
      </article>

      {/* ─── Style druku ─── */}
      <style>{`
        @media print {
          body { background: #FFFFFF !important; background-image: none !important; }
          .no-print { display: none !important; }
          article { box-shadow: none !important; margin: 0 !important; padding: 24px 32px !important; max-width: none !important; }
          .page-avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
        @page { size: A4; margin: 18mm 16mm; }
      `}</style>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 18, fontWeight: 500,
        borderBottom: "1px solid var(--color-rule)",
        paddingBottom: 4, marginBottom: 12,
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="text-sm flex gap-3" style={{ marginBottom: 4 }}>
      <span style={{ color: "var(--color-ink-3)", minWidth: 140 }}>{k}:</span>
      <span>{v}</span>
    </div>
  );
}

function formatDurationProtocol(sec: number): string {
  const sign = sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${sign}${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
