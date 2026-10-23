"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CardHeader, PageContainer, PageHeader } from "./ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { IconPlus, IconTrash } from "@/components/ui/Icon";

interface Club { id: string; name: string; shortName: string | null; color: string | null; members: string[] }

/**
 * Kluby i koła: przynależność osoby (jedna na konto) używana w raportach głosowań i na prezentacji.
 * Niezależna od grup organizacyjnych (organów i komisji). Przypisanie osób - w module Uczestnicy.
 */
export function ClubsManagerClient({ initial, groupsEnabled }: { initial: Club[]; groupsEnabled: boolean }) {
  const [clubs, setClubs] = useState(initial);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", shortName: "", color: "#1E3A8A" });

  async function reload() {
    const r = await fetch("/api/groups", { cache: "no-store" });
    if (!r.ok) return;
    const list = await r.json() as { id: string; name: string; shortName: string | null; color: string | null }[];
    setClubs((cur) => list.map((g) => ({ ...g, members: cur.find((c) => c.id === g.id)?.members ?? [] })));
  }
  function call(method: string, url: string, body?: unknown, msg?: string) {
    start(async () => {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) { await notifyFailure(r); return; }
      if (msg) notify.success(msg);
      await reload();
    });
  }

  return (
    <PageContainer size="lg">
      <PageHeader
        kicker="Osoby i grupy"
        title="Kluby i koła"
        actions={<><Link className="btn btn-outline-secondary" href="/participants">Uczestnicy</Link><Link className="btn btn-outline-secondary" href="/groups">Grupy organizacyjne</Link></>}
      />
      {!groupsEnabled && (
        <div className="alert alert-info">Podział na kluby i koła jest wyłączony w Ustawieniach - raporty i widok publiczny nie pokazują wtedy kolumn klubów.</div>
      )}
      <div className="card mb-3">
        <CardHeader title="Nowy klub lub koło" />
        <form className="card-body row g-2 align-items-end" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) { call("POST", "/api/groups", { name: form.name.trim(), shortName: form.shortName.trim() || null, color: form.color }, "Dodano klub."); setForm({ ...form, name: "", shortName: "" }); } }}>
          <div className="col-12 col-md-6"><label className="form-label" htmlFor="cl-name">Nazwa</label><input id="cl-name" className="form-control" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="col-6 col-md-3"><label className="form-label" htmlFor="cl-short">Skrót</label><input id="cl-short" className="form-control" value={form.shortName} maxLength={20} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></div>
          <div className="col-3 col-md-1"><label className="form-label" htmlFor="cl-color">Kolor</label><input id="cl-color" type="color" className="form-control form-control-color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
          <div className="col-3 col-md-2 d-grid"><button className="btn btn-primary" disabled={pending || !form.name.trim()}><IconPlus /> Dodaj</button></div>
        </form>
      </div>
      <div className="card">
        <CardHeader title={<>Kluby i koła <span className="text-body-secondary fw-normal">({clubs.length})</span></>} />
        {clubs.length === 0 ? <div className="card-body text-body-secondary">Brak klubów i kół.</div> : (
          <ul className="list-group list-group-flush">
            {clubs.map((c) => (
              <li key={c.id} className="list-group-item">
                <div className="row g-2 align-items-center">
                  <div className="col-12 col-md-5"><input className="form-control form-control-sm" aria-label={`Nazwa klubu ${c.name}`} defaultValue={c.name} maxLength={100} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.name) call("PATCH", `/api/groups/${c.id}`, { name: e.target.value.trim() }, "Zapisano."); }} /></div>
                  <div className="col-5 col-md-2"><input className="form-control form-control-sm" aria-label={`Skrót klubu ${c.name}`} defaultValue={c.shortName ?? ""} maxLength={20} onBlur={(e) => { if (e.target.value !== (c.shortName ?? "")) call("PATCH", `/api/groups/${c.id}`, { shortName: e.target.value.trim() || null }, "Zapisano."); }} /></div>
                  <div className="col-2 col-md-1"><input type="color" className="form-control form-control-color form-control-sm" aria-label={`Kolor klubu ${c.name}`} defaultValue={c.color ?? "#1E3A8A"} onBlur={(e) => { if (e.target.value !== c.color) call("PATCH", `/api/groups/${c.id}`, { color: e.target.value }, "Zapisano."); }} /></div>
                  <div className="col-4 col-md-3 small text-body-secondary">{c.members.length} os.</div>
                  <div className="col-1 text-end">
                    <button className="btn btn-sm agenda-del" aria-label={`Usuń klub ${c.name}`} title="Usuń" disabled={pending} onClick={async () => {
                      if (await ask({ title: "Usunąć klub?", message: "Usunąć można tylko klub bez przypisanych osób. Zapisane raporty głosowań zachowują skrót klubu z chwili głosowania.", confirmLabel: "Usuń", danger: true }))
                        call("DELETE", `/api/groups/${c.id}`, undefined, "Usunięto klub.");
                    }}><IconTrash /></button>
                  </div>
                  {c.members.length > 0 && <div className="col-12 small text-body-secondary">{c.members.join(", ")}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
