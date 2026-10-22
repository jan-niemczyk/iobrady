"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { INQUIRY_KIND_LABEL } from "@/lib/inquiryLabels";

type Row = { id: string; kind: string; number: string | null; title: string; forwardedAt: string | null; dueDate: string | null; answered: boolean; withdrawn: boolean; closed: boolean; addressees: string[] };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "-");

/** Sprawy przekazane do odpowiedzi - najpierw oczekujące. */
export function ResponderListClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { fetch("/api/responder/cases", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setRows).catch(() => setError(true)); }, []);
  const pending = (rows ?? []).filter((r) => !r.answered && !r.withdrawn && !r.closed);
  const done = (rows ?? []).filter((r) => r.answered || r.withdrawn || r.closed);
  const list = (items: Row[]) => (
    <ul className="list-group list-group-flush">
      {items.map((r) => (
        <li key={r.id} className="list-group-item">
          <Link href={`/odpowiedzi/${r.id}`} className="d-flex flex-wrap justify-content-between gap-2 text-reset text-decoration-none">
            <span className="min-w-0">
              <span className="small text-body-secondary d-block">{INQUIRY_KIND_LABEL[r.kind]}{r.number ? ` nr ${r.number}` : ""} - {r.addressees.join(", ")}</span>
              <span className="fw-medium">{r.title}</span>
            </span>
            <span className="small text-nowrap">
              {r.withdrawn ? "Wycofana" : r.answered ? "Odpowiedź złożona" : `Termin: ${fmt(r.dueDate)}`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="container-lg px-3 py-4" style={{ maxWidth: 960 }}>
      <h1 className="h4 mb-3">Sprawy do odpowiedzi</h1>
      {error ? <div className="alert alert-danger">Nie udało się wczytać spraw.</div> : rows === null ? <p className="text-body-secondary">Wczytywanie…</p> : (
        <>
          <div className="card mb-3">
            <div className="card-header fw-semibold">Oczekujące ({pending.length})</div>
            {pending.length ? list(pending) : <div className="card-body text-body-secondary">Brak spraw oczekujących na odpowiedź.</div>}
          </div>
          {done.length > 0 && (
            <div className="card">
              <div className="card-header fw-semibold">Pozostałe ({done.length})</div>
              {list(done)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
