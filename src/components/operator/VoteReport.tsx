/**
 * Komponent prezentujący wyniki głosowania - czarno-biały, drukowalny.
 *
 * Wersja po feedbacku użytkownika:
 *  - czarno-biały (bez akcentów kolorystycznych dla głosów),
 *  - sortowanie wewnątrz grupy: najpierw po głosie (za / przeciw / wstrzymał / nie), potem po nazwisku,
 *  - dla głosowań tajnych - ukrywamy listę imienną, pokazujemy tylko sumy globalne,
 *  - dla głosowań na listę - tabela: jeden wiersz = jedna osoba, kolumny = kandydaci,
 *  - większość bezwzględna pokazywana tylko gdy faktycznie wybrana,
 *  - belka klubu znika gdy `showGroups=false`.
 */

import { formatDateTime } from "@/lib/labels";
import { PrintButton } from "./PrintButton";

export type VoteMark = "yes" | "no" | "abstain" | "absent" | "present";

const MARK_LABEL: Record<VoteMark, string> = {
  yes: "za",
  no: "pr.",
  abstain: "ws.",
  absent: "ng.",
  present: "ob.",
};

// Sortowanie wg priorytetu głosu
const MARK_ORDER: Record<VoteMark, number> = {
  yes: 1, no: 2, abstain: 3, absent: 4, present: 1,
};

interface PersonVote {
  lastName: string;
  firstName: string;
  /** dla głosowań standardowych: pojedynczy znacznik */
  mark?: VoteMark;
  /** dla głosowań na listę: po jednym znaczniku per kandydat (kolejność) */
  perCandidate?: VoteMark[];
}

interface GroupSection {
  name: string;
  shortName: string;
  membersCount: number;
  participated: number;
  yes?: number;
  no?: number;
  abstain?: number;
  notVoted: number;
  people: PersonVote[];
}

interface CandidateSummary {
  label: string;
  yesCount: number;
}

export interface VoteReportProps {
  meetingNumber: string;
  meetingTitle?: string;
  organizationName?: string;
  voteNumber: number | string;
  timestamp: string | Date;
  itemTitle: string;
  description?: string;
  /** Nagłówek kontekstu: "Pkt 3. Tytuł punktu" albo nazwa posiedzenia dla głosowań ad hoc */
  agendaLabel?: string;

  kind: "standard" | "list" | "quorum";
  visibility?: "open" | "secret";
  /** czy pokazywać belki podziału na kluby/koła */
  showGroups?: boolean;

  totalParticipated: number;
  totalNotVoted: number;
  totalAbsent?: number;
  totalYes?: number;
  totalNo?: number;
  totalAbstain?: number;
  absoluteMajority?: number;
  /** Etykieta progu większości (np. "WIĘKSZOŚĆ BEZWZGLĘDNA", "WIĘKSZOŚĆ 2/3") */
  majorityLabel?: string;

  candidates?: string[];
  candidatesSummary?: CandidateSummary[];

  groups: GroupSection[];
}

// Jednowierszowa podsuma jako tekst.
function buildSummaryLine(p: {
  isList: boolean; isQuorum: boolean;
  participated: number; notVoted: number; absent?: number;
  yes?: number; no?: number; abstain?: number;
  absoluteMajority?: number; majorityLabel?: string;
}): string {
  const parts: string[] = [];
  if (p.isQuorum) {
    parts.push(`POTWIERDZIŁO - ${p.participated}`);
    if (p.absent != null) parts.push(`NIEOBECNI - ${p.absent}`);
    if (p.absoluteMajority != null) parts.push(`${(p.majorityLabel ?? "KWORUM").toUpperCase()} - ${p.absoluteMajority}`);
  } else if (p.isList) {
    parts.push(`GŁOSOWAŁO - ${p.participated}`);
    parts.push(`NIE GŁOSOWAŁO - ${p.notVoted}`);
    if (p.absent != null) parts.push(`NIEOBECNI - ${p.absent}`);
  } else {
    parts.push(`GŁOSOWAŁO - ${p.participated}`);
    parts.push(`ZA - ${p.yes ?? 0}`);
    parts.push(`PRZECIW - ${p.no ?? 0}`);
    parts.push(`WSTRZYMAŁO SIĘ - ${p.abstain ?? 0}`);
    parts.push(`NIE GŁOSOWAŁO - ${p.notVoted}`);
    if (p.absent != null) parts.push(`NIEOBECNI - ${p.absent}`);
    if (p.absoluteMajority != null && p.majorityLabel) parts.push(`${p.majorityLabel.toUpperCase()} - ${p.absoluteMajority}`);
  }
  return parts.join("   ");
}

