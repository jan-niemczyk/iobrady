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

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center" style={{ minWidth: 80 }}>
      <div className="stat stat-sm" style={{ color: color ?? "var(--color-ink)" }}>{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}

/** Wynik jednego głosowania - wersja publiczna (bez logowania), renderowana inline w porządku
 * obrad. Dla głosowań jawnych - pełne wyniki imienne; dla tajnych - tylko liczby zbiorcze. */
export function PublicVoteResult({ data }: { data: ReportData }) {
  return (
    <div className="mt-2 p-3" style={{ background: "var(--color-paper-2)", borderRadius: 6 }}>
      <div className="text-xs font-medium mb-2">{data.voteTitle}</div>
      {data.isSecret && (
        <div className="pill pill-neutral mb-2" style={{ fontSize: 10 }}>Głosowanie tajne - bez ujawniania kto jak głosował</div>
      )}
      {!data.isList && !data.isPackage && (
        <div className="flex items-center gap-4 flex-wrap mb-2">
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
        <div className="space-y-0.5 mb-2">
          {[...data.candidatesSummary].sort((a, b) => b.yesCount - a.yesCount).map((c) => (
            <div key={c.label} className="flex items-center gap-2 text-xs">
              <span style={{ flex: "1 1 auto" }}>{c.label}</span>
              <span className="num font-semibold" style={{ color: "var(--color-yes)" }}>{c.yesCount}</span>
            </div>
          ))}
        </div>
      )}

      {data.packagePositions && (
        <div className="space-y-1 mb-2">
          {data.packagePositions.map((p) => (
            <div key={p.positionNumber} className="text-xs">
              <div className="font-medium">{p.positionNumber}. {p.label}</div>
              <div className="flex gap-3 mt-0.5">
                <span style={{ color: "var(--color-yes)" }}>za {p.yes}</span>
                <span style={{ color: "var(--color-no)" }}>przeciw {p.no}</span>
                <span style={{ color: "var(--color-abstain)" }}>wstrz. {p.abstain}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!data.isSecret && data.groups && data.groups.length > 0 && (
        <div className="mt-2">
          {data.groups.map((g) => (
            <div key={g.shortName || "wszyscy"} className="mb-2">
              {g.shortName && <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-ink-2)" }}>{g.shortName}</div>}
              <div>
                {g.people.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs py-0.5">
                    <span>{p.lastName} {p.firstName}</span>
                    {p.mark && <span style={{ color: MARK_COLOR[p.mark], fontWeight: 600 }}>{MARK_LABEL[p.mark]}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
