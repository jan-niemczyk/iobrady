"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import type { MeetingAttendance, PersonResult } from "@/lib/attendanceReport";
import { CardHeader, PageContainer, PageHeader } from "./ui";
import { notify, notifyFailure } from "@/lib/feedback";
import { IconArrowLeft, IconChevronDown, IconChevronRight, IconDownload } from "@/components/ui/Icon";

const TZ = "Europe/Warsaw";
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "");
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "");
const SOURCE: Record<string, string> = { SELF: "potwierdzenie przez radnego", OPERATOR: "decyzja operatora", CHECK: "sprawdzenie obecności", QUORUM: "głosowanie kworum", CORRECTION: "korekta" };

function StatusBadge({ p }: { p: PersonResult }) {
  if (p.status === "PRESENT") return <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle">Obecny{p.partial ? " (część)" : ""}</span>;
  if (p.status === "ABSENT") return <span className="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle">Nieobecny</span>;
  return <span className="badge text-bg-light border">Brak danych</span>;
}
const flag = (v: boolean | null, min: number | null) => (v === null ? <span className="text-body-secondary small">nie ustalono</span> : v ? <span>tak, {min} min</span> : <span className="text-body-secondary">nie</span>);

/** Lista obecności posiedzenia: status formalny, przedziały, spóźnienia i wyjścia, historia i korekty. */
export function MeetingAttendanceClient({ initial }: { initial: MeetingAttendance }) {
  const [r, setR] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [withNotes, setWithNotes] = useState(false);

  async function reload() {
    const res = await fetch(`/api/meetings/${r.meeting.id}/attendance-report`, { cache: "no-store" });
    if (res.ok) setR(await res.json());
  }
  const exp = (f: string) => `/api/meetings/${r.meeting.id}/attendance-report/export?format=${f}${withNotes ? "&uwagi=1" : ""}`;

  const table = (rows: PersonResult[], guests = false) => (
    <div className="table-responsive">
      <table className="table align-middle mb-0">
        <thead>
          <tr>
            <th style={{ width: 36 }}><span className="visually-hidden">Rozwiń</span></th>
            <th>Nazwisko i imię</th>
            <th>{guests ? "Rola" : "Rola / klub"}</th>
            <th>Status formalny</th>
            <th>Obecność (godziny)</th>
            {!guests && <th>Spóźnienie</th>}
            {!guests && <th>Wcześniejsze wyjście</th>}
            <th>Źródło</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const isOpen = open === p.userId;
            return (
              <Fragment key={p.userId}>
                <tr>
                  <td>
                    <button type="button" className="btn btn-sm btn-link p-1" aria-expanded={isOpen} aria-controls={`att-${p.userId}`} onClick={() => setOpen(isOpen ? null : p.userId)}
                      aria-label={`${isOpen ? "Zwiń" : "Rozwiń"} historię: ${p.lastName} ${p.firstName}`}>
                      {isOpen ? <IconChevronDown /> : <IconChevronRight />}
                    </button>
                  </td>
                  <td className="fw-medium">{p.lastName} {p.firstName}{p.excused ? <span className="badge text-bg-light border ms-2 fw-normal">usprawiedliwiony</span> : null}</td>
                  <td className="small">{guests ? "gość" : p.kind === "VOTING" ? "z prawem głosu" : "bez prawa głosu"}{p.club ? `, ${p.club}` : ""}</td>
                  <td><StatusBadge p={p} />{p.quality === "PARTIAL" && <div className="small text-body-secondary">dane częściowe</div>}</td>
                  <td className="small">{p.quality === "FULL" ? p.intervals.map((i) => `${time(i.from)}-${i.to ? time(i.to) : "…"}`).join(", ") || "-" : p.quality === "PARTIAL" ? "godziny nieznane" : "-"}</td>
                  {!guests && <td className="small">{p.status === "PRESENT" ? flag(p.late, p.lateMinutes) : <span className="text-body-secondary">-</span>}</td>}
                  {!guests && <td className="small">{p.status === "PRESENT" ? flag(p.earlyLeave, p.earlyMinutes) : <span className="text-body-secondary">-</span>}</td>}
                  <td className="small">{p.sources.map((s) => SOURCE[s] ?? s).join(", ") || <span className="text-body-secondary">-</span>}</td>
                </tr>
                {isOpen && (
                  <tr id={`att-${p.userId}`}>
                    <td />
                    <td colSpan={guests ? 5 : 7} className="bg-body-tertiary">
                      <PersonDetails meetingId={r.meeting.id} p={p} pending={pending} onDone={() => start(reload)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <PageContainer size="xl">
      <PageHeader
        kicker={<Link href={`/meetings/${r.meeting.id}`} className="d-inline-flex align-items-center gap-1"><IconArrowLeft size={14} /> Posiedzenie nr {r.meeting.number}</Link>}
        title="Lista obecności"
        description={<>{r.meeting.name}. Otwarcie: {r.meeting.openedAt ? dt(r.meeting.openedAt) : "brak danych"}; zamknięcie: {r.meeting.closedAt ? dt(r.meeting.closedAt) : r.meeting.provisional ? "posiedzenie trwa" : "brak danych"}. Tolerancja: spóźnienie {r.toleranceLate} min, wyjście {r.toleranceEarly} min (Ustawienia).</>}
        actions={<>
          <div className="form-check mb-0 me-2">
            <input className="form-check-input" type="checkbox" id="att-notes" checked={withNotes} onChange={(e) => setWithNotes(e.target.checked)} />
            <label className="form-check-label small" htmlFor="att-notes">Eksport z usprawiedliwieniami i uwagami</label>
          </div>
          {(["pdf", "docx", "xlsx"] as const).map((f) => <a key={f} className="btn btn-outline-secondary" href={exp(f)}><IconDownload /> {f.toUpperCase()}</a>)}
          <Link className="btn btn-outline-secondary" href="/reports/attendance">Raport zbiorczy</Link>
        </>}
      />
      {r.meeting.provisional && <div className="alert alert-warning">Posiedzenie trwa - wynik jest roboczy.</div>}
      {r.basisNotes.length > 0 && <ul className="small text-body-secondary">{r.basisNotes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <div className="d-flex flex-wrap gap-3 mb-3 small">
        <span>Uprawnieni: <strong>{r.counts.eligible}</strong></span>
        <span>Obecni: <strong>{r.counts.present}</strong></span>
        <span>Nieobecni: <strong>{r.counts.absent}</strong></span>
        <span>Brak danych: <strong>{r.counts.noData}</strong></span>
        <span>Spóźnienia: <strong>{r.counts.late}</strong></span>
        <span>Wcześniejsze wyjścia: <strong>{r.counts.early}</strong></span>
      </div>
      <div className="card mb-3">
        <CardHeader title={<>Członkowie posiedzenia <span className="text-body-secondary fw-normal">({r.people.length})</span></>} sub="Obecność, spóźnienie i wcześniejsze wyjście są osobnymi informacjami. Rozwiń wiersz, aby zobaczyć historię i wprowadzić korektę." />
        {r.people.length === 0 ? <div className="card-body text-body-secondary">Brak uczestników.</div> : table(r.people)}
      </div>
      {r.guests.length > 0 && (
        <div className="card">
          <CardHeader title={<>Goście <span className="text-body-secondary fw-normal">({r.guests.length})</span></>} sub="Bez prawa głosu - nie wliczają się do kworum, uprawnionych ani frekwencji." />
          {table(r.guests, true)}
        </div>
      )}
    </PageContainer>
  );
}

function PersonDetails({ meetingId, p, pending, onDone }: { meetingId: string; p: PersonResult; pending: boolean; onDone: () => void }) {
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [form, setForm] = useState({ present: true, at: toLocal(new Date()), reason: "", supersede: "" });
  const [excused, setExcused] = useState(!!p.excused);
  const [note, setNote] = useState(p.note ?? "");
  const [busy, setBusy] = useState(false);

  async function send(url: string, method: string, body: unknown, msg: string) {
    setBusy(true);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return false; }
    notify.success(msg); onDone(); return true;
  }

  return (
    <div className="row g-3 py-2">
      <div className="col-12 col-xl-6">
        <h3 className="h6">Historia zdarzeń</h3>
        {p.history.length === 0 ? <p className="small text-body-secondary mb-0">{p.quality === "PARTIAL" ? "Brak historii - znany jest tylko stan końcowy (dane częściowe)." : "Brak zapisanych zdarzeń."}</p> : (
          <ul className="list-unstyled small mb-0">
            {p.history.map((e) => (
              <li key={e.id} className={e.superseded ? "text-decoration-line-through text-body-secondary" : undefined}>
                {dt(e.at)} - {e.present ? "obecny" : "nieobecny"} ({SOURCE[e.source] ?? e.source}{e.by ? `, ${e.by}` : ""}){e.reason ? ` - „${e.reason}”` : ""}{e.superseded ? " - zastąpione korektą" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="col-12 col-md-6 col-xl-3">
        <h3 className="h6">Korekta (udokumentowana)</h3>
        <form className="d-flex flex-column gap-2" onSubmit={async (e) => { e.preventDefault(); if (await send(`/api/meetings/${meetingId}/attendance-report/correction`, "POST", { userId: p.userId, present: form.present, at: new Date(form.at).toISOString(), reason: form.reason, supersedeEventId: form.supersede || null }, "Zapisano korektę.")) setForm({ ...form, reason: "", supersede: "" }); }}>
          <select className="form-select form-select-sm" aria-label="Rodzaj korekty" value={form.present ? "1" : "0"} onChange={(e) => setForm({ ...form, present: e.target.value === "1" })}>
            <option value="1">Obecny od</option><option value="0">Nieobecny od</option>
          </select>
          <input type="datetime-local" className="form-control form-control-sm" aria-label="Moment" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} required />
          <select className="form-select form-select-sm" aria-label="Zastępowane zdarzenie" value={form.supersede} onChange={(e) => setForm({ ...form, supersede: e.target.value })}>
            <option value="">Dodaj zdarzenie (bez zastępowania)</option>
            {p.history.filter((e) => !e.superseded).map((e) => <option key={e.id} value={e.id}>Zastąp: {dt(e.at)} {e.present ? "obecny" : "nieobecny"}</option>)}
          </select>
          <textarea className="form-control form-control-sm" rows={2} placeholder="Uzasadnienie (wymagane), np. podstawa korekty" aria-label="Uzasadnienie korekty" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required minLength={3} maxLength={1000} />
          <button className="btn btn-sm btn-primary" disabled={busy || pending || form.reason.trim().length < 3}>Zapisz korektę</button>
        </form>
      </div>
      <div className="col-12 col-md-6 col-xl-3">
        <h3 className="h6">Usprawiedliwienie i uwagi</h3>
        <div className="form-check">
          <input className="form-check-input" type="checkbox" id={`exc-${p.userId}`} checked={excused} onChange={(e) => setExcused(e.target.checked)} />
          <label className="form-check-label" htmlFor={`exc-${p.userId}`}>Nieobecność usprawiedliwiona</label>
        </div>
        <textarea className="form-control form-control-sm my-2" rows={2} aria-label="Uwagi" placeholder="Uwagi (nie trafiają do publicznej listy)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        <button className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => send(`/api/meetings/${meetingId}/attendance-report/note`, "PUT", { userId: p.userId, excused, note }, "Zapisano.")}>Zapisz</button>
      </div>
    </div>
  );
}
