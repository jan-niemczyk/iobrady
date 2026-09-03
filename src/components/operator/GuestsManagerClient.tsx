"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@/components/ui/Icon";

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

  function remove(g: Guest) {
    if (!window.confirm(`Usunąć gościa „${g.lastName} ${g.firstName}" z katalogu?`)) return;
    startTransition(async () => {
      const r = await fetch(`/api/guests/${g.id}`, { method: "DELETE" });
      if (!r.ok) { alert(await r.text()); return; }
      reload();
    });
  }

  const filtered = guests.filter((g) =>
    `${g.firstName} ${g.lastName} ${g.role ?? ""} ${g.clubShort ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="btn"><IconArrowLeft size={13} /> Pulpit</Link>
          <h1 className="text-xl font-semibold">Katalog gości</h1>
        </div>
        <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}>Dodaj gościa</button>
      </div>

      <p className="text-sm mb-4" style={{ color: "var(--color-ink-3)" }}>
        Goście to osoby zabierające głos bez konta i bez prawa głosu (np. dyrektorzy wydziałów, zaproszeni eksperci). Katalog pozwala szybko dodać ich do listy mówców na posiedzeniu.
      </p>

      <input className="input mb-4" placeholder="Wyszukaj gościa…" value={filter} onChange={(e) => setFilter(e.target.value)} />

      {(adding || editing) && (
        <GuestForm
          guest={editing}
          pending={pending}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); reload(); }}
        />
      )}

      <div className="card divide-y divide-[var(--color-rule-soft)]">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-sm text-center" style={{ color: "var(--color-ink-3)" }}>
            {guests.length === 0 ? "Brak gości w katalogu." : "Brak wyników."}
          </div>
        )}
        {filtered.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{g.lastName} {g.firstName}</div>
              <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>
                {[g.role, g.clubShort].filter(Boolean).join(" - ") || "-"}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => { setEditing(g); setAdding(false); }}>Edytuj</button>
              <button className="btn" style={{ padding: "3px 10px", fontSize: 12, color: "var(--color-no)" }} disabled={pending} onClick={() => remove(g)}>Usuń</button>
            </div>
          </div>
        ))}
      </div>
    </div>
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
    if (!firstName.trim() || !lastName.trim()) { alert("Podaj imię i nazwisko."); return; }
    setSaving(true);
    const body = {
      firstName: firstName.trim(), lastName: lastName.trim(),
      role: role.trim() || null, clubShort: clubShort.trim() || null,
    };
    const r = guest
      ? await fetch(`/api/guests/${guest.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/guests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { alert(await r.text()); return; }
    onSaved();
  }

  return (
    <form onSubmit={save} className="card p-4 mb-4 space-y-3">
      <div className="text-sm font-semibold">{guest ? "Edytuj gościa" : "Nowy gość"}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Nazwisko</label>
          <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Imię</label>
          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Funkcja / stanowisko</label>
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="np. Dyrektor Wydziału Edukacji" />
        </div>
        <div>
          <label className="label">Podmiot (skrót, opcjonalnie)</label>
          <input className="input" value={clubShort} onChange={(e) => setClubShort(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || saving}>{saving ? "Zapisywanie…" : "Zapisz"}</button>
        <button type="button" className="btn" onClick={onCancel}>Anuluj</button>
      </div>
    </form>
  );
}
