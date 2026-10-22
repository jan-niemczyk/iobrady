"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL } from "@/lib/inquiryLabels";

type Row = { id: string; kind: string; status: string; number: string | null; title: string; submittedAt: string | null; receivedAt: string | null; authors: string[]; addressees: string[]; answers: number; newAnswer: boolean };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" }) : null);

/** Sprawy radnego (własne i współautorskie, w tym szkice i zaproszenia do współautorstwa). */
export function InquiryListParticipant() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [me, setMe] = useState<{ enabled: boolean; canSubmit: boolean; publicArchive?: boolean } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    Promise.all([fetch("/api/inquiries", { cache: "no-store" }), fetch("/api/inquiries/me", { cache: "no-store" })])
      .then(async ([a, b]) => { if (!a.ok || !b.ok) throw new Error(); setRows(await a.json()); setMe(await b.json()); })
      .catch(() => setError(true));
  }, []);
  const drafts = (rows ?? []).filter((r) => r.status === "DRAFT");
  const rest = (rows ?? []).filter((r) => r.status !== "DRAFT");
  const list = (items: Row[]) => (
    <ul className="pt-list">
      {items.map((r) => (
        <li key={r.id} style={{ padding: 0 }}>
          <Link href={`/session/interpelacje/${r.id}`} className="pt-row-link">
            <span className="pt-grow">
              <span className="pt-label">{INQUIRY_KIND_LABEL[r.kind]}{r.number ? ` nr ${r.number}` : ""}{fmt(r.receivedAt ?? r.submittedAt) ? ` - ${fmt(r.receivedAt ?? r.submittedAt)}` : ""}</span>
              <span className="pt-row-title">{r.title}</span>
              <span className="pt-label">Adresaci: {r.addressees.join("; ") || "-"}{r.answers ? ` - odpowiedzi: ${r.answers}` : ""}</span>
            </span>
            <span className={`pt-badge${r.newAnswer ? " pt-badge-yes" : ""}`}>{r.newAnswer ? "Nowa odpowiedź" : INQUIRY_STATUS_LABEL[r.status]}</span>
            <span className="pt-muted" aria-hidden="true">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="pt-page">
      <header className="pt-page-header">
        <div className="pt-kicker">Interpelacje i zapytania</div>
        <h1 className="pt-h1">Moje sprawy</h1>
      </header>
      {me?.publicArchive && (
        <div className="pt-btn-group" style={{ marginBottom: 12 }}>
          <a className="pt-btn" href="/public/interpelacje" target="_blank" rel="noopener">Rejestr publiczny</a>
        </div>
      )}
      {me?.canSubmit ? (
        <div className="pt-btn-group" style={{ marginBottom: 12 }}>
          <Link className="pt-btn pt-btn-primary" href="/session/interpelacje/nowa">Nowa interpelacja</Link>
          <Link className="pt-btn" href="/session/interpelacje/nowa?rodzaj=zapytanie">Nowe zapytanie</Link>
        </div>
      ) : me && (
        <p className="pt-muted" style={{ marginBottom: 12 }}>{me.enabled ? "Nie masz nadanego prawa składania interpelacji i zapytań. Dostęp do dotychczasowych spraw pozostaje." : "Moduł jest wyłączony - możesz przeglądać dotychczasowe sprawy."}</p>
      )}
      {error ? <section className="pt-panel"><div className="pt-empty">Nie udało się wczytać spraw. Odśwież stronę.</div></section>
        : rows === null ? <section className="pt-panel"><div className="pt-empty">Wczytywanie…</div></section>
        : (
          <>
            {drafts.length > 0 && <section className="pt-panel" aria-labelledby="inq-drafts"><div className="pt-panel-head"><h2 id="inq-drafts" className="pt-panel-title">Szkice ({drafts.length})</h2></div>{list(drafts)}</section>}
            <section className="pt-panel" aria-labelledby="inq-all" style={{ marginTop: 12 }}>
              <div className="pt-panel-head"><h2 id="inq-all" className="pt-panel-title">Złożone ({rest.length})</h2></div>
              {rest.length ? list(rest) : <div className="pt-empty">Brak złożonych spraw.</div>}
            </section>
          </>
        )}
    </div>
  );
}
