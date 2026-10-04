"use client";

import { useEffect, useState } from "react";
import type { ReportData, ReportMark } from "@/lib/reportTypes";
import { readUserError } from "@/lib/feedback";

const MARK_LABEL: Record<ReportMark, string> = {
  "za": "ZA", "pr.": "PRZECIW", "ws.": "WSTRZYMAŁ SIĘ", "ng.": "nie głosował",
  "ob.": "obecny", "nb.": "nieobecny", "nieob.": "nieobecny", "wykl.": "wykluczony",
};
const MARK_COLOR: Record<ReportMark, string> = {
  "za": "var(--color-yes)", "pr.": "var(--color-no)", "ws.": "var(--color-abstain)",
  "ng.": "var(--color-ink-3)", "ob.": "var(--color-ink-2)", "nb.": "var(--color-ink-3)",
  "nieob.": "var(--color-ink-3)", "wykl.": "var(--color-ink-3)",
};

function MarkPill({ mark }: { mark?: ReportMark }) {
  if (!mark) return null;
  return (
    <span className="pt-badge" style={{ borderColor: MARK_COLOR[mark], color: MARK_COLOR[mark], background: "transparent" }}>
      {MARK_LABEL[mark]}
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

/** Okno z wynikami jednego głosowania - kolorowa, czytelna oprawa (nie czarno-biały wydruk). */
export function VoteResultsView({ voteId, onClose }: { voteId: string; onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/votes/${voteId}/participant-report`)
      .then(async (r) => { if (!r.ok) throw new Error(await readUserError(r)); return r.json(); })
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [voteId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-panel pt-modal" role="dialog" aria-modal="true" aria-label="Wyniki głosowania" onClick={(e) => e.stopPropagation()}>
        <div className="pt-panel-head pt-modal-head">
          <h2 className="pt-panel-title">Wyniki głosowania</h2>
          <button className="pt-btn pt-btn-sm" onClick={onClose}>Zamknij</button>
        </div>

        {error && <div className="pt-panel-body pt-text-sm" style={{ color: "var(--color-no)" }}>{error}</div>}
        {!data && !error && <div className="pt-panel-body pt-text-sm pt-muted">Wczytywanie…</div>}

        {data && (
          <div className="pt-panel-body flex flex-col gap-4">
            <div>
              <div className="pt-label">{data.contextLabel}</div>
              <h3 style={{ margin: "4px 0", fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>{data.voteTitle}</h3>
              <div className="pt-label num">{data.timestamp}</div>
            </div>

            {data.isSecret && (
              <div className="pt-badge" style={{ whiteSpace: "normal", alignSelf: "flex-start" }}>Głosowanie tajne - bez ujawniania kto jak głosował</div>
            )}

            {!data.isList && !data.isPackage && (
              <div className="flex flex-wrap gap-2" style={{ textAlign: "center" }}>
                {data.isQuorum ? (
                  <>
                    <StatTile label="Obecni" value={(data.groups ?? []).reduce((s, g) => s + g.people.filter((p) => p.mark === "ob.").length, 0)} color="var(--color-quorum-ok)" />
                    <StatTile label="Nieobecni" value={(data.groups ?? []).reduce((s, g) => s + g.people.filter((p) => p.mark !== "ob.").length, 0)} color="var(--color-quorum-bad)" />
                  </>
                ) : (
                  <>
                    <StatTile label="Za" value={(data.groups ?? []).reduce((s, g) => s + (g.yes ?? 0), 0)} color="var(--color-yes)" />
                    <StatTile label="Przeciw" value={(data.groups ?? []).reduce((s, g) => s + (g.no ?? 0), 0)} color="var(--color-no)" />
                    <StatTile label="Wstrzymało się" value={(data.groups ?? []).reduce((s, g) => s + (g.abstain ?? 0), 0)} color="var(--color-abstain)" />
                  </>
                )}
              </div>
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

            {data.majorityPart && (
              <div className="pt-label">{data.majorityPart}</div>
            )}

            {!data.isSecret && data.groups && data.groups.length > 0 && (
              <div>
                <div className="pt-label mb-2">Wyniki imienne</div>
                {data.groups.map((g) => (
                  <div key={g.shortName || "wszyscy"} className="mb-3">
                    {g.shortName && <div className="pt-text-sm" style={{ fontWeight: 600, color: "var(--color-ink-2)", marginBottom: 4 }}>{g.shortName}</div>}
                    <table className="pt-table">
                      <tbody>
                        {g.people.map((p, i) => (
                          <tr key={i}>
                            <td>{p.lastName} {p.firstName}</td>
                            <td className="pt-r"><MarkPill mark={p.mark} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
