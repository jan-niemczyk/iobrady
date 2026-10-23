"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CardHeader, PageContainer, PageHeader } from "./ui";
import { Modal } from "./Modal";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "@/components/ui/Icon";

export interface ContactRow {
  id: string; kind: string; name: string; functionTitle: string | null; institution: string | null;
  address: string | null; email: string | null; salutation: string | null; active: boolean;
}
const EMPTY = { kind: "PERSON", name: "", functionTitle: "", institution: "", address: "", email: "", salutation: "" };

/**
 * Słownik kontaktów bez konta w systemie (osoby i instytucje) - adresaci zawiadomień i pism.
 * Konta (uczestnicy) i goście są wybierani bezpośrednio ze swoich modułów - nie są tu kopiowani.
 */
export function ContactsManagerClient() {
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const r = await fetch("/api/contacts", { cache: "no-store" });
    setRows(r.ok ? await r.json() : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const needle = q.trim().toLocaleLowerCase("pl");
  const shown = (rows ?? []).filter((c) => !needle || `${c.name} ${c.functionTitle ?? ""} ${c.institution ?? ""} ${c.email ?? ""}`.toLocaleLowerCase("pl").includes(needle));

  function save() {
    if (!edit) return;
    const { id, ...body } = edit;
    start(async () => {
      const r = await fetch(id ? `/api/contacts/${id}` : "/api/contacts", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { await notifyFailure(r); return; }
      notify.success(id ? "Zapisano kontakt." : "Dodano kontakt.");
      setEdit(null);
      await load();
    });
  }

  return (
    <PageContainer size="lg">
      <PageHeader
        kicker="Osoby i grupy"
        title="Kontakty"
        actions={<><button className="btn btn-primary" onClick={() => setEdit({ ...EMPTY })}><IconPlus /> Nowy kontakt</button><Link className="btn btn-outline-secondary" href="/guests">Goście</Link></>}
      />
      <div className="card">
        <CardHeader title={<>Kontakty <span className="text-body-secondary fw-normal">({rows?.length ?? 0})</span></>} right={
          <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
            <span className="input-group-text"><IconSearch /></span>
            <input className="form-control" placeholder="Szukaj" aria-label="Szukaj kontaktu" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        } />
        {rows === null ? <div className="card-body text-body-secondary">Wczytywanie…</div>
          : shown.length === 0 ? <div className="card-body text-body-secondary">{rows.length === 0 ? "Brak kontaktów. Dodaj pierwszy przyciskiem „Nowy kontakt” albo zapisz adresata ręcznego przy tworzeniu zawiadomienia." : "Brak wyników wyszukiwania."}</div>
          : (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead><tr><th>Nazwa</th><th>Funkcja / instytucja</th><th>Adres</th><th>E-mail</th><th><span className="visually-hidden">Akcje</span></th></tr></thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.id}>
                      <td><div className="fw-medium">{c.name}</div><div className="small text-body-secondary">{c.kind === "INSTITUTION" ? "Instytucja" : "Osoba"}{c.salutation ? ` - „${c.salutation}”` : ""}</div></td>
                      <td className="small">{[c.functionTitle, c.institution].filter(Boolean).join(", ")}</td>
                      <td className="small" style={{ whiteSpace: "pre-line" }}>{c.address}</td>
                      <td className="small">{c.email}</td>
                      <td className="text-end text-nowrap">
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => setEdit({ id: c.id, kind: c.kind, name: c.name, functionTitle: c.functionTitle ?? "", institution: c.institution ?? "", address: c.address ?? "", email: c.email ?? "", salutation: c.salutation ?? "" })}><IconEdit /> Edytuj</button>
                        <button className="btn btn-sm agenda-del" aria-label={`Usuń kontakt ${c.name}`} disabled={pending} onClick={async () => {
                          if (await ask({ title: "Usunąć kontakt?", message: "Dokumenty, w których był adresatem, zachowają jego dane.", confirmLabel: "Usuń", danger: true })) start(async () => {
                            const r = await fetch(`/api/contacts/${c.id}`, { method: "DELETE" });
                            if (!r.ok) { await notifyFailure(r); return; }
                            notify.success("Usunięto kontakt.");
                            await load();
                          });
                        }}><IconTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
      {edit && (
        <Modal title={edit.id ? "Edycja kontaktu" : "Nowy kontakt"} onClose={() => setEdit(null)} closeOnBackdrop={false}
          footer={<><button className="btn btn-outline-secondary" onClick={() => setEdit(null)}>Anuluj</button><button className="btn btn-primary" disabled={pending || !edit.name.trim()} onClick={save}>{pending ? "Zapisywanie…" : "Zapisz"}</button></>}>
          <ContactFields value={edit} onChange={(v) => setEdit({ ...edit, ...v })} />
        </Modal>
      )}
    </PageContainer>
  );
}

export function ContactFields({ value, onChange, idPrefix = "ct" }: { value: typeof EMPTY; onChange: (v: Partial<typeof EMPTY>) => void; idPrefix?: string }) {
  return (
    <div className="row g-2">
      <div className="col-12 col-sm-4">
        <label className="form-label" htmlFor={`${idPrefix}-kind`}>Rodzaj</label>
        <select id={`${idPrefix}-kind`} className="form-select" value={value.kind} onChange={(e) => onChange({ kind: e.target.value })}>
          <option value="PERSON">Osoba</option><option value="INSTITUTION">Instytucja</option>
        </select>
      </div>
      <div className="col-12 col-sm-8">
        <label className="form-label" htmlFor={`${idPrefix}-name`}>{value.kind === "INSTITUTION" ? "Nazwa instytucji" : "Imię i nazwisko"}</label>
        <input id={`${idPrefix}-name`} className="form-control" value={value.name} maxLength={200} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="col-12 col-sm-6">
        <label className="form-label" htmlFor={`${idPrefix}-fn`}>Funkcja</label>
        <input id={`${idPrefix}-fn`} className="form-control" value={value.functionTitle} maxLength={200} onChange={(e) => onChange({ functionTitle: e.target.value })} />
      </div>
      <div className="col-12 col-sm-6">
        <label className="form-label" htmlFor={`${idPrefix}-inst`}>Instytucja</label>
        <input id={`${idPrefix}-inst`} className="form-control" value={value.institution} maxLength={300} onChange={(e) => onChange({ institution: e.target.value })} />
      </div>
      <div className="col-12">
        <label className="form-label" htmlFor={`${idPrefix}-addr`}>Adres <span className="text-body-secondary fw-normal">(opcjonalnie, kolejne wiersze)</span></label>
        <textarea id={`${idPrefix}-addr`} className="form-control" rows={2} value={value.address} maxLength={1000} onChange={(e) => onChange({ address: e.target.value })} />
      </div>
      <div className="col-12 col-sm-6">
        <label className="form-label" htmlFor={`${idPrefix}-sal`}>Zwrot grzecznościowy</label>
        <input id={`${idPrefix}-sal`} className="form-control" value={value.salutation} maxLength={120} placeholder="np. Szanowna Pani" onChange={(e) => onChange({ salutation: e.target.value })} />
      </div>
      <div className="col-12 col-sm-6">
        <label className="form-label" htmlFor={`${idPrefix}-email`}>E-mail <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label>
        <input id={`${idPrefix}-email`} type="email" className="form-control" value={value.email} maxLength={254} onChange={(e) => onChange({ email: e.target.value })} />
      </div>
    </div>
  );
}
