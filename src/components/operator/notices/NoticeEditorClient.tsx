"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CardHeader, PageContainer, PageHeader } from "../ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { fillPlaceholders, plDate, type NoticeAgendaItem, type NoticeContent, type NoticeRecipient } from "@/lib/noticeText";
import { NoticeContentEditor } from "./NoticeContentEditor";
import { NoticeAgendaEditor } from "./NoticeAgendaEditor";
import { NoticeRecipientsEditor } from "./NoticeRecipientsEditor";
import { NoticePreview } from "./NoticePreview";
import { IconArrowLeft, IconDownload } from "@/components/ui/Icon";

interface Loaded {
  id: string; name: string; templateName: string | null; templateVersion: number | null; agendaEdited: boolean;
  meeting: { id: string; number: string; name: string };
  content: NoticeContent; agenda: NoticeAgendaItem[]; recipients: NoticeRecipient[];
  meetingAgenda: NoticeAgendaItem[]; meetingAgendaChanged: boolean;
  diff: { onlyInMeeting: NoticeAgendaItem[]; onlyInNotice: NoticeAgendaItem[]; same: boolean };
  values: Record<string, string>;
}

/**
 * Edytor zawiadomienia: dane dokumentu, wstęp z podstawą prawną, kopia porządku obrad (edytowalna,
 * z porównaniem do porządku posiedzenia), treść po porządku i podpis, stopka strony, adresaci,
 * podgląd układu oraz generowanie DOCX (ogólny lub imienne w ZIP). Zapis jako wersja robocza.
 */
