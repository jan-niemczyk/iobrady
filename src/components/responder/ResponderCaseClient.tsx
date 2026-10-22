"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { INQUIRY_KIND_LABEL, LETTER_KIND_LABEL } from "@/lib/inquiryLabels";
import type { ResponderCase } from "@/lib/responder";
import { RichTextView } from "@/components/RichTextView";
import { RichEditor } from "@/components/RichEditor";
import { IconArrowLeft, IconDownload, IconTrash } from "@/components/ui/Icon";

type View = ResponderCase & { enabled: boolean };
type Letter = View["letters"][number];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" }) : null);
const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Karta sprawy dla konta odpowiadającego: pisma do odczytu i odpowiedź przypisanego adresata. */
export function ResponderCaseClient({ id }: { id: string }) {
  const [v, setV] = useState<View | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const load = useCallback(async () => {
    const r = await fetch(`/api/responder/cases/${id}`, { cache: "no-store" });
    if (!r.ok) { setState("missing"); return; }
    setV(await r.json());
    setState("ok");
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const back = <Link href="/odpowiedzi" className="d-inline-flex align-items-center gap-1 small mb-2"><IconArrowLeft size={14} /> Sprawy do odpowiedzi</Link>;
  if (state !== "ok" || !v) return <div className="container-lg px-3 py-4" style={{ maxWidth: 960 }}>{back}<p className="text-body-secondary">{state === "loading" ? "Wczytywanie…" : "Ta sprawa nie jest dostępna."}</p></div>;

  const drafts = v.letters.filter((l) => l.state === "DRAFT");
  const finals = v.letters.filter((l) => l.state === "FINAL");
  const canAnswer = v.enabled && !v.withdrawn;

  return (
    <div className="container-lg px-3 py-4" style={{ maxWidth: 960 }}>
      {back}
      <div className="small text-body-secondary">{INQUIRY_KIND_LABEL[v.kind]}{v.number ? ` nr ${v.number}` : ""}</div>
      <h1 className="h4 mb-2" style={{ overflowWrap: "anywhere" }}>{v.title}</h1>
      <dl className="row small mb-3">
        <dt className="col-sm-3 fw-normal text-body-secondary">Autorzy</dt><dd className="col-sm-9 mb-1">{v.authors.map((a) => a.name).join(", ")}</dd>
        {v.addressees.map((a) => (
          <div key={a.id} className="d-contents" style={{ display: "contents" }}>
            <dt className="col-sm-3 fw-normal text-body-secondary">Adresat</dt>
            <dd className="col-sm-9 mb-1">{[a.name, a.institution].filter(Boolean).join(", ")} - przekazano {fmt(a.forwardedAt)}{a.dueDate ? `, termin odpowiedzi ${fmt(a.dueDate)}` : ""}{a.answered ? " - odpowiedź złożona" : ""}</dd>
          </div>
        ))}
      </dl>
      {v.withdrawn && <div className="alert alert-warning">Sprawa została wycofana.</div>}
      <a className="btn btn-sm btn-outline-secondary mb-3" href={`/api/responder/letters/sprawa-${v.id}/pdf`}><IconDownload size={14} /> PDF korespondencji</a>

      <h2 className="h5">Korespondencja</h2>
      <ol className="list-unstyled d-flex flex-column gap-3 mb-4">
        {finals.map((l) => <LetterView key={l.id} v={v} l={l} />)}
      </ol>

      {drafts.map((l) => <DraftAnswer key={l.id} l={l} canAnswer={canAnswer} reload={load} />)}
      {canAnswer && <NewAnswer v={v} reload={load} />}
    </div>
  );
}

function LetterView({ v, l }: { v: View; l: Letter }) {
  const ad = v.addressees.find((a) => a.id === l.addresseeId);
  const ref = l.refLetterId ? v.letters.find((x) => x.id === l.refLetterId) : null;
  return (
    <li className="card">
      <div className="card-body">
        <div className="small text-body-secondary">Pismo {l.seq} - {fmt(l.receivedAt ?? l.letterDate)}</div>
        <h3 className="h6 mb-1">{LETTER_KIND_LABEL[l.kind]}{ad ? ` - ${l.kind === "ANSWER" ? "od" : "do"}: ${ad.name}` : ""}</h3>
        {(l.authorName || ref) && <div className="small mb-2">{[l.authorName && `Autor: ${l.authorName}`, ref && `w odniesieniu do pisma ${ref.seq}`].filter(Boolean).join(" - ")}</div>}
        {l.body.trim() ? <div style={{ maxWidth: "75ch" }}><RichTextView text={l.body} /></div> : <p className="small fst-italic mb-1">Treść w załączonym pliku.</p>}
        <div className="d-flex flex-wrap gap-2 mt-2">
          {l.attachments.map((a) => <a key={a.id} className="btn btn-sm btn-outline-secondary" href={`/api/responder/attachments/${a.id}`}><IconDownload size={14} /> {a.fileName}</a>)}
          <a className="btn btn-sm btn-link" href={`/api/responder/letters/${l.id}/pdf`}>PDF pisma</a>
        </div>
      </div>
    </li>
  );
}

function NewAnswer({ v, reload }: { v: View; reload: () => Promise<void> }) {
  const [addresseeId, setAddresseeId] = useState(v.addressees[0]?.id ?? "");
  const [refLetterId, setRefLetterId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = v.letters.filter((l) => l.state === "FINAL" && l.kind !== "ANSWER" && l.kind !== "SUBMISSION");
  async function save(submit: boolean) {
    if (submit && !(await ask({ title: "Złożyć odpowiedź?", message: "Po złożeniu odpowiedzi nie można zmienić.", confirmLabel: "Złóż" }))) return;
    setBusy(true);
    const r = await fetch(`/api/responder/cases/${v.id}/answers`, json("POST", { addresseeId, refLetterId: refLetterId || null, body, submit }));
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success(submit ? "Złożono odpowiedź." : "Zapisano szkic. Możesz dołączyć pliki.");
    setBody("");
    await reload();
  }
  return (
    <section className="card">
      <div className="card-header fw-semibold">Nowa odpowiedź</div>
      <div className="card-body d-flex flex-column gap-2">
        <div className="row g-2">
          {v.addressees.length > 1 && (
            <div className="col-12 col-md-6"><label className="form-label" htmlFor="ra-ad">W imieniu</label>
              <select id="ra-ad" className="form-select" value={addresseeId} onChange={(e) => setAddresseeId(e.target.value)}>{v.addressees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          )}
          {refs.length > 0 && (
            <div className="col-12 col-md-6"><label className="form-label" htmlFor="ra-ref">Dotyczy pisma</label>
              <select id="ra-ref" className="form-select" value={refLetterId} onChange={(e) => setRefLetterId(e.target.value)}>
                <option value="">Pismo wnoszące</option>{refs.map((l) => <option key={l.id} value={l.id}>Pismo {l.seq}: {LETTER_KIND_LABEL[l.kind]}</option>)}
              </select></div>
          )}
        </div>
        <RichEditor id="ra-body" label="Treść odpowiedzi" value={body} onChange={setBody} minHeight={220} />
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-outline-primary" disabled={busy} onClick={() => save(false)}>Zapisz szkic</button>
          <button className="btn btn-primary" disabled={busy || !body.trim()} onClick={() => save(true)}>Złóż odpowiedź</button>
        </div>
      </div>
    </section>
  );
}

function DraftAnswer({ l, canAnswer, reload }: { l: Letter; canAnswer: boolean; reload: () => Promise<void> }) {
  const [body, setBody] = useState(l.body);
  const [busy, setBusy] = useState(false);
  async function save(finalize: boolean) {
    setBusy(true);
    const r = await fetch(`/api/responder/letters/${l.id}`, json("PATCH", { body }));
    if (!r.ok) { setBusy(false); await notifyFailure(r); return; }
    if (finalize) {
      if (!(await ask({ title: "Złożyć odpowiedź?", message: "Po złożeniu odpowiedzi nie można zmienić.", confirmLabel: "Złóż" }))) { setBusy(false); return; }
      const f = await fetch(`/api/responder/letters/${l.id}/finalize`, { method: "POST" });
      if (!f.ok) { setBusy(false); await notifyFailure(f); return; }
      notify.success("Złożono odpowiedź.");
    } else notify.success("Zapisano szkic.");
    setBusy(false);
    await reload();
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/responder/letters/${l.id}/attachments`, { method: "POST", body: fd });
      if (!r.ok) await notifyFailure(r);
    }
    await reload();
  }
  async function removeFile(a: { id: string; fileName: string }) {
    if (!(await ask({ title: "Usunąć plik?", message: a.fileName, confirmLabel: "Usuń", danger: true }))) return;
    const r = await fetch(`/api/responder/attachments/${a.id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    await reload();
  }
  async function remove() {
    if (!(await ask({ title: "Usunąć szkic odpowiedzi?", message: "Szkic i jego pliki zostaną usunięte.", confirmLabel: "Usuń", danger: true }))) return;
    const r = await fetch(`/api/responder/letters/${l.id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    await reload();
  }
  return (
    <section className="card border-warning mb-3">
      <div className="card-header fw-semibold d-flex justify-content-between align-items-center">Szkic odpowiedzi
        {canAnswer && <button className="btn btn-sm btn-link text-danger p-0" onClick={remove}>Usuń szkic</button>}
      </div>
      <div className="card-body d-flex flex-column gap-2">
        <RichEditor id={`rd-${l.id}`} label="Treść odpowiedzi" value={body} onChange={setBody} minHeight={200} />
        {l.attachments.length > 0 && (
          <ul className="list-unstyled small mb-0">
            {l.attachments.map((a) => <li key={a.id} className="d-flex align-items-center gap-2"><a href={`/api/responder/attachments/${a.id}`}>{a.fileName}</a><button className="btn btn-sm btn-link text-danger p-0" aria-label={`Usuń ${a.fileName}`} onClick={() => removeFile(a)}><IconTrash size={13} /></button></li>)}
          </ul>
        )}
        {canAnswer && (
          <div className="d-flex flex-wrap gap-2">
            <label className="btn btn-outline-secondary mb-0">Dołącz plik<input type="file" className="visually-hidden" multiple accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(e) => upload(e.target.files)} /></label>
            <button className="btn btn-outline-primary" disabled={busy} onClick={() => save(false)}>Zapisz szkic</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>Złóż odpowiedź</button>
          </div>
        )}
      </div>
    </section>
  );
}
