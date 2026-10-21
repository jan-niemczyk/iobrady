"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicVoteSummary } from "@/lib/publicMeeting";
import { fmtDateTimeShort, itemNumberLabel, normSearch, resultShort, voteSearchText } from "@/components/public/publicFormat";

/**
 * Chronologiczna lista wszystkich głosowań posiedzenia: tabela na komputerze, zwarte rekordy na telefonie.
 * Każdy rekord pokazuje osobno punkt porządku obrad (numer i pełny tytuł) i przedmiot głosowania.
 * Wyszukiwanie: tytuł punktu, przedmiot, numer głosowania i numer druku - bez rozróżniania wielkości
 * liter i polskich znaków. Fraza trafia do adresu strony, a przejście do szczegółów zapamiętuje
 * pozycję przewinięcia, więc powrót odtwarza zakładkę, wyszukiwanie i miejsce na liście.
 */
export function VotesTable({ meetingId, votes, initialQuery = "" }: {
  meetingId: string;
  votes: PublicVoteSummary[];
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const restored = useRef(false);
  const scrollKey = `pub-scroll-${meetingId}-glosowania`;

  const indexed = useMemo(() => votes.map((v) => ({ v, text: voteSearchText(v) })), [votes]);
  const shown = useMemo(() => {
    const words = normSearch(q.trim()).split(/\s+/).filter(Boolean);
    return words.length ? indexed.filter((x) => words.every((w) => x.text.includes(w))).map((x) => x.v) : votes;
  }, [q, indexed, votes]);

  // Fraza w adresie strony (bez przeładowania) - zachowana przy powrocie ze szczegółów.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (q.trim()) url.searchParams.set("q", q.trim()); else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [q]);

  // Odtworzenie pozycji przewinięcia po powrocie ze szczegółów.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const y = sessionStorage.getItem(scrollKey);
      if (y) { sessionStorage.removeItem(scrollKey); requestAnimationFrame(() => window.scrollTo(0, Number(y))); }
    } catch { /* brak dostępu do pamięci sesji */ }
  }, [scrollKey]);

  if (votes.length === 0) {
    return <p className="text-body-secondary mb-0">W tym posiedzeniu nie przeprowadzono jeszcze głosowań.</p>;
  }

  const href = (v: PublicVoteSummary) => `/public/${meetingId}/glosowanie/${v.id}?z=glosowania${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`;
  const remember = () => { try { sessionStorage.setItem(scrollKey, String(window.scrollY)); } catch { /* ignoruj */ } };
  const decision = (v: PublicVoteSummary) => v.decision
    ? <span className={`badge ${v.decision.positive ? "text-bg-success" : "text-bg-danger"}`}>{v.decision.label}</span>
    : v.status === "OPEN" ? <span className="badge text-bg-warning">Trwa</span> : null;

  const Topic = ({ v }: { v: PublicVoteSummary }) => (
    <>
      {v.item ? (
        <div className="fw-semibold" style={{ overflowWrap: "anywhere" }}>
          {itemNumberLabel(v.item) && <span className="text-nowrap">{itemNumberLabel(v.item)} </span>}{v.item.title}
        </div>
      ) : (
        <div className="fw-semibold text-body-secondary" style={{ overflowWrap: "anywhere" }}>{v.contextLabel ?? "Poza porządkiem obrad"}</div>
      )}
      <div style={{ overflowWrap: "anywhere" }}>
        {v.title}
        {v.secret && <span className="badge text-bg-light border ms-2 fw-normal">tajne</span>}
      </div>
    </>
  );

  return (
    <>
      <div className="mb-3" style={{ maxWidth: 480 }}>
        <label className="form-label small mb-1" htmlFor="pub-search">Szukaj głosowania</label>
        <input id="pub-search" type="search" className="form-control" placeholder="Tytuł punktu, przedmiot, numer głosowania lub druku" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="small text-body-secondary mb-2" aria-live="polite">
        {q.trim() ? `Znaleziono: ${shown.length} z ${votes.length}` : `Głosowań: ${votes.length}`}
      </p>

      {shown.length === 0 ? (
        <p className="text-body-secondary">Brak głosowań pasujących do „{q.trim()}”. <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setQ("")}>Wyczyść wyszukiwanie</button></p>
      ) : (
        <>
          {/* Komputer: tabela - najwięcej miejsca dla tematu, długie nazwy zawijane */}
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle pub-table">
              <caption className="visually-hidden">Głosowania posiedzenia w kolejności przeprowadzenia</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-end" style={{ width: "3.5rem" }}>Nr</th>
                  <th scope="col" style={{ width: "9.5rem" }}>Data i godzina</th>
                  <th scope="col">Temat</th>
                  <th scope="col" style={{ width: "13rem" }}>Wynik</th>
                  <th scope="col" style={{ width: "8.5rem" }}>Rozstrzygnięcie</th>
                  <th scope="col" style={{ width: "7rem" }}><span className="visually-hidden">Szczegóły</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id} id={`g-${v.id}`}>
                    <td className="text-end font-monospace align-top">{v.number ?? ""}</td>
                    <td className="small align-top">{fmtDateTimeShort(v.time)}</td>
                    <td className="align-top"><Topic v={v} /></td>
                    <td className="small align-top">{resultShort(v)}</td>
                    <td className="align-top">{decision(v)}</td>
                    <td className="text-end align-top">
                      <Link href={href(v)} onClick={remember} className="btn btn-sm btn-outline-primary text-nowrap">Szczegóły<span className="visually-hidden"> głosowania nr {v.number}</span></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Telefon: zwarte rekordy z tymi samymi informacjami */}
          <ul className="list-unstyled d-md-none mb-0">
            {shown.map((v) => (
              <li key={v.id} id={`gm-${v.id}`} className="border-bottom py-2">
                <div className="d-flex justify-content-between gap-2 small text-body-secondary">
                  <span>Głosowanie nr {v.number ?? "-"}</span>
                  <span className="text-nowrap">{fmtDateTimeShort(v.time)}</span>
                </div>
                <Topic v={v} />
                <div className="d-flex flex-wrap align-items-center gap-2 small mt-1">
                  <span><span className="text-body-secondary">Wynik:</span> {resultShort(v)}</span>
                  {decision(v)}
                  <Link href={href(v)} onClick={remember} className="ms-auto btn btn-sm btn-outline-primary">Szczegóły<span className="visually-hidden"> głosowania nr {v.number}</span></Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
