"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReportData, ReportMark, ReportPerson } from "@/lib/reportTypes";
import { readUserError } from "@/lib/feedback";
import { ParticipantPdfButton } from "@/components/participant/ParticipantPdfButton";

// Etykiety neutralne - bez zgadywania formy gramatycznej z imienia.
const MARK_LABEL: Record<ReportMark, string> = {
  "za": "Za", "pr.": "Przeciw", "ws.": "Wstrzymał/a się", "ng.": "Brak głosu",
  "ob.": "Obecność", "nb.": "Nieobecność", "nieob.": "Nieobecność", "wykl.": "Wyłączenie",
};
const MARK_COLOR: Record<ReportMark, string> = {
  "za": "var(--color-yes)", "pr.": "var(--color-no)", "ws.": "var(--color-abstain)",
  "ng.": "var(--color-ink-3)", "ob.": "var(--color-ink-2)", "nb.": "var(--color-ink-3)",
  "nieob.": "var(--color-ink-3)", "wykl.": "var(--color-ink-3)",
};

const norm = (s: string) => s.toLocaleLowerCase("pl").replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");

function MarkPill({ mark, quorum }: { mark?: ReportMark; quorum?: boolean }) {
  if (!mark) return null;
  const label = quorum ? (mark === "ob." ? "Obecność potwierdzona" : "Brak potwierdzenia") : MARK_LABEL[mark];
  return (
    <span className="pt-badge" style={{ borderColor: MARK_COLOR[mark], color: MARK_COLOR[mark], background: "transparent" }}>
      {label}
    </span>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="pt-result" style={{ minWidth: 88, flex: "1 1 0" }}>
      <div className="pt-result-value" style={{ fontSize: 28, color: color ?? "var(--color-ink)" }}>{value}</div>
      <div className="pt-label">{label}</div>
    </div>
  );
}