export function NoticeEditorClient({ meetingId, noticeId, logoUrl }: { meetingId: string; noticeId: string; logoUrl: string | null }) {
  const [d, setD] = useState<Loaded | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState<NoticeContent | null>(null);
  const [agenda, setAgenda] = useState<NoticeAgendaItem[]>([]);
  const [recipients, setRecipients] = useState<NoticeRecipient[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"content" | "agenda" | "recipients">("content");
  const [previewFor, setPreviewFor] = useState<string>("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/notices/${noticeId}`, { cache: "no-store" });
    if (!r.ok) { await notifyFailure(r); return; }
    const x: Loaded = await r.json();
    setD(x); setName(x.name); setContent(x.content); setAgenda(x.agenda); setRecipients(x.recipients); setDirty(false);
  }, [noticeId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const values = useMemo(() => {
    if (!d || !content) return {};
    const letter = /^\d{4}-\d{2}-\d{2}$/.test(content.letterDate) ? plDate(new Date(`${content.letterDate}T12:00:00Z`)) : "";
    // Zapis numeru według bieżącego wyboru (bez zapisu i odświeżenia); gdy numeru nie da się przeliczyć - jak w posiedzeniu.
    const v = d.values;
    const numer = content.meetingNumberFormat === "roman" && v.numer_posiedzenia_rzymski ? v.numer_posiedzenia_rzymski
      : content.meetingNumberFormat === "arabic" && v.numer_posiedzenia_arabski ? v.numer_posiedzenia_arabski
      : (v.numer_posiedzenia_surowy ?? v.numer_posiedzenia);
    return { ...v, numer_posiedzenia: numer, podpisujacy: content.signer, miejscowosc: content.place, data_pisma: letter };
  }, [d, content]);
  const unresolved = useMemo(() => {
    if (!content) return [];
    const texts = [content.title, content.intro, content.agendaLabel, content.outro, content.signature, content.footer, content.letterhead, content.unitName, content.unitDetails, content.place, content.caseRef, ...agenda.map((a) => a.title)];
    return [...new Set(texts.flatMap((t) => fillPlaceholders(t, { ...values, adresat: "x", zwrot: "x" }).unresolved))];
  }, [content, agenda, values]);

  if (!d || !content) return <PageContainer><p className="text-body-secondary">Wczytywanie…</p></PageContainer>;
  const mark = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  async function save(): Promise<boolean> {
    setSaving(true);
    const r = await fetch(`/api/notices/${noticeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content, agenda, recipients }) });
    setSaving(false);
    if (!r.ok) { await notifyFailure(r); return false; }
    notify.success("Zapisano wersję roboczą.");
    await load();
    return true;
  }
  async function generate(mode: "ogolny" | "imienny", format: "docx" | "pdf" = "docx") {
    if (dirty && !(await save())) return;
    if (unresolved.length && !(await ask({ title: "Nierozwiązane znaczniki", message: `W dokumencie są znaczniki bez wartości: ${unresolved.map((u) => `{{${u}}}`).join(", ")}. Zostaną w dokumencie jako tekst. Kontynuować?`, confirmLabel: "Generuj mimo to" }))) return;
    if (mode === "imienny" && recipients.length === 0) { notify.warning("Dodaj adresatów, aby wygenerować dokumenty imienne."); return; }
    window.location.href = `/api/notices/${noticeId}/docx?tryb=${mode}${format === "pdf" ? "&format=pdf" : ""}`;
  }
  async function reimport() {
    const confirmOverwrite = d!.agendaEdited || dirty;
    if (confirmOverwrite && !(await ask({ title: "Zastąpić porządek w zawiadomieniu?", message: "Porządek w tym zawiadomieniu był zmieniany ręcznie. Pobranie porządku z posiedzenia zastąpi te zmiany.", confirmLabel: "Zastąp porządek", danger: true }))) return;
    const r = await fetch(`/api/notices/${noticeId}/reimport-agenda`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmOverwrite: true }) });
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Pobrano porządek z posiedzenia.");
    await load();
  }

  const previewRecipient = recipients.find((r) => r.key === previewFor) ?? null;
  const changed = d.meetingAgendaChanged || !d.diff.same;

  return (
    <PageContainer size="xl">
      <PageHeader
        kicker={<Link href={`/meetings/${meetingId}/notices`} className="d-inline-flex align-items-center gap-1"><IconArrowLeft size={14} /> Zawiadomienia - posiedzenie nr {d.meeting.number}</Link>}
        title={name || "Zawiadomienie"}
        description={d.templateName ? `Szablon: ${d.templateName}` : undefined}
        actions={<>
          <span className={`small ${dirty ? "text-warning-emphasis" : "text-body-secondary"}`} aria-live="polite">{saving ? "Zapisywanie…" : dirty ? "Niezapisane zmiany" : "Zapisano"}</span>
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>Zapisz wersję roboczą</button>
          <div className="dropdown">
            <button className="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><IconDownload /> Pobierz</button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li><button type="button" className="dropdown-item" onClick={() => generate("ogolny", "docx")}>DOCX - dokument ogólny</button></li>
              <li><button type="button" className="dropdown-item" onClick={() => generate("ogolny", "pdf")}>PDF - dokument ogólny</button></li>
              <li><hr className="dropdown-divider" /></li>
              <li><button type="button" className="dropdown-item" disabled={recipients.length === 0} onClick={() => generate("imienny", "docx")}>DOCX - imienne ({recipients.length}){recipients.length > 1 ? ", ZIP" : ""}</button></li>
              <li><button type="button" className="dropdown-item" disabled={recipients.length === 0} onClick={() => generate("imienny", "pdf")}>PDF - imienne ({recipients.length}){recipients.length > 1 ? ", ZIP" : ""}</button></li>
            </ul>
          </div>
        </>}
      />
      {unresolved.length > 0 && <div className="alert alert-warning py-2">Nierozwiązane znaczniki: {unresolved.map((u) => <code key={u} className="me-2">{`{{${u}}}`}</code>)} </div>}

      <div className="row g-3 align-items-start">
        <div className="col-12 col-xxl-7">
          <div className="mb-2">
            <label className="form-label" htmlFor="ne-name">Nazwa robocza</label>
            <input id="ne-name" className="form-control" value={name} onChange={(e) => mark(setName)(e.target.value)} maxLength={200} />
          </div>
          <ul className="nav nav-tabs" role="tablist">
            {([["content", "Treść dokumentu"], ["agenda", `Porządek obrad (${agenda.length})${d.agendaEdited ? " - zmieniony" : ""}`], ["recipients", `Adresaci (${recipients.length})`]] as const).map(([k, l]) => (
              <li key={k} className="nav-item"><button type="button" role="tab" aria-selected={tab === k} className={`nav-link${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{l}</button></li>
            ))}
          </ul>
          <div className="card border-top-0 rounded-top-0">
            <div className="card-body">
              {tab === "content" && <NoticeContentEditor value={content} onChange={mark(setContent)} withDocumentFields idPrefix="ne" />}
              {tab === "agenda" && (
                <>
                  {changed && (
                    <div className="alert alert-info py-2">
                      <div className="fw-semibold">{d.meetingAgendaChanged ? "Porządek posiedzenia zmienił się od pobrania do zawiadomienia." : "Porządek w zawiadomieniu różni się od porządku posiedzenia."}</div>
                      {d.diff.onlyInMeeting.length > 0 && <div className="small">Tylko w posiedzeniu: {d.diff.onlyInMeeting.map((a) => `${a.number ? `${a.number}. ` : ""}${a.title}`).join("; ")}</div>}
                      {d.diff.onlyInNotice.length > 0 && <div className="small">Tylko w zawiadomieniu: {d.diff.onlyInNotice.map((a) => `${a.number ? `${a.number}. ` : ""}${a.title}`).join("; ")}</div>}
                      <button type="button" className="btn btn-sm btn-outline-primary mt-2" onClick={reimport}>Pobierz porządek ponownie z posiedzenia</button>
                    </div>
                  )}
                  <NoticeAgendaEditor items={agenda} onChange={mark(setAgenda)} />
                </>
              )}
              {tab === "recipients" && <NoticeRecipientsEditor meetingId={meetingId} value={recipients} onChange={mark(setRecipients)} />}
            </div>
          </div>
        </div>
        <div className="col-12 col-xxl-5">
          <div className="card">
            <CardHeader title="Podgląd" right={
              <select className="form-select form-select-sm" aria-label="Podgląd dla adresata" value={previewFor} onChange={(e) => setPreviewFor(e.target.value)}>
                <option value="">Dokument ogólny</option>
                {recipients.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            } />
            <div className="card-body bg-body-tertiary overflow-auto" style={{ maxHeight: "80vh" }}>
              <NoticePreview content={content} agenda={agenda} values={values} recipient={previewRecipient} logoUrl={logoUrl} />
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
