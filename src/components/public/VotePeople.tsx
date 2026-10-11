"use client";

import { useMemo, useState } from "react";
import type { PublicPerson, PublicVoteDetail } from "@/lib/publicMeeting";
import { NO_CLUB, personStatusClass, personStatusLabel } from "@/components/public/publicFormat";

const ALL = "__all";
const NONE = "__none";

/**
 * Wyniki indywidualne: pełna lista od razu (bez paginacji). Przy włączonej obsłudze klubów i kół -
 * kolumna przynależności, filtr (wszyscy / klub / bez przynależności) i opcjonalne grupowanie.
 * Głosowanie tajne: tylko „oddał / nie oddał głosu” - bez treści głosu.
 */
export function VotePeople({ vote }: { vote: PublicVoteDetail }) {
  const clubs = vote.groupsEnabled;
  const [filter, setFilter] = useState<string>(ALL);
  const [grouped, setGrouped] = useState(false);

  const clubKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of vote.people) if (p.club) keys.add(p.club);
    return [...keys].sort((a, b) => a.localeCompare(b, "pl"));
  }, [vote.people]);
  const hasNoClub = vote.people.some((p) => !p.club);

  const visible = useMemo(() => vote.people.filter((p) =>
    !clubs || filter === ALL ? true : filter === NONE ? !p.club : p.club === filter,
  ), [vote.people, filter, clubs]);

  if (vote.people.length === 0) {
    return <p className="text-body-secondary mb-0">Brak listy uczestników dla tego głosowania.</p>;
  }

  const clubLabel = (k: string | null) => (k ? (vote.clubNames[k] && vote.clubNames[k] !== k ? `${k} (${vote.clubNames[k]})` : k) : NO_CLUB);
  const groups: { key: string | null; people: PublicPerson[] }[] = grouped && clubs
    ? [...clubKeys.map((k) => ({ key: k as string | null, people: visible.filter((p) => p.club === k) })),
       ...(hasNoClub ? [{ key: null, people: visible.filter((p) => !p.club) }] : [])].filter((g) => g.people.length > 0)
    : [{ key: null, people: visible }];

  const extra = (p: PublicPerson) => {
    if (p.selected) return p.selected.length > 0 ? `za: ${p.selected.join(", ")}` : "przeciw wszystkim kandydaturom";
    if (p.positions) return p.positions.map((c, i) => `${i + 1}: ${c === "YES" ? "za" : c === "NO" ? "przeciw" : c === "ABSTAIN" ? "wstrz." : "-"}`).join(", ");
    return null;
  };
  let lp = 0;

  return (
    <>
      {clubs && (
        <div className="d-flex flex-wrap align-items-end gap-3 mb-2">
          <div>
            <label className="form-label small mb-1" htmlFor="pv-club">Klub / koło</label>
            <select id="pv-club" className="form-select form-select-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value={ALL}>Wszystkie osoby</option>
              {clubKeys.map((k) => <option key={k} value={k}>{clubLabel(k)}</option>)}
              {hasNoClub && <option value={NONE}>{NO_CLUB}</option>}
            </select>
          </div>
          <div className="form-check mb-1">
            <input className="form-check-input" type="checkbox" id="pv-group" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
            <label className="form-check-label small" htmlFor="pv-group">Grupuj według klubów i kół</label>
          </div>
          <div className="small text-body-secondary mb-1" aria-live="polite">Osób: {visible.length}</div>
        </div>
      )}
      {clubs && !vote.clubsFromSnapshot && (
        <p className="small text-warning-emphasis mb-2">Przynależność według bieżących danych - dla tego głosowania nie zapisano przynależności z dnia głosowania.</p>
      )}

      <div className="table-responsive">
        <table className="table table-sm align-middle pub-table mb-0">
          <caption className="visually-hidden">Wyniki indywidualne</caption>
          <thead>
            <tr>
              <th scope="col" className="text-end" style={{ width: "3rem" }}>Lp.</th>
              <th scope="col">Imię i nazwisko</th>
              {clubs && <th scope="col">Klub / koło</th>}
              <th scope="col">{vote.secret || vote.type === "QUORUM" ? "Status" : "Głos"}</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.key ?? "none"}>
              {grouped && clubs && (
                <tr className="table-light">
                  <th scope="rowgroup" colSpan={4} className="small">{clubLabel(g.key)} <span className="fw-normal text-body-secondary">({g.people.length})</span></th>
                </tr>
              )}
              {g.people.map((p) => {
                lp++;
                const ex = extra(p);
                return (
                  <tr key={`${p.lastName}-${p.firstName}-${lp}`}>
                    <td className="text-end text-body-secondary">{lp}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{p.firstName} {p.lastName}</td>
                    {clubs && <td className="small">{p.club ?? <span className="text-body-secondary">{NO_CLUB}</span>}</td>}
                    <td>
                      <span className={personStatusClass(p.status)}>{personStatusLabel(p)}</span>
                      {ex && <div className="small text-body-secondary" style={{ overflowWrap: "anywhere" }}>{ex}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

/** Zestawienie wyników według klubów i kół (tylko głosowania jawne, zakończone). Wiersz „Razem” = suma. */
export function ClubSummary({ vote }: { vote: PublicVoteDetail }) {
  const rows = useMemo(() => {
    const map = new Map<string, PublicPerson[]>();
    for (const p of vote.people) {
      const k = p.club ?? NO_CLUB;
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    const keys = [...map.keys()].sort((a, b) => (a === NO_CLUB ? 1 : b === NO_CLUB ? -1 : a.localeCompare(b, "pl")));
    return keys.map((k) => ({ key: k, people: map.get(k)! }));
  }, [vote.people]);

  const isList = vote.type === "LIST";
  const isQuorum = vote.type === "QUORUM";
  const candidates = isList ? (vote.result?.options ?? []).map((o) => o.label) : [];
  const count = (ps: PublicPerson[], s: PublicPerson["status"]) => ps.filter((p) => p.status === s).length;
  const voted = (ps: PublicPerson[]) => ps.filter((p) => p.status !== "NOT_VOTED" && p.status !== "ABSENT").length;
  const cols: { label: string; value: (ps: PublicPerson[]) => number }[] = isQuorum
    ? [{ label: "Obecni", value: (ps) => count(ps, "VOTED") }, { label: "Nie potwierdzili", value: (ps) => count(ps, "NOT_VOTED") }]
    : vote.type === "STANDARD"
      ? [
          { label: "Za", value: (ps) => count(ps, "YES") },
          { label: "Przeciw", value: (ps) => count(ps, "NO") },
          { label: "Wstrz.", value: (ps) => count(ps, "ABSTAIN") },
          { label: "Nie głosowało", value: (ps) => count(ps, "NOT_VOTED") },
          { label: "Nieobecni", value: (ps) => count(ps, "ABSENT") },
        ]
      : [
          { label: "Głosowało", value: voted },
          ...candidates.map((c) => ({ label: `Za: ${c}`, value: (ps: PublicPerson[]) => ps.filter((p) => p.selected?.includes(c)).length })),
          { label: "Nie głosowało", value: (ps) => count(ps, "NOT_VOTED") },
          { label: "Nieobecni", value: (ps) => count(ps, "ABSENT") },
        ];

  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle pub-table mb-0">
        <caption className="visually-hidden">Zestawienie według klubów i kół</caption>
        <thead>
          <tr>
            <th scope="col">Klub / koło</th>
            <th scope="col" className="text-end">Osób</th>
            {cols.map((c) => <th key={c.label} scope="col" className="text-end">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="fw-medium" style={{ overflowWrap: "anywhere" }}>{r.key}</th>
              <td className="text-end">{r.people.length}</td>
              {cols.map((c) => <td key={c.label} className="text-end">{c.value(r.people)}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="fw-semibold">
            <th scope="row">Razem</th>
            <td className="text-end">{vote.people.length}</td>
            {cols.map((c) => <td key={c.label} className="text-end">{c.value(vote.people)}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