/** Treść wyników jednego głosowania (okno podglądu i pełna strona szczegółów radnego). */
export function VoteResultsBody({ data, headingLevel = 3 }: { data: ReportData; headingLevel?: 1 | 3 }) {
  const [q, setQ] = useState("");
  const [mark, setMark] = useState<string>("");
  const people = useMemo(() => (data.groups ?? []).flatMap((g) => g.people.map((p) => ({ ...p, club: g.shortName }))), [data.groups]);
  const marks = useMemo(() => [...new Set(people.map((p) => p.mark).filter(Boolean))] as ReportMark[], [people]);
  const filtered = (ps: ReportPerson[]) => ps.filter((p) => (!mark || p.mark === mark) && (!q.trim() || norm(`${p.lastName} ${p.firstName}`).includes(norm(q.trim()))));
  const H = headingLevel === 1 ? "h1" : "h3";
  const total = (k: "yes" | "no" | "abstain") => (data.groups ?? []).reduce((s, g) => s + (g[k] ?? 0), 0);
  const quorumPresent = people.filter((p) => p.mark === "ob.").length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="pt-label num">Głosowanie nr {data.voteNumber} - {data.timestamp}</div>
        <H style={{ margin: "4px 0", fontSize: headingLevel === 1 ? 24 : 19, fontWeight: 600, lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {data.itemTitle ? <>{data.itemNumber ? `Punkt ${data.itemNumber}. ` : ""}{data.itemTitle}</> : data.contextLabel}
        </H>
        <div style={{ fontSize: 16, overflowWrap: "anywhere" }}>{data.voteTitle}</div>
        <div className="pt-btn-group" style={{ marginTop: 8 }}>
          <span className="pt-badge">{data.isSecret ? "Głosowanie tajne" : "Głosowanie jawne"}</span>
          {data.decision && <span className={`pt-badge ${data.decision.positive ? "pt-badge-yes" : "pt-badge-no"}`}>{data.decision.label}</span>}
        </div>
      </div>

      {data.isSecret && (
        <div className="pt-text-sm pt-muted">Głosowanie tajne - lista pokazuje tylko obecność, bez treści głosu.</div>
      )}

      {!data.isList && !data.isPackage && (
        <div className="flex flex-wrap gap-2" style={{ textAlign: "center" }}>
          {data.isQuorum ? (
            <>
              <StatTile label="Obecni" value={quorumPresent} color="var(--color-quorum-ok)" />
              <StatTile label="Bez potwierdzenia" value={people.filter((p) => p.mark !== "ob." && p.mark !== "wykl.").length} color="var(--color-quorum-bad)" />
            </>
          ) : (
            <>
              <StatTile label="Za" value={total("yes")} color="var(--color-yes)" />
              <StatTile label="Przeciw" value={total("no")} color="var(--color-no)" />
              <StatTile label="Wstrzymało się" value={total("abstain")} color="var(--color-abstain)" />
            </>
          )}
        </div>
      )}

      {!data.isQuorum && (
        <dl className="pt-facts">
          {data.castCount != null && <div><dt>Oddane głosy</dt><dd>{data.castCount}</dd></div>}
          {data.presentAtOpen != null && <div><dt>Obecni uprawnieni przy otwarciu</dt><dd>{data.presentAtOpen}</dd></div>}
          {data.majorityPart && <div><dt>Większość</dt><dd>{data.majorityPart.replace(/^.* - /, "")}</dd></div>}
        </dl>
      )}

      {data.candidatesSummary && (
        <div>
          <div className="pt-label mb-2">Wyniki kandydatów</div>
          <table className="pt-table">
            <tbody>
              {[...data.candidatesSummary].sort((a, b) => b.yesCount - a.yesCount).map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className="pt-r num" style={{ fontWeight: 600, color: "var(--color-yes)" }}>{c.yesCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.packagePositions && (
        <div>
          <div className="pt-label mb-2">Wyniki pozycji</div>
          <table className="pt-table">
            <tbody>
              {data.packagePositions.map((p) => (
                <tr key={p.positionNumber}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.positionNumber}. {p.label}</div>
                    <div className="flex flex-wrap gap-x-4 pt-text-sm" style={{ marginTop: 2 }}>
                      <span style={{ color: "var(--color-yes)" }}>za {p.yes}</span>
                      <span style={{ color: "var(--color-no)" }}>przeciw {p.no}</span>
                      <span style={{ color: "var(--color-abstain)" }}>wstrz. {p.abstain}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.groups && data.groups.length > 0 && people.length > 0 && (
        <div>
          <div className="pt-label mb-2">{data.isQuorum ? "Obecność imienna" : data.isSecret ? "Udział imienny" : "Wyniki imienne"}</div>
          <div className="pt-results-filters" style={{ marginBottom: 8 }}>
            <label className="flex flex-col gap-1 pt-text-sm">
              <span>Szukaj osoby</span>
              <input type="search" className="pt-field-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nazwisko lub imię" />
            </label>
            {marks.length > 1 && (
              <label className="flex flex-col gap-1 pt-text-sm">
                <span>{data.isQuorum ? "Obecność" : "Głos / status"}</span>
                <select className="pt-field-input" value={mark} onChange={(e) => setMark(e.target.value)}>
                  <option value="">Wszystkie</option>
                  {marks.map((m) => <option key={m} value={m}>{data.isQuorum ? (m === "ob." ? "Obecność potwierdzona" : "Brak potwierdzenia") : MARK_LABEL[m]}</option>)}
                </select>
              </label>
            )}
          </div>
          {data.groups.map((g) => {
            const ps = filtered(g.people);
            if (ps.length === 0) return null;
            return (
              <div key={g.shortName || "wszyscy"} className="mb-3">
                {g.shortName && <div className="pt-text-sm" style={{ fontWeight: 600, color: "var(--color-ink-2)", marginBottom: 4 }}>{g.shortName}</div>}
                <table className="pt-table">
                  <tbody>
                    {ps.map((p, i) => (
                      <tr key={`${p.lastName}-${p.firstName}-${p.seq ?? i}`}>
                        <td>{p.lastName} {p.firstName}</td>
                        <td className="pt-r"><MarkPill mark={p.mark} quorum={data.isQuorum} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {people.length > 0 && filtered(people).length === 0 && <div className="pt-text-sm pt-muted">Brak osób spełniających kryteria.</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Okno szybkiego podglądu wyników: szersze na komputerze, pełny ekran na telefonie. Zamknięcie
 * zawsze dostępne w nagłówku, Escape, fokus w oknie (Tab nie wychodzi poza okno), po zamknięciu
 * fokus wraca do elementu otwierającego (robi to strona, która otwiera okno).
 */
export function VoteResultsView({ voteId, onClose }: { voteId: string; onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch(`/api/votes/${voteId}/participant-report`)
      .then(async (r) => { if (!r.ok) throw new Error(await readUserError(r)); return r.json(); })
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [voteId]);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const f = dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="pt-panel pt-modal pt-modal-wide" role="dialog" aria-modal="true" aria-labelledby="vr-title" onClick={(e) => e.stopPropagation()}>
        <div className="pt-panel-head pt-modal-head">
          <h2 id="vr-title" className="pt-panel-title">Wyniki głosowania{data ? ` nr ${data.voteNumber}` : ""}</h2>
          <div className="pt-btn-group">
            {data && <ParticipantPdfButton data={data} />}
            <button ref={closeRef} className="pt-btn pt-btn-sm" onClick={onClose}>Zamknij</button>
          </div>
        </div>
        <div className="pt-modal-scroll">
          {error && <div className="pt-panel-body pt-text-sm" style={{ color: "var(--color-no)" }}>{error}</div>}
          {!data && !error && <div className="pt-panel-body pt-text-sm pt-muted">Wczytywanie…</div>}
          {data && <div className="pt-panel-body"><VoteResultsBody data={data} /></div>}
        </div>
      </div>
    </div>
  );
}
