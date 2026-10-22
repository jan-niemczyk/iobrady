"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CardHeader, PageContainer, PageHeader } from "../ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL, LETTER_KIND_LABEL } from "@/lib/inquiryLabels";
import type { InquiryView } from "@/lib/inquiryDetail";
import { RichEditor } from "@/components/RichEditor";
import { RichTextView } from "@/components/RichTextView";
import { IconArrowLeft, IconDownload, IconTrash } from "@/components/ui/Icon";

type Letter = InquiryView["letters"][number];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" }) : null);
const dateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const toIso = (v: string) => (v ? new Date(`${v}T12:00:00`).toISOString() : null);
const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * Karta sprawy (operator): chronologiczna oś pism, przekazania i terminy osobno dla każdego
 * adresata, rejestracja z numeracją, pisma (odpowiedzi, uzupełnienia, ponowienia), publikacja
 * wersji publicznej i PDF/DOCX.
 */
export function InquiryCaseOperatorClient({ id }: { id: string }) {
  const router = useRouter();
  const [v, setV] = useState<InquiryView | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/inquiries/${id}`, { cache: "no-store" });
    if (!r.ok) { setState("missing"); return; }
    setV(await r.json());
    setState("ok");
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function call(url: string, init: RequestInit, ok: string) {
    setBusy(true);
    const r = await fetch(url, init);
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return false; }
    const d = await r.json().catch(() => ({}));
    notify.success(d.message ?? ok);
    await load();
    return true;
  }
  async function remove() {
    if (!(await ask({ title: "Usunąć sprawę trwale?", message: "Sprawa, wszystkie pisma i pliki zostaną usunięte. Numer usuniętej sprawy zostanie ponownie użyty tylko, jeśli była ostatnia w numeracji. Tej operacji nie można cofnąć.", confirmLabel: "Usuń trwale", danger: true }))) return;
    const r = await fetch(`/api/inquiries/${id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Usunięto sprawę.");
    router.push("/inquiries");
  }
  const action = (a: string, extra: Record<string, unknown> = {}) => call(`/api/inquiries/${id}/actions`, json("POST", { action: a, ...extra }), "Zapisano.");

  if (state === "loading") return <PageContainer size="lg"><div className="text-body-secondary py-4">Wczytywanie…</div></PageContainer>;
  if (state === "missing" || !v) return <PageContainer size="lg"><div className="alert alert-warning mt-4">Nie znaleziono sprawy. <Link href="/inquiries">Wróć do rejestru</Link></div></PageContainer>;

  const ro = !v.viewer.enabled;
  const ref = `${INQUIRY_KIND_LABEL[v.kind]}${v.number ? ` nr ${v.number}` : " (bez numeru)"}`;

  return (
    <PageContainer size="xl">
      <PageHeader
        kicker={<Link href="/inquiries" className="d-inline-flex align-items-center gap-1"><IconArrowLeft size={14} /> Rejestr</Link>}
        title={v.title}
        description={`${ref} - ${INQUIRY_STATUS_LABEL[v.status]}${v.published ? " - opublikowana" : ""}`}
      />
      {ro && <div className="alert alert-warning">Moduł jest wyłączony - karta jest tylko do odczytu.</div>}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        {!ro && !v.registeredAt && !v.withdrawnAt && <RegisterButton busy={busy} onRegister={(extra) => action("register", extra)} />}
        {!ro && v.registeredAt && !v.closedAt && !v.withdrawnAt && <button className="btn btn-outline-primary" disabled={busy} onClick={async () => { if (await ask({ title: "Zakończyć sprawę?", message: "Zakończenie można później cofnąć.", confirmLabel: "Zakończ" })) void action("close"); }}>Zakończ sprawę</button>}
        <div className="dropdown">
          <button className="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><IconDownload size={14} /> Pobierz</button>
          <ul className="dropdown-menu">
            <li><a className="dropdown-item" href={`/api/inquiries/${id}/pdf`}>PDF korespondencji</a></li>
            <li><a className="dropdown-item" href={`/api/inquiries/${id}/docx`}>DOCX korespondencji</a></li>
          </ul>
        </div>
        <div className="dropdown">
          <button className="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Więcej</button>
          <ul className="dropdown-menu">
            {!ro && v.closedAt && <li><button type="button" className="dropdown-item" disabled={busy} onClick={() => action("reopen")}>Wznów sprawę</button></li>}
            {!ro && !v.withdrawnAt && <li><button type="button" className="dropdown-item" disabled={busy} onClick={async () => { if (await ask({ title: "Odnotować wycofanie?", message: "Wycofanie zgłoszone przez autora poza aplikacją.", confirmLabel: "Odnotuj wycofanie", danger: true })) void action("withdraw"); }}>Odnotuj wycofanie</button></li>}
            <li><hr className="dropdown-divider" /></li>
            <li><button type="button" className="dropdown-item text-danger" disabled={busy} onClick={remove}>Usuń trwale</button></li>
          </ul>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-xxl-4 d-flex flex-column gap-3">
          <div className="card">
            <CardHeader title="Sprawa" />
            <div className="card-body small">
              <dl className="row mb-0">
                <dt className="col-5 fw-normal text-body-secondary">Rodzaj i numer</dt><dd className="col-7">{ref}</dd>
                <dt className="col-5 fw-normal text-body-secondary">Autorzy</dt><dd className="col-7">{v.authors.map((a) => <div key={a.id}>{a.name}{a.isPrimary ? " (autor główny)" : ""}{a.confirmation === "PENDING" ? <span className="badge text-bg-warning ms-1">czeka na potwierdzenie</span> : a.confirmation === "OPERATOR" ? <span className="text-body-secondary"> - wspólne pismo wprowadzone przez operatora</span> : null}</div>)}</dd>
                <dt className="col-5 fw-normal text-body-secondary">Złożono w aplikacji</dt><dd className="col-7">{fmt(v.submittedAt) ?? "-"}</dd>
                <dt className="col-5 fw-normal text-body-secondary">Data wpływu</dt><dd className="col-7">{fmt(v.receivedAt) ?? "-"}</dd>
                <dt className="col-5 fw-normal text-body-secondary">Rejestracja</dt><dd className="col-7">{v.registeredAt ? `${fmt(v.registeredAt)}${v.registeredBy ? ` (${v.registeredBy})` : ""}` : "-"}</dd>
                {v.enteredBy && <><dt className="col-5 fw-normal text-body-secondary">Osoba wprowadzająca</dt><dd className="col-7">{v.enteredBy} - pismo otrzymane poza aplikacją</dd></>}
                {v.closedAt && <><dt className="col-5 fw-normal text-body-secondary">Zakończono</dt><dd className="col-7">{fmt(v.closedAt)}</dd></>}
                {v.withdrawnAt && <><dt className="col-5 fw-normal text-body-secondary">Wycofano</dt><dd className="col-7">{fmt(v.withdrawnAt)}</dd></>}
                {v.meeting && <><dt className="col-5 fw-normal text-body-secondary">Posiedzenie</dt><dd className="col-7"><Link href={`/meetings/${v.meeting.id}`}>nr {v.meeting.number}</Link></dd></>}
              </dl>
            </div>
          </div>
          <Addressees v={v} ro={ro} busy={busy} call={call} />
          {!ro && <Publication v={v} call={call} busy={busy} />}
        </div>

        <div className="col-12 col-xxl-8 d-flex flex-column gap-3">
          <div className="card">
            <CardHeader title={`Korespondencja (${v.letters.length})`} />
            <ol className="list-group list-group-flush">
              {v.letters.map((l) => <LetterItem key={l.id} v={v} l={l} ro={ro} reload={load} />)}
            </ol>
          </div>
          {!ro && v.status !== "DRAFT" && !v.withdrawnAt && <NewLetter v={v} reload={load} />}
        </div>
      </div>
    </PageContainer>
  );
}

