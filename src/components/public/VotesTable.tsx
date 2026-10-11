"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicVoteSummary } from "@/lib/publicMeeting";
import { fmtDateTimeShort, resultShort } from "@/components/public/publicFormat";

/**
 * Chronologiczna lista wszystkich głosowań posiedzenia: tabela na komputerze, zwarte bloki na telefonie.
 * Numeracja zawsze z systemu (nie z pozycji na przefiltrowanej liście). Wyszukiwanie po temacie.
 */
export function VotesTable({ meetingId, votes, itemNumber }: {
  meetingId: string;
  votes: PublicVoteSummary[];
  /** Numer (albo nazwa skrócona) punktu porządku obrad dla id punktu. */
  itemNumber: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("pl");
    return needle ? votes.filter((v) => `${v.title} ${v.description ?? ""}`.toLocaleLowerCase("pl").includes(needle)) : votes;
  }, [q, votes]);

  if (votes.length === 0) {
    return <p className="text-body-secondary mb-0">W tym posiedzeniu nie przeprowadzono jeszcze głosowań.</p>;
  }

  const href = (v: PublicVoteSummary) => `/public/${meetingId}/glosowanie/${v.id}?z=glosowania`;
  const decision = (v: PublicVoteSummary) => v.decision
    ? <span className={`badge ${v.decision.positive ? "text-bg-success" : "text-bg-danger"}`}>{v.decision.label}</span>
    : v.status === "OPEN" ? <span className="badge text-bg-warning">Trwa</span> : null;

  return (
    <>
      <div className="mb-3" style={{ maxWidth: 420 }}>
        <label className="form-label small mb-1" htmlFor="pub-search">Szukaj głosowania</label>
        <input id="pub-search" type="search" className="form-control" placeholder="Temat głosowania" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="small text-body-secondary mb-2" aria-live="polite">
        {q.trim() ? `Znaleziono: ${shown.length} z ${votes.length}` : `Głosowań: ${votes.length}`}
      </p>

      {shown.length === 0 ? (
        <p className="text-body-secondary">Brak głosowań pasujących do „{q.trim()}”. <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setQ("")}>Wyczyść wyszukiwanie</button></p>
      ) : (
        <>
          {/* Komputer: tabela */}
          <div className="table-responsive d-none d-md-block">
            <table className="table table-sm align-middle pub-table">
              <caption className="visually-hidden">Głosowania posiedzenia w kolejności przeprowadzenia</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-end">Nr</th>
                  <th scope="col">Data i godzina</th>
                  <th scope="col">Pkt</th>
                  <th scope="col">Temat</th>
                  <th scope="col">Wynik</th>
                  <th scope="col">Rozstrzygnięcie</th>
                  <th scope="col"><span className="visually-hidden">Szczegóły</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id} id={`g-${v.id}`}>
                    <td className="text-end font-monospace">{v.number ?? ""}</td>
                    <td className="text-nowrap small">{fmtDateTimeShort(v.time)}</td>
                    <td className="small">{v.agendaItemId ? (itemNumber[v.agendaItemId] ?? "") : <span className="text-body-secondary">-</span>}</td>
                    <td style={{ overflowWrap: "anywhere" }}>
                      {v.title}
                      {v.secret && <span className="badge text-bg-light border ms-2 fw-normal">tajne</span>}
                    </td>
                    <td className="small">{resultShort(v)}</td>
                    <td>{decision(v)}</td>
                    <td className="text-end"><Link href={href(v)} className="text-nowrap">Szczegóły<span className="visually-hidden"> głosowania nr {v.number}</span></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Telefon: zwarte bloki z podpisanymi polami */}
          <ul className="list-unstyled d-md-none mb-0">
            {shown.map((v) => (
              <li key={v.id} id={`gm-${v.id}`} className="border-bottom py-2">
                <div className="d-flex justify-content-between gap-2 small text-body-secondary">
                  <span>Głosowanie nr {v.number ?? "-"}{v.agendaItemId && itemNumber[v.agendaItemId] ? `, pkt ${itemNumber[v.agendaItemId]}` : ""}</span>
                  <span className="text-nowrap">{fmtDateTimeShort(v.time)}</span>
                </div>
                <div className="fw-medium" style={{ overflowWrap: "anywhere" }}>
                  {v.title}{v.secret && <span className="badge text-bg-light border ms-2 fw-normal">tajne</span>}
                </div>
                <div className="d-flex flex-wrap align-items-center gap-2 small mt-1">
                  <span><span className="text-body-secondary">Wynik:</span> {resultShort(v)}</span>
                  {decision(v)}
                  <Link href={href(v)} className="ms-auto">Szczegóły</Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
