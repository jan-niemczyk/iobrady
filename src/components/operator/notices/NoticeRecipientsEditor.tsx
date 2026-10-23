"use client";

import { useEffect, useMemo, useState } from "react";
import type { NoticeRecipient } from "@/lib/noticeText";
import { notify, notifyFailure } from "@/lib/feedback";
import { IconSearch, IconTrash } from "@/components/ui/Icon";

interface Options {
  users: (NoticeRecipient & { club: string | null })[];
  guests: NoticeRecipient[];
  contacts: NoticeRecipient[];
  units: { id: string; name: string; userIds: string[] }[];
  participantIds: string[];
}

/**
 * Adresaci zawiadomienia z jednego słownika (uczestnicy, konta, członkowie grup, goście, kontakty)
 * oraz wpisani ręcznie. Dane adresata można zmienić dla tego dokumentu bez zmiany słownika;
 * zapis ręcznego adresata do kontaktów jest osobną, świadomą czynnością. Duplikaty są pomijane.
 */
export function NoticeRecipientsEditor({ meetingId, value, onChange }: { meetingId: string; value: NoticeRecipient[]; onChange: (v: NoticeRecipient[]) => void }) {
  const [opt, setOpt] = useState<Options | null>(null);
  const [tab, setTab] = useState<"participants" | "users" | "units" | "guests" | "contacts" | "manual">("participants");
  const [q, setQ] = useState("");
  const [manual, setManual] = useState({ name: "", functionTitle: "", institution: "", address: "", salutation: "" });
  const [saveContact, setSaveContact] = useState(false);

  useEffect(() => { fetch(`/api/notices/recipient-options?meeting=${meetingId}`).then((r) => (r.ok ? r.json() : null)).then(setOpt); }, [meetingId]);
  const keys = useMemo(() => new Set(value.map((r) => r.key)), [value]);

  function addMany(list: NoticeRecipient[]) {
    const seen = new Set(value.map((r) => `${r.name.trim().toLocaleLowerCase("pl")}|${r.institution.trim().toLocaleLowerCase("pl")}`));
    const add: NoticeRecipient[] = [];
    let dup = 0;
    for (const r of list) {
      const k2 = `${r.name.trim().toLocaleLowerCase("pl")}|${r.institution.trim().toLocaleLowerCase("pl")}`;
      if (keys.has(r.key) || seen.has(k2)) { dup++; continue; }
      seen.add(k2); add.push({ key: r.key, source: r.source, name: r.name, functionTitle: r.functionTitle, institution: r.institution, address: r.address, salutation: r.salutation });
    }
    onChange([...value, ...add]);
    if (dup) notify.info(`Pominięto duplikaty: ${dup}`);
  }

  const needle = q.trim().toLocaleLowerCase("pl");
  const match = (r: NoticeRecipient) => !needle || `${r.name} ${r.functionTitle} ${r.institution}`.toLocaleLowerCase("pl").includes(needle);
  const list: NoticeRecipient[] = !opt ? [] : tab === "participants" ? opt.users.filter((u) => opt.participantIds.includes(u.key.slice(5)))
    : tab === "users" ? opt.users : tab === "guests" ? opt.guests : tab === "contacts" ? opt.contacts : [];

  async function addManual() {
    if (!manual.name.trim()) return;
    let key = `manual:${Date.now().toString(36)}`;
    let source: NoticeRecipient["source"] = "manual";
    if (saveContact) {
      const r = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "PERSON", ...manual }) });
      if (!r.ok) { await notifyFailure(r); return; }
      const d = await r.json();
      key = `contact:${d.id}`; source = "contact";
      notify.success("Zapisano adresata w kontaktach.");
    }
    addMany([{ key, source, ...manual }]);
    setManual({ name: "", functionTitle: "", institution: "", address: "", salutation: "" });
    setSaveContact(false);
  }

  const TABS: [typeof tab, string][] = [["participants", "Uczestnicy posiedzenia"], ["users", "Wszystkie konta"], ["units", "Grupy"], ["guests", "Goście"], ["contacts", "Kontakty"], ["manual", "Wpisz ręcznie"]];
  return (
    <div className="row g-3">
      <div className="col-12 col-xl-5">
        <ul className="nav nav-tabs small" role="tablist">
          {TABS.map(([k, l]) => <li key={k} className="nav-item"><button type="button" role="tab" aria-selected={tab === k} className={`nav-link${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{l}</button></li>)}
        </ul>
        <div className="border border-top-0 rounded-bottom p-2">
          {!opt ? <div className="text-body-secondary small">Wczytywanie…</div> : tab === "manual" ? (
            <div className="d-flex flex-column gap-2">
              <input className="form-control form-control-sm" placeholder="Imię i nazwisko albo nazwa instytucji" aria-label="Nazwa adresata" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} maxLength={200} />
              <input className="form-control form-control-sm" placeholder="Funkcja" aria-label="Funkcja" value={manual.functionTitle} onChange={(e) => setManual({ ...manual, functionTitle: e.target.value })} maxLength={200} />
              <input className="form-control form-control-sm" placeholder="Instytucja" aria-label="Instytucja" value={manual.institution} onChange={(e) => setManual({ ...manual, institution: e.target.value })} maxLength={300} />
              <textarea className="form-control form-control-sm" rows={2} placeholder="Adres (opcjonalnie)" aria-label="Adres" value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} maxLength={1000} />
              <input className="form-control form-control-sm" placeholder="Zwrot grzecznościowy, np. Szanowny Panie" aria-label="Zwrot grzecznościowy" value={manual.salutation} onChange={(e) => setManual({ ...manual, salutation: e.target.value })} maxLength={120} />
              <div className="form-check small"><input className="form-check-input" type="checkbox" id="nr-save" checked={saveContact} onChange={(e) => setSaveContact(e.target.checked)} /><label className="form-check-label" htmlFor="nr-save">Zapisz także w słowniku kontaktów</label></div>
              <button type="button" className="btn btn-sm btn-primary" disabled={!manual.name.trim()} onClick={addManual}>Dodaj adresata</button>
            </div>
          ) : tab === "units" ? (
            <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
              {opt.units.length === 0 && <li className="text-body-secondary small">Brak grup organizacyjnych.</li>}
              {opt.units.map((u) => (
                <li key={u.id} className="d-flex justify-content-between align-items-center gap-2">
                  <span>{u.name} <span className="text-body-secondary small">({u.userIds.length})</span></span>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => addMany(opt.users.filter((x) => u.userIds.includes(x.key.slice(5))))}>Dodaj członków</button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="d-flex gap-2 mb-2">
                <div className="input-group input-group-sm"><span className="input-group-text"><IconSearch /></span><input className="form-control" placeholder="Szukaj" aria-label="Szukaj adresata" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <button type="button" className="btn btn-sm btn-outline-primary text-nowrap" disabled={list.filter(match).length === 0} onClick={() => addMany(list.filter(match))}>Dodaj wszystkich ({list.filter(match).length})</button>
              </div>
              <ul className="list-group list-group-flush overflow-auto" style={{ maxHeight: 300 }}>
                {list.filter(match).map((r) => (
                  <li key={r.key} className="list-group-item d-flex justify-content-between align-items-center gap-2 py-1 px-1">
                    <span className="small">{r.name}{r.functionTitle ? <span className="text-body-secondary">, {r.functionTitle}</span> : null}{r.institution ? <span className="text-body-secondary">, {r.institution}</span> : null}</span>
                    <button type="button" className="btn btn-sm btn-outline-primary" disabled={keys.has(r.key)} onClick={() => addMany([r])}>{keys.has(r.key) ? "Dodany" : "Dodaj"}</button>
                  </li>
                ))}
                {list.filter(match).length === 0 && <li className="list-group-item text-body-secondary small">Brak pozycji.</li>}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="col-12 col-xl-7">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="fw-semibold">Adresaci dokumentu: {value.length} <span className="text-body-secondary fw-normal small">(dokumenty imienne: {value.length})</span></div>
          {value.length > 0 && <button type="button" className="btn btn-sm btn-link text-danger" onClick={() => onChange([])}>Usuń wszystkich</button>}
        </div>
        {value.length === 0 ? <p className="text-body-secondary small">Brak adresatów.</p> : (
          <div className="d-flex flex-column gap-2 overflow-auto" style={{ maxHeight: 520 }}>
            {value.map((r, i) => (
              <details key={r.key} className="border rounded p-2">
                <summary className="d-flex justify-content-between align-items-center gap-2">
                  <span>{r.name}{r.functionTitle ? `, ${r.functionTitle}` : ""} <span className="badge text-bg-light border fw-normal">{{ user: "konto", guest: "gość", contact: "kontakt", manual: "ręcznie" }[r.source]}</span></span>
                  <button type="button" className="btn btn-sm agenda-del" aria-label={`Usuń adresata ${r.name}`} onClick={(e) => { e.preventDefault(); onChange(value.filter((_, j) => j !== i)); }}><IconTrash /></button>
                </summary>
                <div className="row g-2 mt-1">
                  {([["name", "Nazwa / imię i nazwisko"], ["functionTitle", "Funkcja"], ["institution", "Instytucja"], ["salutation", "Zwrot grzecznościowy"]] as const).map(([k, l]) => (
                    <div key={k} className="col-12 col-md-6"><label className="form-label small mb-0" htmlFor={`nr-${i}-${k}`}>{l}</label><input id={`nr-${i}-${k}`} className="form-control form-control-sm" value={r[k]} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></div>
                  ))}
                  <div className="col-12"><label className="form-label small mb-0" htmlFor={`nr-${i}-addr`}>Adres</label><textarea id={`nr-${i}-addr`} className="form-control form-control-sm" rows={2} value={r.address} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))} /></div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