function RegisterButton({ busy, onRegister }: { busy: boolean; onRegister: (extra: Record<string, unknown>) => void }) {
  const [manual, setManual] = useState(false);
  const [seq, setSeq] = useState("");
  const [period, setPeriod] = useState("");
  if (!manual) return (
    <>
      <button className="btn btn-primary" disabled={busy} onClick={() => onRegister({})}>Zarejestruj (kolejny numer)</button>
      <button className="btn btn-outline-secondary" onClick={() => setManual(true)}>Numer z istniejącego rejestru…</button>
    </>
  );
  return (
    <div className="d-flex flex-wrap gap-2 align-items-end border rounded p-2">
      <div><label className="form-label small mb-0" htmlFor="rg-seq">Numer</label><input id="rg-seq" type="number" min={1} className="form-control form-control-sm" style={{ width: 100 }} value={seq} onChange={(e) => setSeq(e.target.value)} /></div>
      <div><label className="form-label small mb-0" htmlFor="rg-per">Rok / kadencja</label><input id="rg-per" className="form-control form-control-sm" style={{ width: 110 }} value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
      <button className="btn btn-sm btn-primary" disabled={busy || !seq || !period} onClick={() => onRegister({ manualSeq: Number(seq), manualPeriod: period })}>Zarejestruj z numerem</button>
      <button className="btn btn-sm btn-link" onClick={() => setManual(false)}>Anuluj</button>
    </div>
  );
}

