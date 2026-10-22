"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL, LETTER_KIND_LABEL } from "@/lib/inquiryLabels";
import type { InquiryView } from "@/lib/inquiryDetail";
import { RichTextView } from "@/components/RichTextView";
import { FileList } from "@/components/participant/FileList";
import { InquiryDraftForm } from "./InquiryDraftForm";
import { RichEditor } from "@/components/RichEditor";
import { IconArrowLeft, IconDownload } from "@/components/ui/Icon";

type Letter = InquiryView["letters"][number];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" }) : null);
const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * Karta sprawy radnego: szkic (edycja, złożenie), potwierdzenie współautorstwa, oś pism
 * z odpowiedziami, własne pisma (uzupełnienie, ponowienie pytania, korekta) i PDF każdego pisma.
 * Czynności wymagają prawa składania; odczyt i PDF - tylko udziału w sprawie.
 */
export function InquiryCaseParticipant({ id }: { id: string }) {
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

  const back = <Link href="/session/interpelacje" className="pt-back-link"><IconArrowLeft size={14} /> Moje sprawy</Link>;
  if (state === "loading") return <div className="pt-page">{back}<section className="pt-panel"><div className="pt-empty">Wczytywanie…</div></section></div>;
  if (state === "missing" || !v) return <div className="pt-page">{back}<section className="pt-panel"><div className="pt-empty">Ta sprawa nie jest dostępna.</div></section></div>;

  const me = v.viewer.myAuthor;
  const isDraft = v.status === "DRAFT";
  const sub = v.letters.find((l) => l.kind === "SUBMISSION");
  const canAct = v.viewer.canSubmit;

  return (
    <div className="pt-page pt-info-page">
      {back}
      <header className="pt-page-header">
        <div className="pt-kicker">{INQUIRY_KIND_LABEL[v.kind]}{v.number ? ` nr ${v.number}` : ""}</div>
        <h1 className="pt-h1">{v.title}</h1>
        <div className="pt-btn-group" style={{ marginTop: 6 }}>
          <span className="pt-badge">{INQUIRY_STATUS_LABEL[v.status]}</span>
          <a className="pt-btn pt-btn-sm" href={`/api/inquiries/${id}/pdf`}><IconDownload size={15} /> {isDraft ? "PDF projektu" : "PDF korespondencji"}</a>
          {!isDraft && <a className="pt-btn pt-btn-sm" href={`/api/inquiries/${id}/docx`}><IconDownload size={15} /> DOCX</a>}
        </div>
      </header>

      {me?.confirmation === "PENDING" && (
        <section className="pt-panel" style={{ marginBottom: 12 }}><div className="pt-panel-body">
          <p style={{ marginTop: 0 }}>Zaproszono Cię do współautorstwa. Do czasu potwierdzenia nie widniejesz w sprawie jako współautor.</p>
          {canAct ? (
            <div className="pt-btn-group">
              <button className="pt-btn pt-btn-primary" disabled={busy} onClick={() => call(`/api/inquiries/${id}/actions`, json("POST", { action: "confirm-coauthor" }), "Potwierdzono.")}>Potwierdzam współautorstwo</button>
              <button className="pt-btn" disabled={busy} onClick={async () => { if (await ask({ title: "Odrzucić zaproszenie?", message: "Nie będziesz współautorem tej sprawy.", confirmLabel: "Odrzuć" })) { if (await call(`/api/inquiries/${id}/actions`, json("POST", { action: "decline-coauthor" }), "Odrzucono.")) router.push("/session/interpelacje"); } }}>Odrzuć</button>
            </div>
          ) : <p className="pt-muted" style={{ marginBottom: 0 }}>Potwierdzenie wymaga nadanego prawa składania interpelacji i zapytań.</p>}
        </div></section>
      )}

      {isDraft && me?.isPrimary && sub ? (
        canAct ? (
          <>
            <InquiryDraftForm existing={{ id, value: { kind: v.kind, title: v.title, body: sub.body, addressees: v.addressees.map((a) => ({ name: a.name, institution: a.institution ?? "" })), coAuthorUserIds: v.authors.filter((a) => !a.isPrimary && a.userId).map((a) => a.userId!), orgUnitId: v.orgUnitId ?? "" } }} />
            <div className="pt-btn-group" style={{ marginTop: 8 }}>
              <button className="pt-btn" disabled={busy} onClick={async () => { if (await ask({ title: "Usunąć szkic?", message: "Szkic nie został złożony - zostanie usunięty.", confirmLabel: "Usuń", danger: true })) { const r = await fetch(`/api/inquiries/${id}`, { method: "DELETE" }); if (!r.ok) { await notifyFailure(r); return; } notify.success("Usunięto szkic."); router.push("/session/interpelacje"); } }}>Usuń szkic</button>
            </div>
          </>
        ) : <section className="pt-panel"><div className="pt-panel-body"><p className="pt-muted">Szkic - edycja i złożenie wymagają prawa składania.</p><RichTextView text={sub.body} className="pt-info-body" /></div></section>
      ) : (
        <>
          <section className="pt-panel"><div className="pt-panel-body">
            <dl className="pt-info-meta">
              <div><dt>Autorzy</dt><dd>{v.authors.filter((a) => a.confirmation !== "PENDING").map((a) => a.name).join(", ")}{v.authors.some((a) => a.confirmation === "PENDING") ? ` (oczekuje na potwierdzenie: ${v.authors.filter((a) => a.confirmation === "PENDING").map((a) => a.name).join(", ")})` : ""}</dd></div>
              {v.submittedAt && <div><dt>Złożono</dt><dd>{fmt(v.submittedAt)}</dd></div>}
              {v.registeredAt && <div><dt>Zarejestrowano</dt><dd>{fmt(v.registeredAt)}{v.number ? `, nr ${v.number}` : ""}</dd></div>}
              {v.addressees.map((a) => (
                <div key={a.id}><dt>Adresat</dt><dd>{a.name}{a.institution ? `, ${a.institution}` : ""} - {a.answered ? "odpowiedź otrzymana" : a.forwardedAt ? `przekazano ${fmt(a.forwardedAt)}${a.dueDate ? `, termin ${fmt(a.dueDate)}` : ""}` : "nie przekazano"}</dd></div>
              ))}
              {v.withdrawnAt && <div><dt>Wycofano</dt><dd>{fmt(v.withdrawnAt)}</dd></div>}
              {v.closedAt && <div><dt>Zakończono</dt><dd>{fmt(v.closedAt)}</dd></div>}
            </dl>
          </div></section>

          <h2 className="pt-h2">Korespondencja ({v.letters.length})</h2>
          <ol className="pt-inq-timeline">
            {v.letters.map((l) => <LetterCard key={l.id} v={v} l={l} canAct={canAct} reload={load} />)}
          </ol>

          {canAct && me && me.confirmation !== "PENDING" && !v.withdrawnAt && <NewAuthorLetter v={v} reload={load} />}
          {canAct && me?.isPrimary && !v.withdrawnAt && !v.closedAt && (
            <div className="pt-btn-group" style={{ marginTop: 16 }}>
              <button className="pt-btn" disabled={busy} onClick={async () => { if (await ask({ title: "Wycofać sprawę?", message: "Wycofanie zostanie odnotowane w sprawie i przekazane do biura.", confirmLabel: "Wycofaj", danger: true })) void call(`/api/inquiries/${id}/actions`, json("POST", { action: "withdraw" }), "Wycofano."); }}>Wycofaj sprawę</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LetterCard({ v, l, canAct, reload }: { v: InquiryView; l: Letter; canAct: boolean; reload: () => Promise<void> }) {
  const idx = l.seq ?? "projekt";
  const [body, setBody] = useState(l.body);
  const addressee = v.addressees.find((a) => a.id === l.addresseeId);
  const refIdx = l.refLetterId ? (v.letters.find((x) => x.id === l.refLetterId)?.seq ?? 0) : 0;
  const editable = l.mine && l.state === "DRAFT" && l.kind !== "SUBMISSION" && canAct;

  async function save(finalize: boolean) {
    const r = await fetch(`/api/inquiries/letters/${l.id}`, json("PATCH", { body }));
    if (!r.ok) { await notifyFailure(r); return; }
    if (finalize) {
      if (!(await ask({ title: "Złożyć pismo?", message: "Złożenie utrwala treść i datę.", confirmLabel: "Złóż" }))) { await reload(); return; }
      const f = await fetch(`/api/inquiries/letters/${l.id}/finalize`, { method: "POST" });
      if (!f.ok) { await notifyFailure(f); return; }
      notify.success("Złożono pismo.");
    } else notify.success("Zapisano szkic pisma.");
    await reload();
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/inquiries/letters/${l.id}/attachments`, { method: "POST", body: fd });
      if (!r.ok) await notifyFailure(r);
    }
    await reload();
  }
  async function remove() {
    if (!(await ask({ title: "Usunąć szkic pisma?", message: "Szkic nie został złożony.", confirmLabel: "Usuń", danger: true }))) return;
    const r = await fetch(`/api/inquiries/letters/${l.id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    await reload();
  }

  return (
    <li className="pt-panel pt-inq-letter">
      <div className="pt-panel-body">
        <div className="pt-label">{l.seq ? `Pismo ${l.seq}` : "Projekt pisma"}{l.receivedAt || l.letterDate ? ` - ${fmt(l.receivedAt ?? l.letterDate)}` : ""}</div>
        <h3 className="pt-inq-letter-title">
          {LETTER_KIND_LABEL[l.kind]}{addressee ? ` - ${l.kind === "ANSWER" ? "od" : "do"}: ${addressee.name}` : ""}
          {l.state === "DRAFT" && <span className="pt-badge pt-badge-warn" style={{ marginLeft: 8 }}>Projekt</span>}
        </h3>
        <div className="pt-label">{[l.authorName && `Autor: ${l.authorName}`, l.letterDate && `pismo z ${fmt(l.letterDate)}`, refIdx > 0 && `w odniesieniu do pisma ${refIdx}`].filter(Boolean).join(" - ")}</div>
        {editable ? (
          <>
            <div style={{ marginTop: 8 }}><RichEditor id={`lb-${l.id}`} label="Treść pisma" value={body} onChange={setBody} minHeight={180} variant="app" /></div>
            <div className="pt-btn-group">
              <button className="pt-btn pt-btn-sm" onClick={() => save(false)}>Zapisz szkic</button>
              <button className="pt-btn pt-btn-sm pt-btn-primary" onClick={() => save(true)}>Złóż</button>
              <label className="pt-btn pt-btn-sm">Dodaj załącznik<input type="file" className="sr-only" multiple accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(e) => upload(e.target.files)} /></label>
              <button className="pt-btn pt-btn-sm" onClick={remove}>Usuń szkic</button>
            </div>
          </>
        ) : l.body.trim() ? <RichTextView text={l.body} className="pt-info-body" /> : <p className="pt-muted">Treść pisma w załączonym pliku.</p>}
        <FileList files={l.attachments} label={`Załączniki pisma ${idx}`} href={(a) => `/api/inquiries/attachments/${a}`} />
        <div className="pt-btn-group" style={{ marginTop: 8 }}>
          <a className="pt-btn pt-btn-sm" href={`/api/inquiries/letters/${l.id}/pdf`}><IconDownload size={15} /> PDF pisma<span className="sr-only"> {idx}</span></a>
        </div>
      </div>
    </li>
  );
}

function NewAuthorLetter({ v, reload }: { v: InquiryView; reload: () => Promise<void> }) {
  const [open, setOpen] = useState<null | "SUPPLEMENT" | "FOLLOWUP" | "CORRECTION">(null);
  const [body, setBody] = useState("");
  const [addresseeId, setAddresseeId] = useState("");
  const [refLetterId, setRefLetterId] = useState("");
  const [busy, setBusy] = useState(false);
  const answers = v.letters.filter((l) => l.kind === "ANSWER");

  async function save(submit: boolean) {
    if (!body.trim()) { notify.warning("Uzupełnij treść pisma."); return; }
    if (submit && !(await ask({ title: "Złożyć pismo?", message: "Złożenie utrwala treść i datę.", confirmLabel: "Złóż" }))) return;
    setBusy(true);
    const r = await fetch(`/api/inquiries/${v.id}/letters`, json("POST", { kind: open, body, addresseeId: addresseeId || null, refLetterId: refLetterId || null, submit }));
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success(submit ? "Złożono pismo." : "Zapisano szkic pisma - możesz dodać załączniki i złożyć go później.");
    setOpen(null); setBody(""); setAddresseeId(""); setRefLetterId("");
    await reload();
  }

  if (!open) return (
    <div className="pt-btn-group" style={{ marginTop: 16 }}>
      <button className="pt-btn" onClick={() => setOpen("SUPPLEMENT")}>Uzupełnij</button>
      <button className="pt-btn" onClick={() => setOpen("FOLLOWUP")}>Ponów pytanie</button>
      <button className="pt-btn" onClick={() => setOpen("CORRECTION")}>Korekta</button>
    </div>
  );
  return (
    <section className="pt-panel" style={{ marginTop: 16 }}><div className="pt-panel-body pt-form">
      <h2 className="pt-h2" style={{ marginTop: 0 }}>{LETTER_KIND_LABEL[open]}</h2>
      {v.addressees.length > 1 && (
        <label className="pt-field"><span className="pt-label">Do adresata</span>
          <select className="pt-field-input" value={addresseeId} onChange={(e) => setAddresseeId(e.target.value)}><option value="">Wszyscy adresaci</option>{v.addressees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      )}
      {answers.length > 0 && (
        <label className="pt-field"><span className="pt-label">W odniesieniu do odpowiedzi</span>
          <select className="pt-field-input" value={refLetterId} onChange={(e) => { setRefLetterId(e.target.value); const a = answers.find((x) => x.id === e.target.value); if (a?.addresseeId) setAddresseeId(a.addresseeId); }}>
            <option value="">-</option>{answers.map((a) => <option key={a.id} value={a.id}>Pismo {a.seq}: {LETTER_KIND_LABEL[a.kind]}{a.authorName ? ` - ${a.authorName}` : ""}</option>)}
          </select></label>
      )}
      <RichEditor id="nal-body" label="Treść" value={body} onChange={setBody} minHeight={180} variant="app" />
      <div className="pt-btn-group">
        <button className="pt-btn" disabled={busy} onClick={() => save(false)}>Zapisz szkic</button>
        <button className="pt-btn pt-btn-primary" disabled={busy} onClick={() => save(true)}>Złóż</button>
        <button className="pt-btn" onClick={() => setOpen(null)}>Anuluj</button>
      </div>
    </div></section>
  );
}
