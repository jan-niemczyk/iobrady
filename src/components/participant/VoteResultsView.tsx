"use client";

import { useEffect, useState } from "react";
import type { ReportData, ReportMark } from "@/lib/reportTypes";

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
    <span className="pill" style={{ borderColor: MARK_COLOR[mark], color: MARK_COLOR[mark], fontWeight: 600 }}>
      {MARK_LABEL[mark]}
    </span>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center" style={{ minWidth: 90 }}>
      <div className="stat stat-md" style={{ color: color ?? "var(--color-ink)" }}>{value}</div>
      <div className="eyebrow mt-1">{label}</div>
    </div>
  );
}

/** Modal z wynikami jednego głosowania - kolorowa, czytelna oprawa (nie czarno-biały wydruk). */
export function VoteResultsView({ voteId, onClose }: { voteId: string; onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/votes/${voteId}/participant-report`)
      .then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json(); })
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [voteId]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="card" style={{ width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto", background: "var(--color-paper)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[var(--color-rule-soft)] flex items-center justify-between sticky top-0" style={{ background: "var(--color-paper)" }}>
          <div className="eyebrow">Wyniki głosowania</div>
          <button className="btn btn-sm" onClick={onClose}>Zamknij</button>
        </div>

        {error && <div className="p-6 text-sm" style={{ color: "var(--color-no)" }}>{error}</div>}
        {!data && !error && <div className="p-6 text-sm" style={{ color: "var(--color-ink-3)" }}>Wczytywanie…</div>}

        {data && (
          <div className="p-5">
            <div className="text-xs mb-1" style={{ color: "var(--color-ink-3)" }}>{data.contextLabel}</div>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>{data.voteTitle}</h2>
            <div className="text-xs mb-4" style={{ color: "var(--color-ink-3)" }}>{data.timestamp}</div>

            {data.isSecret && (
              <div className="pill pill-neutral mb-4">Głosowanie tajne - bez ujawniania kto jak głosował</div>
            )}

            {!data.isList && !data.isPackage && (
              <div className="flex items-center justify-center gap-6 flex-wrap mb-6 p-4 card-soft">
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
              <div className="mb-6">
                <div className="eyebrow mb-2">Wyniki kandydatów</div>
                <div className="space-y-1">
                  {[...data.candidatesSummary].sort((a, b) => b.yesCount - a.yesCount).map((c) => (
                    <div key={c.label} className="flex items-center gap-2 text-sm">
                      <span style={{ flex: "1 1 auto" }}>{c.label}</span>
                      <span className="num font-semibold" style={{ color: "var(--color-yes)" }}>{c.yesCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.packagePositions && (
              <div className="mb-6 space-y-2">
                <div className="eyebrow mb-2">Wyniki pozycji</div>
                {data.packagePositions.map((p) => (
                  <div key={p.positionNumber} className="text-sm">
                    <div className="font-medium">{p.positionNumber}. {p.label}</div>
                    <div className="flex gap-4 text-xs mt-0.5">
                      <span style={{ color: "var(--color-yes)" }}>za {p.yes}</span>
                      <span style={{ color: "var(--color-no)" }}>przeciw {p.no}</span>
                      <span style={{ color: "var(--color-abstain)" }}>wstrz. {p.abstain}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data.majorityPart && (
              <div className="text-xs mb-4" style={{ color: "var(--color-ink-3)" }}>{data.majorityPart}</div>
            )}

            {!data.isSecret && data.groups && data.groups.length > 0 && (
              <div>
                <div className="eyebrow mb-2">Wyniki imienne</div>
                {data.groups.map((g) => (
                  <div key={g.shortName || "wszyscy"} className="mb-4">
                    {g.shortName && <div className="text-xs font-semibold mb-1.5" style={{ color: "var(--color-ink-2)" }}>{g.shortName}</div>}
                    <div className="space-y-1">
                      {g.people.map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-sm py-0.5 border-b border-[var(--color-rule-soft)]">
                          <span>{p.lastName} {p.firstName}</span>
                          <MarkPill mark={p.mark} />
                        </div>
                      ))}
                    </div>
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
