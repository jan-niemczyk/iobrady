"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { normSearch } from "@/components/public/publicFormat";
import { INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL } from "@/lib/inquiryLabels";

type Row = { id: string; kind: string; status: string; number: string | null; title: string; receivedAt: string | null; authors: string[]; addressees: string[]; answers: number };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" }) : "-");

/** Lista opublikowanych spraw z wyszukiwaniem (numer, tytuł, autor, adresat) i filtrem rodzaju. */
export function PublicInquirySearch({ rows, initialQuery }: { rows: Row[]; initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [kind, setKind] = useState("");
  const shown = useMemo(() => {
    const n = normSearch(q.trim());
    return rows.filter((r) => (!kind || r.kind === kind) && (!n || normSearch(`${r.number ?? ""} ${r.title} ${r.authors.join(" ")} ${r.addressees.join(" ")}`).includes(n)));
  }, [rows, q, kind]);
  return (
    <>
      <div className="d-flex flex-wrap gap-2 mb-3" role="search">
        <label className="visually-hidden" htmlFor="pi-q">Szukaj</label>
        <input id="pi-q" type="search" className="form-control" style={{ maxWidth: 420 }} placeholder="Szukaj: numer, tytuł, autor, adresat" value={q}
          onChange={(e) => { setQ(e.target.value); const u = new URL(window.location.href); if (e.target.value) u.searchParams.set("q", e.target.value); else u.searchParams.delete("q"); window.history.replaceState(null, "", u); }} />
        <label className="visually-hidden" htmlFor="pi-kind">Rodzaj</label>
        <select id="pi-kind" className="form-select w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Wszystkie rodzaje</option><option value="INTERPELLATION">Interpelacje</option><option value="QUESTION">Zapytania</option>
        </select>
      </div>
      <p className="small text-body-secondary" aria-live="polite">Wyniki: {shown.length}</p>
      {shown.length === 0 ? <p className="text-body-secondary">Brak opublikowanych spraw spełniających kryteria.</p> : (
        <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
          {shown.map((r) => (
            <li key={r.id} className="card"><div className="card-body py-2">
              <div className="small text-body-secondary">{INQUIRY_KIND_LABEL[r.kind]}{r.number ? ` nr ${r.number}` : ""} - wpływ {fmt(r.receivedAt)} - {INQUIRY_STATUS_LABEL[r.status]}</div>
              <Link href={`/public/interpelacje/${r.id}`} className="fw-semibold">{r.title}</Link>
              <div className="small">Autorzy: {r.authors.join(", ")}. Adresaci: {r.addressees.join("; ")}. Odpowiedzi: {r.answers}.</div>
            </div></li>
          ))}
        </ul>
      )}
    </>
  );
}