export function VoteReport(p: VoteReportProps) {
  const isList = p.kind === "list";
  const isQuorum = p.kind === "quorum";
  const isSecret = p.visibility === "secret";

  // Jednowierszowa podsuma jako tekst (do PDF i do widoku).
  const summaryText = buildSummaryLine({
    isList, isQuorum,
    participated: p.totalParticipated,
    notVoted: p.totalNotVoted,
    absent: p.totalAbsent,
    yes: p.totalYes, no: p.totalNo, abstain: p.totalAbstain,
    absoluteMajority: p.absoluteMajority, majorityLabel: p.majorityLabel,
  });

  const timestampStr = typeof p.timestamp === "string" ? p.timestamp : formatDateTime(p.timestamp);

  // Mapowanie znaczników na skróty wydruku (za / pr. / ws. / ng. / ob.)
  const markShort = (m?: VoteMark): "za" | "pr." | "ws." | "ng." | "ob." | undefined =>
    m == null ? undefined : MARK_LABEL[m] as "za" | "pr." | "ws." | "ng." | "ob.";

  const pdfData = {
    organizationName: p.organizationName,
    meetingTitle: p.meetingTitle,
    meetingNumber: p.meetingNumber,
    voteNumber: p.voteNumber,
    timestamp: timestampStr,
    contextLabel: p.agendaLabel ?? p.itemTitle,
    voteTitle: p.itemTitle,
    description: p.description,
    summaryLine: summaryText,
    isList,
    isSecret,
    candidatesCount: p.candidates?.length,
    candidates: p.candidates,
    candidatesSummary: p.candidatesSummary?.map((c) => ({ label: c.label, yesCount: c.yesCount })),
    groups: (!isSecret && p.groups)
      ? p.groups.map((g) => ({
          shortName: g.shortName,
          membersCount: g.membersCount,
          participated: g.participated,
          yes: g.yes, no: g.no, abstain: g.abstain,
          notVoted: g.notVoted,
          people: g.people.map((person) => ({
            lastName: person.lastName,
            firstName: person.firstName,
            mark: markShort(person.mark),
            perCandidate: person.perCandidate?.map(markShort).filter((x): x is "za" | "pr." | "ws." | "ng." | "ob." => x != null),
          })),
        }))
      : undefined,
  };

  return (
    <>
      {/* Pasek z przyciskiem drukowania - ukryty przy druku */}
      <div className="no-print" style={{ maxWidth: 920, margin: "0 auto 12px", display: "flex", justifyContent: "flex-end" }}>
        <PrintButton fileName={`glosowanie-${p.voteNumber}`} data={pdfData} />
      </div>

      <article
        id="vote-report-article"
        style={{
          background: "#FFFFFF",
          color: "#000000",
          maxWidth: 920,
          margin: "0 auto",
          padding: 48,
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: 13,
          border: "1px solid #000000",
        }}
      >
        {/* ── Header (wyrównany do lewej, jeden rozmiar czcionki) ────── */}
        <header style={{ marginBottom: 16, borderBottom: "1.5px solid #000", paddingBottom: 10 }}>
          <div style={{ fontSize: 13 }}>{(p.meetingTitle ?? "Posiedzenie")}{p.organizationName ? ` - ${p.organizationName}` : ""}</div>
          <div style={{ fontSize: 13, fontStyle: "italic", marginTop: 2 }}>
            Posiedzenie nr {p.meetingNumber} - głosowanie nr {p.voteNumber} ({typeof p.timestamp === "string" ? p.timestamp : formatDateTime(p.timestamp)})
          </div>
        </header>

        {/* ── Punkt / nazwa posiedzenia ────────────────────────────── */}
        <section style={{ borderBottom: "1px solid #000", padding: "8px 0", marginBottom: 10 }}>
          <div style={{ fontSize: 13 }}>{p.agendaLabel ?? p.itemTitle}</div>
        </section>

        {/* ── Nazwa głosowania ─────────────────────────────────────── */}
        <section style={{ borderBottom: "1px solid #000", padding: "8px 0", marginBottom: 10 }}>
          <div style={{ fontSize: 13 }}>{p.itemTitle}</div>
          {p.description && <div style={{ fontSize: 13, marginTop: 4 }}>{p.description}</div>}
        </section>

        {/* ── Podsuma jednowierszowa ───────────────────────────────── */}
        <section style={{ borderBottom: "1.5px solid #000", padding: "8px 0", marginBottom: 20, fontSize: 13 }}>
          <SummaryLine
            isList={isList}
            isQuorum={isQuorum}
            participated={p.totalParticipated}
            notVoted={p.totalNotVoted}
            absent={p.totalAbsent}
            yes={p.totalYes}
            no={p.totalNo}
            abstain={p.totalAbstain}
            absoluteMajority={p.absoluteMajority}
            majorityLabel={p.majorityLabel}
          />
        </section>

        {/* ── Lista kandydatów (LIST) ───────────────────────────────── */}
        {isList && p.candidates && (
          <section style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Kandydaci na liście</h2>
            <ol style={{
              fontSize: 12,
              columnCount: p.candidates.length > 30 ? 4 : p.candidates.length > 12 ? 3 : 2,
              columnGap: 24,
              listStylePosition: "inside",
            }}>
              {p.candidates.map((c, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  <span className="mono" style={{ marginRight: 6 }}>{i + 1}.</span>{c}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Komunikat dla tajnych ──────────────────────────────────── */}
        {isSecret && (
          <section style={{ border: "1px dashed #000", padding: 16, textAlign: "center", marginBottom: 24 }}>
            <strong>Głosowanie tajne</strong>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              Imienna lista głosów nie jest publikowana. Powyżej znajdują się sumy oddanych głosów.
            </p>
          </section>
        )}

        {/* ── Grupy / lista imienna (tylko gdy nie SECRET) ──────────── */}
        {!isSecret && (
          <section style={{ marginTop: 8 }}>
            {p.groups.map((g) => (
              <GroupBlock
                key={g.shortName}
                group={g}
                isList={isList}
                isQuorum={isQuorum}
                candidatesCount={p.candidates?.length ?? 0}
                showHeader={p.showGroups !== false}
              />
            ))}
          </section>
        )}

        {/* ── Wyniki per kandydat (LIST) ─────────────────────────────── */}
        {isList && p.candidatesSummary && (
          <section style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #000" }}>
            <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center", marginBottom: 12 }}>
              Wynik - liczba głosów ZA
            </h2>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                {[...p.candidatesSummary]
                  .sort((a, b) => b.yesCount - a.yesCount)
                  .map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #ccc" }}>
                      <td style={{ padding: "6px 0", width: 30 }}>
                        <span className="mono">{i + 1}.</span>
                      </td>
                      <td style={{ padding: "6px 0" }}>{c.label}</td>
                      <td style={{ padding: "6px 0", textAlign: "right" }} className="num">
                        {c.yesCount}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}
      </article>

      {/* ── Style druku ─────────────────────────────────────────────── */}
      <style>{`
        article li { break-inside: avoid; page-break-inside: avoid; }
        article table { break-inside: auto; }
        article tr { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          body { background: #FFFFFF !important; background-image: none !important; margin: 0 !important; }
          .no-print, header.no-print, nav { display: none !important; }
          article {
            border: none !important; padding: 0 !important; margin: 0 !important;
            max-width: none !important;
            font-family: "Inter", -apple-system, system-ui, Arial, sans-serif !important;
          }
          article * { font-family: inherit !important; color: #000 !important; }
          thead { display: table-header-group; }
        }
        @page { size: A4; margin: 14mm 12mm; }
      `}</style>
    </>
  );
}

// Jednowierszowa podsuma: GŁOSOWAŁO - 4 ZA - 4 PRZECIW - 0 ... W. BEZWZGLĘDNA - 3
function SummaryLine(p: {
  isList: boolean;
  isQuorum: boolean;
  participated: number;
  notVoted: number;
  absent?: number;
  yes?: number;
  no?: number;
  abstain?: number;
  absoluteMajority?: number;
  majorityLabel?: string;
}) {
  const parts: string[] = [];
  if (p.isQuorum) {
    parts.push(`POTWIERDZIŁO - ${p.participated}`);
    if (p.absent != null) parts.push(`NIEOBECNI - ${p.absent}`);
    if (p.absoluteMajority != null) parts.push(`${p.majorityLabel ?? "KWORUM"} - ${p.absoluteMajority}`);
  } else if (p.isList) {
    parts.push(`GŁOSOWAŁO - ${p.participated}`);
    parts.push(`NIE GŁOSOWAŁO - ${p.notVoted}`);
    if (p.absent != null) parts.push(`NIEOBECNI - ${p.absent}`);
  } else {
    parts.push(`GŁOSOWAŁO - ${p.participated}`);
    parts.push(`ZA - ${p.yes ?? 0}`);
    parts.push(`PRZECIW - ${p.no ?? 0}`);
    parts.push(`WSTRZYMAŁO SIĘ - ${p.abstain ?? 0}`);
    parts.push(`NIE GŁOSOWAŁO - ${p.notVoted}`);
    if (p.absent != null) parts.push(`NIEOBECNI - ${p.absent}`);
    if (p.absoluteMajority != null && p.majorityLabel) parts.push(`${p.majorityLabel} - ${p.absoluteMajority}`);
  }
  return <div style={{ fontWeight: 600 }}>{parts.join("   ")}</div>;
}

function Totals(p: {
  isList: boolean;
  isQuorum: boolean;
  participated: number;
  notVoted: number;
  yes?: number;
  no?: number;
  abstain?: number;
  absoluteMajority?: number;
  majorityLabel?: string;
}) {
  if (p.isQuorum) {
    return (
      <>
        <TotalCell label="OBECNYCH" value={p.participated} />
        <TotalCell label="NIEOBECNYCH" value={p.notVoted} />
      </>
    );
  }
  if (p.isList) {
    return (
      <>
        <TotalCell label="GŁOSOWAŁO" value={p.participated} />
        {p.absoluteMajority !== undefined && <TotalCell label={p.majorityLabel ?? "WYMAGANA WIĘKSZOŚĆ"} value={p.absoluteMajority} />}
        <TotalCell label="NIE GŁOSOWAŁO" value={p.notVoted} />
      </>
    );
  }
  return (
    <>
      <TotalCell label="GŁOSOWAŁO" value={p.participated} />
      <TotalCell label="ZA" value={p.yes ?? 0} />
      <TotalCell label="PRZECIW" value={p.no ?? 0} />
      <TotalCell label="WSTRZYMAŁO SIĘ" value={p.abstain ?? 0} />
      <TotalCell label="NIE GŁOSOWAŁO" value={p.notVoted} />
      {p.absoluteMajority !== undefined && <TotalCell label={p.majorityLabel ?? "WYMAGANA WIĘKSZOŚĆ"} value={p.absoluteMajority} />}
    </>
  );
}

function TotalCell({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span>{label}</span> - <span className="num">{value}</span>
    </span>
  );
}

function GroupBlock({
  group, isList, isQuorum, candidatesCount, showHeader,
}: {
  group: GroupSection;
  isList: boolean;
  isQuorum: boolean;
  candidatesCount: number;
  showHeader: boolean;
}) {
  // sortowanie wewnątrz grupy: najpierw po głosie (yes/no/abstain/absent), potem po nazwisku
  const sortedPeople = [...group.people].sort((a, b) => {
    const aOrder = a.mark ? MARK_ORDER[a.mark] : (a.perCandidate ? 1 : 5);
    const bOrder = b.mark ? MARK_ORDER[b.mark] : (b.perCandidate ? 1 : 5);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.lastName.localeCompare(b.lastName, "pl");
  });

  return (
    <section style={{ marginBottom: 20 }}>
      {showHeader && (
        <h3 style={{
          fontSize: 13,
          fontWeight: 600,
          borderBottom: "1px solid #000",
          paddingBottom: 4,
          marginBottom: 8,
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>{group.shortName}<span className="mono" style={{ fontSize: 11, marginLeft: 6 }}>({group.membersCount})</span></span>
          <span className="mono" style={{ fontSize: 11 }}>
            {isQuorum
              ? `OB. ${group.participated} - NG. ${group.notVoted}`
              : isList
                ? `GŁOSOWAŁO ${group.participated} - NIE GŁOSOWAŁO ${group.notVoted}`
                : `ZA ${group.yes ?? 0} - PR. ${group.no ?? 0} - WS. ${group.abstain ?? 0} - NG. ${group.notVoted}`}
          </span>
        </h3>
      )}

      {/* Dla LIST: tabela z kolumnami kandydatów */}
      {isList && candidatesCount > 0 ? (
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #000" }}>
              <th style={{ textAlign: "left", padding: "4px 0", fontWeight: 600 }}>Imię i Nazwisko</th>
              {Array.from({ length: candidatesCount }, (_, i) => (
                <th key={i} style={{ width: 28, padding: "4px 0", fontWeight: 600 }} className="mono">{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPeople.map((person, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "3px 0" }}>{person.firstName} {person.lastName.toUpperCase()}</td>
                {person.perCandidate
                  ? person.perCandidate.map((m, idx) => (
                      <td key={idx} className="mono" style={{ padding: "3px 0", textAlign: "center", fontSize: 11 }}>
                        {MARK_LABEL[m]}
                      </td>
                    ))
                  : Array.from({ length: candidatesCount }, (_, idx) => (
                      <td key={idx} className="mono" style={{ padding: "3px 0", textAlign: "center", fontSize: 11 }}>ng.</td>
                    ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        /* Dla standard/kworum: prosta lista wierszami */
        <ol style={{ fontSize: 12, columnCount: 2, columnGap: 32 }}>
          {sortedPeople.map((person, i) => (
            <li key={i} style={{ marginBottom: 2, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ textTransform: "uppercase" }}>{person.lastName} {person.firstName}</span>
              {person.mark && <span className="mono">{MARK_LABEL[person.mark]}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
