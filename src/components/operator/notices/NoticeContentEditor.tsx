"use client";

import type { NoticeContent } from "@/lib/noticeText";
import { RichTextField } from "./RichTextField";

/** Pola treści zawiadomienia - wspólne dla szablonu i konkretnego dokumentu. */
export function NoticeContentEditor({ value: c, onChange, withDocumentFields, idPrefix }: {
  value: NoticeContent; onChange: (c: NoticeContent) => void; withDocumentFields: boolean; idPrefix: string;
}) {
  const set = (p: Partial<NoticeContent>) => onChange({ ...c, ...p });
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <div className="d-flex flex-column gap-3">
      <fieldset className="border rounded p-3">
        <legend className="float-none w-auto px-1 fs-6 fw-semibold mb-0">Dane jednostki i dokumentu</legend>
        <div className="row g-2">
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("unit")}>Nazwa jednostki / organu</label><textarea id={id("unit")} className="form-control" rows={2} value={c.unitName} onChange={(e) => set({ unitName: e.target.value })} maxLength={300} /></div>
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("unitd")}>Dane jednostki (adres, kolejne wiersze)</label><textarea id={id("unitd")} className="form-control" rows={2} value={c.unitDetails} onChange={(e) => set({ unitDetails: e.target.value })} maxLength={2000} /></div>
          <div className="col-6 col-md-3"><label className="form-label" htmlFor={id("place")}>Miejscowość</label><input id={id("place")} className="form-control" value={c.place} onChange={(e) => set({ place: e.target.value })} maxLength={120} /></div>
          {withDocumentFields && <div className="col-6 col-md-3"><label className="form-label" htmlFor={id("date")}>Data pisma</label><input id={id("date")} type="date" className="form-control" value={c.letterDate} onChange={(e) => set({ letterDate: e.target.value })} /></div>}
          {withDocumentFields && <div className="col-12 col-md-3"><label className="form-label" htmlFor={id("ref")}>Znak sprawy <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label><input id={id("ref")} className="form-control" value={c.caseRef} onChange={(e) => set({ caseRef: e.target.value })} maxLength={120} /></div>}
          <div className="col-12 col-md-3 d-flex align-items-end"><div className="form-check"><input className="form-check-input" type="checkbox" id={id("logo")} checked={c.useLogo} onChange={(e) => set({ useLogo: e.target.checked })} /><label className="form-check-label" htmlFor={id("logo")}>Logo / herb z Ustawień</label></div></div>
          <div className="col-12"><label className="form-label" htmlFor={id("title")}>Tytuł dokumentu</label><input id={id("title")} className="form-control" value={c.title} onChange={(e) => set({ title: e.target.value })} maxLength={300} /></div>
        </div>
      </fieldset>

      <fieldset className="border rounded p-3">
        <legend className="float-none w-auto px-1 fs-6 fw-semibold mb-0">Treść przed porządkiem obrad / podstawa prawna</legend>
        <RichTextField id={id("intro")} label="Wstęp (treść główna dokumentu - nie powtarza się na stronach)" value={c.intro} onChange={(v) => set({ intro: v })} rows={7}
          hint="Podstawę prawną, informację o zwołaniu, termin i miejsce wpisuje uprawniony użytkownik - system ich nie podpowiada. Znaczniki: {{organ}}, {{data_posiedzenia}}, {{godzina}}, {{miejsce}}…" />
      </fieldset>

      <fieldset className="border rounded p-3">
        <legend className="float-none w-auto px-1 fs-6 fw-semibold mb-0">Porządek obrad - etykieta i miejsce</legend>
        <div className="row g-2">
          <div className="col-12 col-md-8"><label className="form-label" htmlFor={id("alabel")}>Etykieta porządku</label><input id={id("alabel")} className="form-control" value={c.agendaLabel} onChange={(e) => set({ agendaLabel: e.target.value })} maxLength={300} /></div>
          <div className="col-12 col-md-4"><label className="form-label" htmlFor={id("apos")}>Miejsce porządku</label><select id={id("apos")} className="form-select" value={c.agendaPosition} onChange={(e) => set({ agendaPosition: e.target.value as NoticeContent["agendaPosition"] })}><option value="after-intro">Po wstępie</option><option value="none">Bez porządku</option></select></div>
        </div>
      </fieldset>

      <fieldset className="border rounded p-3">
        <legend className="float-none w-auto px-1 fs-6 fw-semibold mb-0">Treść po porządku i podpis</legend>
        <RichTextField id={id("outro")} label="Treść po porządku (opcjonalnie)" value={c.outro} onChange={(v) => set({ outro: v })} rows={4} />
        <div className="row g-2 mt-1">
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("sig")}>Blok podpisu (w treści dokumentu)</label><textarea id={id("sig")} className="form-control" rows={3} value={c.signature} onChange={(e) => set({ signature: e.target.value })} maxLength={2000} placeholder={"Przewodnicząca Rady\n{{podpisujacy}}"} /></div>
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("signer")}>Osoba podpisująca ({"{{podpisujacy}}"})</label><input id={id("signer")} className="form-control" value={c.signer} onChange={(e) => set({ signer: e.target.value })} maxLength={300} /><div className="form-text">System nie tworzy podpisu elektronicznego.</div></div>
        </div>
      </fieldset>

      <fieldset className="border rounded p-3">
        <legend className="float-none w-auto px-1 fs-6 fw-semibold mb-0">Stopka i nagłówek strony DOCX</legend>
        <div className="row g-2">
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("foot")}>Stopka strony (na każdej stronie)</label><textarea id={id("foot")} className="form-control" rows={3} value={c.footer} onChange={(e) => set({ footer: e.target.value })} maxLength={2000} placeholder="Dane kontaktowe jednostki" />
            <div className="form-check mt-1"><input className="form-check-input" type="checkbox" id={id("pn")} checked={c.footerPageNumbers} onChange={(e) => set({ footerPageNumbers: e.target.checked })} /><label className="form-check-label" htmlFor={id("pn")}>Numeracja stron w stopce</label></div></div>
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={id("head")}>Nagłówek papieru firmowego (opcjonalnie, każda strona)</label><textarea id={id("head")} className="form-control" rows={3} value={c.letterhead} onChange={(e) => set({ letterhead: e.target.value })} maxLength={2000} /><div className="form-text">To nie jest miejsce na podstawę prawną - ta należy do wstępu.</div></div>
        </div>
      </fieldset>
    </div>
  );
}