function Addressees({ v, ro, busy, call }: { v: InquiryView; ro: boolean; busy: boolean; call: (url: string, init: RequestInit, ok: string) => Promise<boolean> }) {
  const [edit, setEdit] = useState<Record<string, { forwardedAt: string; note: string; due: string; responder: string }>>({});
  const [add, setAdd] = useState({ name: "", institution: "" });
  const [responders, setResponders] = useState<{ id: string; firstName: string; lastName: string; functionTitle: string | null; active: boolean }[]>([]);
  useEffect(() => { fetch("/api/inquiries/responders", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then(setResponders).catch(() => {}); }, []);
  const reset = (aid: string) => setEdit((x) => { const n = { ...x }; delete n[aid]; return n; });
  return (
    <div className="card">
      <CardHeader title="Adresaci, przekazania i terminy" />
      <ul className="list-group list-group-flush">
        {v.addressees.map((a) => {
          const e = edit[a.id] ?? { forwardedAt: dateInput(a.forwardedAt), note: a.forwardNote ?? "", due: dateInput(a.dueDate), responder: a.responderUserId ?? "" };
          const set = (p: Partial<typeof e>) => setEdit((x) => ({ ...x, [a.id]: { ...e, ...p } }));
          return (
            <li key={a.id} className="list-group-item small">
              <div className="fw-medium">{a.name}{a.institution ? `, ${a.institution}` : ""}</div>
              <div className="mb-1">
                {a.forwardedAt ? `Przekazano ${fmt(a.forwardedAt)}` : "Nie przekazano"}{a.dueDate ? ` - termin ${fmt(a.dueDate)}` : a.forwardedAt ? " - termin nieustalony" : ""}
                {a.answered ? <span className="badge text-bg-success ms-1">odpowiedź</span> : a.forwardedAt ? <span className="badge text-bg-light border ms-1">oczekiwanie</span> : null}
                {a.overdue && <span className="badge text-bg-danger ms-1">po terminie</span>}
              </div>
              {!ro && v.registeredAt && (
                <div className="row g-1 align-items-end">
                  <div className="col-6"><label className="form-label mb-0" htmlFor={`fw-${a.id}`}>Data przekazania</label><input id={`fw-${a.id}`} type="date" className="form-control form-control-sm" value={e.forwardedAt} onChange={(x) => set({ forwardedAt: x.target.value })} /></div>
                  <div className="col-6"><label className="form-label mb-0" htmlFor={`due-${a.id}`}>Termin odpowiedzi</label><input id={`due-${a.id}`} type="date" className="form-control form-control-sm" value={e.due} onChange={(x) => set({ due: x.target.value })} /></div>
                  {responders.length > 0 && (
                    <div className="col-12"><label className="form-label mb-0" htmlFor={`rs-${a.id}`}>Konto odpowiadającego</label>
                      <select id={`rs-${a.id}`} className="form-select form-select-sm" value={e.responder} onChange={(x) => set({ responder: x.target.value })}>
                        <option value="">Brak (odpowiedź wpisuje biuro)</option>
                        {responders.filter((r) => r.active || r.id === e.responder).map((r) => <option key={r.id} value={r.id}>{r.lastName} {r.firstName}{r.functionTitle ? ` - ${r.functionTitle}` : ""}</option>)}
                      </select></div>
                  )}
                  <div className="col-12"><label className="visually-hidden" htmlFor={`nt-${a.id}`}>Uwaga do przekazania</label><input id={`nt-${a.id}`} className="form-control form-control-sm" placeholder="Uwaga wewnętrzna (np. sposób przekazania)" value={e.note} onChange={(x) => set({ note: x.target.value })} /></div>
                  <div className="col-12 d-flex flex-wrap gap-1 mt-1">
                    <button className="btn btn-sm btn-outline-primary" disabled={busy} onClick={async () => { if (await call(`/api/inquiries/${v.id}/addressees/${a.id}`, json("PATCH", { forwardedAt: toIso(e.forwardedAt), forwardNote: e.note, dueDate: e.due || null, responderUserId: e.responder || null }), "Zapisano przekazanie.")) reset(a.id); }}>Zapisz</button>
                    <button className="btn btn-sm btn-outline-secondary" disabled={busy || !e.forwardedAt} title="Termin z reguły jednostki (Ustawienia); bez reguły - nieustalony" onClick={async () => { if (await call(`/api/inquiries/${v.id}/addressees/${a.id}`, json("PATCH", { forwardedAt: toIso(e.forwardedAt), forwardNote: e.note, dueDate: "rule", responderUserId: e.responder || null }), "Zapisano przekazanie z terminem według reguły.")) reset(a.id); }}>Zapisz z terminem z reguły</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!ro && (
        <div className="card-body border-top d-flex gap-1">
          <label className="visually-hidden" htmlFor="ad-name">Nowy adresat</label>
          <input id="ad-name" className="form-control form-control-sm" placeholder="Nowy adresat" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <label className="visually-hidden" htmlFor="ad-inst">Instytucja</label>
          <input id="ad-inst" className="form-control form-control-sm" placeholder="Instytucja" value={add.institution} onChange={(e) => setAdd({ ...add, institution: e.target.value })} />
          <button className="btn btn-sm btn-outline-secondary text-nowrap" disabled={busy || !add.name.trim()} onClick={async () => { if (await call(`/api/inquiries/${v.id}/addressees`, json("POST", add), "Dodano adresata.")) setAdd({ name: "", institution: "" }); }}>Dodaj</button>
        </div>
      )}
      <div className="card-body pt-0 small text-body-secondary">Zapis przekazania w aplikacji nie potwierdza wysyłki ani doręczenia - to jawny wpis czynności wykonanej poza aplikacją.</div>
    </div>
  );
}

function Publication({ v, call, busy }: { v: InquiryView; call: (url: string, init: RequestInit, ok: string) => Promise<boolean>; busy: boolean }) {
  const [title, setTitle] = useState(v.publicTitle ?? "");
  return (
    <div className="card">
      <CardHeader title="Publikacja w rejestrze publicznym" />
      <div className="card-body small d-flex flex-column gap-2">
        <div>Sprawa: {v.published ? <span className="badge text-bg-success">opublikowana {fmt(v.publishedAt)}</span> : <span className="badge text-bg-light border">nieopublikowana</span>}</div>
        <div><label className="form-label mb-0" htmlFor="pub-title">Tytuł publiczny (opcjonalnie, np. bez danych osobowych)</label><input id="pub-title" className="form-control form-control-sm" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="d-flex flex-wrap gap-1">
          <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => call(`/api/inquiries/${v.id}/publication`, json("PATCH", { publicTitle: title }), "Zapisano tytuł publiczny.")}>Zapisz tytuł</button>
          {v.published
            ? <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => call(`/api/inquiries/${v.id}/publication`, json("PATCH", { published: false }), "Wycofano z publikacji.")}>Wycofaj z publikacji</button>
            : <button className="btn btn-sm btn-primary" disabled={busy || !v.registeredAt} onClick={() => call(`/api/inquiries/${v.id}/publication`, json("PATCH", { published: true, publicTitle: title }), "Opublikowano sprawę.")}>Opublikuj sprawę</button>}
        </div>
        <div className="text-body-secondary">Pisma publikuje się osobno, przy każdym piśmie - w wersji publicznej (treść lub plik zanonimizowany). Wewnętrzny oryginał nie jest udostępniany.</div>
      </div>
    </div>
  );
}

function LetterItem({ v, l, ro, reload }: { v: InquiryView; l: Letter; ro: boolean; reload: () => Promise<void> }) {
  const [pub, setPub] = useState(false);
  const [publicBody, setPublicBody] = useState(l.publicBody ?? "");
  const addressee = v.addressees.find((a) => a.id === l.addresseeId);
  const refIdx = l.refLetterId ? (v.letters.find((x) => x.id === l.refLetterId)?.seq ?? 0) : 0;

  async function upload(files: FileList | null, isPublic: boolean) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      if (isPublic) fd.append("public", "1");
      const r = await fetch(`/api/inquiries/letters/${l.id}/attachments`, { method: "POST", body: fd });
      if (!r.ok) await notifyFailure(r);
    }
    await reload();
  }
  async function removeAtt(a: { id: string; fileName: string }) {
    if (!(await ask({ title: "Usunąć plik?", message: a.fileName, confirmLabel: "Usuń", danger: true }))) return;
    const r = await fetch(`/api/inquiries/attachments/${a.id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    await reload();
  }
  async function savePublic(published?: boolean) {
    const r = await fetch(`/api/inquiries/letters/${l.id}`, json("PATCH", { publicBody, ...(published !== undefined ? { published } : {}) }));
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success(published === true ? "Opublikowano pismo." : published === false ? "Wycofano pismo z publikacji." : "Zapisano wersję publiczną.");
    await reload();
  }

  return (
    <li className="list-group-item">
      <div className="d-flex flex-wrap justify-content-between gap-2">
        <div>
          <span className="fw-semibold">{l.seq ? `${l.seq}. ` : ""}{LETTER_KIND_LABEL[l.kind]}</span>
          {addressee && <span> - {l.kind === "ANSWER" ? "od" : "do"}: {addressee.name}</span>}
          {l.state === "DRAFT" && <span className="badge text-bg-warning ms-1">projekt</span>}
          {l.published && <span className="badge text-bg-success ms-1">opublikowane</span>}
          <div className="small text-body-secondary">
            {[l.authorName && `Autor: ${l.authorName}`, l.letterDate && `pismo z ${fmt(l.letterDate)}`, l.receivedAt && `wpływ ${fmt(l.receivedAt)}`, refIdx > 0 && `w odniesieniu do pisma ${refIdx}`, l.createdBy && `wprowadzone przez: ${l.createdBy}`].filter(Boolean).join(" - ")}
          </div>
        </div>
        <a className="btn btn-sm btn-outline-secondary align-self-start" href={`/api/inquiries/letters/${l.id}/pdf`}><IconDownload size={14} /> PDF pisma</a>
      </div>
      {l.title && l.kind !== "SUBMISSION" && <div className="fw-medium mt-1">{l.title}</div>}
      {l.body.trim() ? <div className="mt-2" style={{ maxWidth: "80ch" }}><RichTextView text={l.body} /></div> : <div className="small fst-italic text-body-secondary mt-1">Treść wyłącznie w pliku.</div>}
      {l.attachments.length > 0 && (
        <ul className="list-unstyled small mb-1">
          {l.attachments.map((a) => (
            <li key={a.id} className="d-flex align-items-center gap-2">
              <a href={`/api/inquiries/attachments/${a.id}`}>{a.fileName}</a>
              {a.isPublicVersion && <span className="badge text-bg-info">wersja publiczna</span>}
              {!ro && <button className="btn btn-sm btn-link text-danger p-0" aria-label={`Usuń ${a.fileName}`} onClick={() => removeAtt(a)}><IconTrash size={13} /></button>}
            </li>
          ))}
        </ul>
      )}
      {!ro && l.state === "FINAL" && (
        <div className="d-flex flex-wrap gap-2 mt-1">
          <label className="btn btn-sm btn-outline-secondary mb-0">Dodaj załącznik<input type="file" className="visually-hidden" multiple accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(e) => upload(e.target.files, false)} /></label>
          <button className="btn btn-sm btn-outline-secondary" aria-expanded={pub} onClick={() => setPub((x) => !x)}>Wersja publiczna</button>
        </div>
      )}
      {pub && (
        <div className="border rounded p-2 mt-2">
          <RichEditor id={`pb-${l.id}`} label="Treść publiczna (bez danych prywatnych i uwag wewnętrznych)" value={publicBody} onChange={setPublicBody} minHeight={160} />
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setPublicBody(l.body)}>Skopiuj treść oryginału do edycji</button>
            <label className="btn btn-sm btn-outline-secondary mb-0">Dodaj plik wersji publicznej<input type="file" className="visually-hidden" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" onChange={(e) => upload(e.target.files, true)} /></label>
            <button className="btn btn-sm btn-outline-primary" onClick={() => savePublic()}>Zapisz</button>
            {l.published ? <button className="btn btn-sm btn-outline-danger" onClick={() => savePublic(false)}>Wycofaj z publikacji</button> : <button className="btn btn-sm btn-primary" onClick={() => savePublic(true)}>Opublikuj pismo</button>}
          </div>
        </div>
      )}
    </li>
  );
}

function NewLetter({ v, reload }: { v: InquiryView; reload: () => Promise<void> }) {
  const empty = { kind: "ANSWER", addresseeId: "", refLetterId: "", authorName: "", title: "", body: "", letterDate: "", receivedAt: new Date().toISOString().slice(0, 10) };
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  async function save() {
    setBusy(true);
    const r = await fetch(`/api/inquiries/${v.id}/letters`, json("POST", {
      kind: f.kind, addresseeId: f.addresseeId || null, refLetterId: f.refLetterId || null, authorName: f.authorName || null, title: f.title || null, body: f.body,
      letterDate: toIso(f.letterDate), receivedAt: toIso(f.receivedAt),
    }));
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Dodano pismo. Pliki dołączysz przy piśmie na osi korespondencji.");
    setF(empty);
    setOpen(false);
    await reload();
  }
  if (!open) return <div><button className="btn btn-outline-primary" onClick={() => setOpen(true)}>Dodaj pismo (odpowiedź, uzupełnienie, ponowienie…)</button></div>;
  return (
    <div className="card">
      <CardHeader title="Nowe pismo w sprawie" />
      <div className="card-body row g-2">
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="nl-kind">Rodzaj</label><select id="nl-kind" className="form-select" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>{["ANSWER", "SUPPLEMENT", "FOLLOWUP", "CORRECTION", "OTHER"].map((k) => <option key={k} value={k}>{LETTER_KIND_LABEL[k]}</option>)}</select></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="nl-ad">{f.kind === "ANSWER" ? "Odpowiedź od adresata" : "Adresat (opcjonalnie)"}</label><select id="nl-ad" className="form-select" value={f.addresseeId} onChange={(e) => set({ addresseeId: e.target.value })}><option value="">-</option>{v.addressees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="nl-ref">W odniesieniu do pisma</label><select id="nl-ref" className="form-select" value={f.refLetterId} onChange={(e) => set({ refLetterId: e.target.value })}><option value="">-</option>{v.letters.filter((l) => l.seq).map((l) => <option key={l.id} value={l.id}>{l.seq}. {LETTER_KIND_LABEL[l.kind]}</option>)}</select></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="nl-auth">Autor / podmiot</label><input id="nl-auth" className="form-control" placeholder={f.kind === "ANSWER" ? "domyślnie adresat" : ""} value={f.authorName} onChange={(e) => set({ authorName: e.target.value })} /></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="nl-ld">Data pisma</label><input id="nl-ld" type="date" className="form-control" value={f.letterDate} onChange={(e) => set({ letterDate: e.target.value })} /></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="nl-rd">Data wpływu</label><input id="nl-rd" type="date" className="form-control" value={f.receivedAt} onChange={(e) => set({ receivedAt: e.target.value })} /></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="nl-title">Tytuł / znak pisma (opcjonalnie)</label><input id="nl-title" className="form-control" value={f.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <div className="col-12"><RichEditor id="nl-body" label="Treść (pusta, gdy pismo jest tylko plikiem)" value={f.body} onChange={(b) => set({ body: b })} minHeight={160} /></div>
        <div className="col-12 d-flex gap-2"><button className="btn btn-primary" disabled={busy} onClick={save}>Dodaj pismo</button><button className="btn btn-outline-secondary" onClick={() => setOpen(false)}>Anuluj</button></div>
      </div>
    </div>
  );
}
