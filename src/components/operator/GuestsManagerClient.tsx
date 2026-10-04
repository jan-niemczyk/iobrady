"use client";

import { useState, useTransition } from "react";
import { PageContainer, PageHeader } from "./ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  role: string | null;
  clubShort: string | null;
}

export function GuestsManagerClient({ initialGuests }: { initialGuests: Guest[] }) {
  const [guests, setGuests] = useState<Guest[]>(initialGuests);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Guest | null>(null);
  const [adding, setAdding] = useState(false);

  function reload() {
    fetch("/api/guests", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { guests: [] })
      .then((d) => setGuests(d.guests ?? []))
      .catch(() => {});
  }

  async function remove(g: Guest) {
    if (!(await ask({ title: "Usunąć gościa?", message: `Gość ${g.firstName} ${g.lastName} zostanie usunięty z katalogu.`, confirmLabel: "Usuń", danger: true }))) return;
    startTransition(async () => {
      const r = await fetch(`/api/guests/${g.id}`, { method: "DELETE" });
      if (!r.ok) { await notifyFailure(r); return; }
      notify.success("Gość został usunięty.");
      reload();
    });
  }

  const filtered = guests.filter((g) =>
    `${g.firstName} ${g.lastName} ${g.role ?? ""} ${g.clubShort ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <PageContainer size="md">
      <PageHeader
        kicker="Katalog"
        title="Katalog gości"
        description="Goście to osoby zabierające głos bez konta i bez prawa głosu (np. dyrektorzy wydziałów, zaproszeni eksperci). Katalog pozwala szybko dodać ich do listy mówców na posiedzeniu."
        actions={<button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>+ Dodaj gościa</button>}
      />

      {(adding || editing) && (
        <GuestForm
          key={editing?.id ?? "new"}
          guest={editing}
          pending={pending}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); reload(); }}
        />
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title-text">Goście <span className="text-body-secondary fw-normal">({guests.length})</span></h2>
          <input className="form-control form-control-sm" style={{ maxWidth: 260 }} placeholder="Wyszukaj gościa…" aria-label="Wyszukaj gościa" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="card-body text-center text-body-secondary py-4">
            {guests.length === 0 ? "Brak gości w katalogu." : "Brak wyników."}
          </div>
        ) : (
          <ul className="list-group list-group-flush">
            {filtered.map((g) => (
              <li key={g.id} className="list-group-item d-flex align-items-center justify-content-between gap-3">
                <div className="min-w-0">
                  <div className="fw-medium">{g.lastName} {g.firstName}</div>
                  <div className="small text-body-secondary">
                    {[g.role, g.clubShort].filter(Boolean).join(" - ") || "-"}
                  </div>
                </div>
                <div className="d-flex gap-2 flex-shrink-0">
                  <button className="btn btn-sm" onClick={() => { setEditing(g); setAdding(false); }}>Edytuj</button>
                  <button className="btn btn-sm btn-outline-danger" disabled={pending} onClick={() => remove(g)}>Usuń</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

function GuestForm({ guest, pending, onCancel, onSaved }: {
  guest: Guest | null;
  pending: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(guest?.firstName ?? "");
  const [lastName, setLastName] = useState(guest?.lastName ?? "");
  const [role, setRole] = useState(guest?.role ?? "");
  const [clubShort, setClubShort] = useState(guest?.clubShort ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { notify.error("Podaj imię i nazwisko."); return; }
    setSaving(true);
    const body = {
      firstName: firstName.trim(), lastName: lastName.trim(),
      role: role.trim() || null, clubShort: clubShort.trim() || null,
    };
    const r = guest
      ? await fetch(`/api/guests/${guest.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/guests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success(guest ? "Zmiany zapisano." : "Gość został dodany.");
    onSaved();
  }

  return (
    <form onSubmit={save} className="card mb-4">
      <div className="card-header"><h2 className="card-title-text">{guest ? "Edytuj gościa" : "Nowy gość"}</h2></div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-12 col-sm-6">
            <label className="form-label" htmlFor="g-last">Nazwisko</label>
            <input id="g-last" className="form-control" value={lastName} onChange={(e) => setLastName(e.target.value)} required autoFocus />
          </div>
          <div className="col-12 col-sm-6">
            <label className="form-label" htmlFor="g-first">Imię</label>
            <input id="g-first" className="form-control" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="col-12 col-sm-6">
            <label className="form-label" htmlFor="g-role">Funkcja / stanowisko</label>
            <input id="g-role" className="form-control" value={role} onChange={(e) => setRole(e.target.value)} placeholder="np. Dyrektor Wydziału Edukacji" />
          </div>
          <div className="col-12 col-sm-6">
            <label className="form-label" htmlFor="g-club">Podmiot <span className="fw-normal text-body-secondary">(skrót, opcjonalnie)</span></label>
            <input id="g-club" className="form-control" value={clubShort} onChange={(e) => setClubShort(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="card-footer d-flex justify-content-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>Anuluj</button>
        <button type="submit" className="btn btn-primary" disabled={pending || saving}>{saving ? "Zapisywanie…" : "Zapisz"}</button>
      </div>
    </form>
  );
}
