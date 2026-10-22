"use client";

import { useState } from "react";
import { PLACEHOLDERS, type NoticeContent } from "@/lib/noticeText";
import { RichEditor } from "@/components/RichEditor";
import { notify, notifyFailure } from "@/lib/feedback";

/** Wybór znacznika danych wstawianego w miejscu kursora (np. {{data_posiedzenia}}). */
function PlaceholderPicker({ insert }: { insert: (t: string) => void }) {
  return (
    <select className="form-select form-select-sm w-auto" aria-label="Wstaw dane posiedzenia" value=""
      onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { if (e.target.value) insert(`{{${e.target.value}}}`); }}>
      <option value="">Wstaw dane…</option>
      {PLACEHOLDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
  );
}

/** Pola treści zawiadomienia - wspólne dla szablonu i konkretnego dokumentu. */
export function NoticeContentEditor({ value: c, onChange, withDocumentFields, idPrefix }: {
  value: NoticeContent; onChange: (c: NoticeContent) => void; withDocumentFields: boolean; idPrefix: string;
}) {
  const set = (p: Partial<NoticeContent>) => onChange({ ...c, ...p });
  const id = (s: string) => `${idPrefix}-${s}`;
  const [uploading, setUploading] = useState(false);

  async function uploadPaper(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/notice-templates/letterhead", { method: "POST", body: fd });
    setUploading(false);
    if (!r.ok) { await notifyFailure(r); return; }
    const d = await r.json();
    set({ letterheadImage: d.url });
    if (!d.a4) notify.warning("Obraz nie ma proporcji A4 - zostanie dopasowany do całej strony.");
  }
  const mmField = (k: "marginTopMm" | "marginBottomMm" | "marginLeftMm" | "marginRightMm", label: string) => (
    <div className="col-6 col-md-3"><label className="form-label small" htmlFor={id(k)}>{label}</label>
      <div className="input-group input-group-sm"><input id={id(k)} type="number" min={5} max={80} className="form-control" value={c[k]} onChange={(e) => set({ [k]: Math.min(80, Math.max(5, Number(e.target.value) || 5)) } as Partial<NoticeContent>)} /><span className="input-group-text">mm</span></div></div>
  );

  return (
    <div className="d-flex flex-column gap-3">
      <fieldset className="border rounded p-3">
        <legend className="float-none w-auto px-1 fs-6 fw-semibold mb-0">Nagłówek</legend>
        <div className="row g-2">
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("unit")}>Nazwa organu</label><textarea id={id("unit")} className="form-control" rows={2} value={c.unitName} onChange={(e) => set({ unitName: e.target.value })} maxLength={300} /></div>
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("unitd")}>Pod nazwą</label><textarea id={id("unitd")} className="form-control" rows={2} value={c.unitDetails} onChange={(e) => set({ unitDetails: e.target.value })} maxLength={2000} placeholder={"{{nazwa_posiedzenia}}\n{{data_posiedzenia}}, godz. {{godzina}}"} /></div>
          <div className="col-6 col-md-3"><label className="form-label" htmlFor={id("place")}>Miejscowość</label><input id={id("place")} className="form-control" value={c.place} onChange={(e) => set({ place: e.target.value })} maxLength={120} /></div>
          {withDocumentFields && <div className="col-6 col-md-3"><label className="form-label" htmlFor={id("date")}>Data pisma</label><input id={id("date")} type="date" className="form-control" value={c.letterDate} onChange={(e) => set({ letterDate: e.target.value })} /></div>}
          {withDocumentFields && <div className="col-12 col-md-3"><label className="form-label" htmlFor={id("ref")}>Znak sprawy</label><input id={id("ref")} className="form-control" value={c.caseRef} onChange={(e) => set({ caseRef: e.target.value })} maxLength={120} /></div>}
          <div className="col-12 col-md-3 d-flex align-items-end"><div className="form-check"><input className="form-check-input" type="checkbox" id={id("logo")} checked={c.useLogo} onChange={(e) => set({ useLogo: e.target.checked })} /><label className="form-check-label" htmlFor={id("logo")}>Logo / herb</label></div></div>
          <div className="col-12 col-md-8"><label className="form-label" htmlFor={id("title")}>Tytuł dokumentu</label><input id={id("title")} className="form-control" value={c.title} onChange={(e) => set({ title: e.target.value })} maxLength={300} /></div>
          <div className="col-12 col-md-4"><label className="form-label" htmlFor={id("numfmt")}>Numer posiedzenia</label>
            <select id={id("numfmt")} className="form-select" value={c.meetingNumberFormat} onChange={(e) => set({ meetingNumberFormat: e.target.value as NoticeContent["meetingNumberFormat"] })}>
              <option value="asis">Jak w posiedzeniu</option><option value="roman">Cyframi rzymskimi</option><option value="arabic">Cyframi arabskimi</option>
            </select></div>
        </div>
      </fieldset>

      <fieldset className="border rounded p-3">
        <legend className="float-none w-auto px-1 fs-6 fw-semibold mb-0">Treść</legend>
        <RichEditor id={id("intro")} label="Wstęp i podstawa prawna" value={c.intro} onChange={(v) => set({ intro: v })} minHeight={180} extra={(insert) => <PlaceholderPicker insert={insert} />} />
        <div className="row g-2 my-2">
          <div className="col-12 col-md-8"><label className="form-label" htmlFor={id("alabel")}>Nagłówek porządku obrad</label><input id={id("alabel")} className="form-control" value={c.agendaLabel} onChange={(e) => set({ agendaLabel: e.target.value })} maxLength={300} /></div>
          <div className="col-12 col-md-4 d-flex align-items-end"><div className="form-check"><input className="form-check-input" type="checkbox" id={id("apos")} checked={c.agendaPosition !== "none"} onChange={(e) => set({ agendaPosition: e.target.checked ? "after-intro" : "none" })} /><label className="form-check-label" htmlFor={id("apos")}>Porządek obrad w dokumencie</label></div></div>
        </div>
        <RichEditor id={id("outro")} label="Po porządku obrad" value={c.outro} onChange={(v) => set({ outro: v })} minHeight={90} extra={(insert) => <PlaceholderPicker insert={insert} />} />
        <div className="row g-2 mt-1">
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("sig")}>Podpis</label><textarea id={id("sig")} className="form-control" rows={3} value={c.signature} onChange={(e) => set({ signature: e.target.value })} maxLength={2000} placeholder={"Przewodniczący Rady\n{{podpisujacy}}"} /></div>
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("signer")}>Osoba podpisująca</label><input id={id("signer")} className="form-control" value={c.signer} onChange={(e) => set({ signer: e.target.value })} maxLength={300} /></div>
        </div>
      </fieldset>

      <details className="border rounded p-3">
        <summary className="fw-semibold">Stopka, papier firmowy i marginesy</summary>
        <div className="row g-2 mt-2">
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("foot")}>Stopka strony</label><textarea id={id("foot")} className="form-control" rows={3} value={c.footer} onChange={(e) => set({ footer: e.target.value })} maxLength={2000} />
            <div className="form-check mt-1"><input className="form-check-input" type="checkbox" id={id("pn")} checked={c.footerPageNumbers} onChange={(e) => set({ footerPageNumbers: e.target.checked })} /><label className="form-check-label" htmlFor={id("pn")}>Numeracja stron</label></div></div>
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("head")}>Nagłówek strony (tekst)</label><textarea id={id("head")} className="form-control" rows={3} value={c.letterhead} onChange={(e) => set({ letterhead: e.target.value })} maxLength={2000} /></div>
          <div className="col-12">
            <span className="form-label d-block">Papier firmowy (obraz strony A4: PNG, JPG, SVG)</span>
            <div className="d-flex flex-wrap align-items-center gap-2">
              {c.letterheadImage
                ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.letterheadImage} alt="Papier firmowy" style={{ height: 90, border: "1px solid #ccc" }} /><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => set({ letterheadImage: "" })}>Usuń</button></>
                : null}
              <label className="btn btn-sm btn-outline-secondary mb-0">{uploading ? "Wgrywanie…" : c.letterheadImage ? "Zmień" : "Wgraj"}<input type="file" className="visually-hidden" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={(e) => uploadPaper(e.target.files)} /></label>
            </div>
          </div>
          {mmField("marginTopMm", c.letterheadImage ? "Nagłówek papieru" : "Margines górny")}{mmField("marginBottomMm", c.letterheadImage ? "Stopka papieru" : "Margines dolny")}{mmField("marginLeftMm", "Margines lewy")}{mmField("marginRightMm", "Margines prawy")}
        </div>
      </details>
    </div>
  );
}
