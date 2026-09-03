"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@/components/ui/Icon";

interface AssignedParticipant {
  id: string; userId: string; name: string;
  groupShort: string | null; groupColor: string | null;
  hasVotingRight: boolean; isInvitedGuest: boolean; isChairperson?: boolean; hasPriorityRight?: boolean; canUseMiniDisplay?: boolean; excludedFromMeeting?: boolean;
  priorityAgendaItemId?: string | null;
  priorityAgendaItemIds?: string[];
}

interface AvailableUser {
  id: string; name: string; email: string;
  groupShort: string | null; groupColor: string | null;
}

export function MeetingParticipantsClient({
  meetingId, meetingName, meetingNumber, assigned: initialAssigned, available: initialAvailable, agenda = [], templates = [],
}: {
  meetingId: string;
  meetingName: string;
  meetingNumber: string;
  assigned: AssignedParticipant[];
  available: AvailableUser[];
  agenda?: { id: string; number: string; title: string }[];
  templates?: { id: string; name: string; memberCount: number }[];
}) {
  const [assigned, setAssigned] = useState(initialAssigned);
  const [available, setAvailable] = useState(initialAvailable);
  const [pending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  function refetch() {
    window.location.reload();
  }

  function act(method: string, url: string, body?: object) {
    startTransition(async () => {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) { alert(await r.text()); return; }
      refetch();
    });
  }

  function toggleSelected(id: string) {
    const ns = new Set(selectedIds);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSelectedIds(ns);
  }

  function selectAllVisible() {
    const ns = new Set(selectedIds);
    filteredAvailable.forEach((u) => ns.add(u.id));
    setSelectedIds(ns);
  }

  function addSelected(asVoting: boolean, asGuest: boolean) {
    if (selectedIds.size === 0) return;
    act("POST", `/api/meetings/${meetingId}/participants`, {
      userIds: Array.from(selectedIds),
      hasVotingRight: asVoting, isInvitedGuest: asGuest,
    });
  }

  const filteredAvailable = available.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="px-6 py-8 max-w-[1200px] mx-auto">
      <header className="flex items-end justify-between border-b border-[var(--color-rule)] pb-6 mb-8">
        <div>
          <div className="eyebrow mb-2">Posiedzenie nr <span className="mono">{meetingNumber}</span> - Uczestnicy</div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>{meetingName}</h1>
        </div>
        <Link href={`/meetings/${meetingId}`} className="btn"><IconArrowLeft size={13} /> Wróć do panelu</Link>
      </header>

      {templates.length > 0 && (
        <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
          <span className="eyebrow">Zastosuj szablon składu:</span>
          {templates.map((t) => (
            <button
              key={t.id}
              className="btn"
              style={{ padding: "5px 12px", fontSize: 12 }}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Dodać uczestników z szablonu „${t.name}" (${t.memberCount})? Osoby już przypisane zostaną pominięte.`)) return;
                startTransition(async () => {
                  const r = await fetch(`/api/meetings/${meetingId}/apply-template`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: t.id }),
                  });
                  if (!r.ok) { alert(await r.text()); return; }
                  const d = await r.json();
                  alert(`Dodano ${d.added}, pominięto ${d.skipped} (już przypisani).`);
                  refetch();
                });
              }}
            >
              {t.name} <span style={{ color: "var(--color-ink-3)" }}>({t.memberCount})</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Przypisani */}
        <section>
          <h2 className="eyebrow mb-3">Przypisani do posiedzenia ({assigned.length})</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--color-paper-2)" }}>
                <tr className="text-left">
                  <th className="eyebrow px-3 py-2 font-normal">Osoba</th>
                  <th className="eyebrow px-3 py-2 font-normal" style={{ width: 70 }}>Głos</th>
                  <th className="eyebrow px-3 py-2 font-normal" style={{ width: 70 }}>Gość</th>
                  <th className="eyebrow px-3 py-2 font-normal" style={{ width: 70 }} title="Przewodniczący tego posiedzenia - prowadzi obrady i głosuje">Przew.</th>
                  <th className="eyebrow px-3 py-2 font-normal" style={{ width: 80 }} title="Prawo zgłoszenia się do dyskusji z priorytetem">Priorytet</th>
                  <th className="eyebrow px-3 py-2 font-normal" style={{ width: 90 }} title="Dostęp do widoku 'wyświetlacz' (wąskie okno nakładane na stream/prezentację)">Wyświetlacz</th>
                  <th className="eyebrow px-3 py-2 font-normal" style={{ width: 90 }} title="Wykluczony z posiedzenia - nie może się zapisywać do dyskusji ani głosować">Wykluczony</th>
                  <th className="eyebrow px-3 py-2 font-normal text-right" style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {assigned.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--color-rule-soft)]" style={p.excludedFromMeeting ? { opacity: 0.5 } : undefined}>
                    <td className="px-3 py-2">
                      <div>{p.name}</div>
                      {p.groupShort && (
                        <div className="text-xs" style={{ color: p.groupColor ?? "var(--color-ink-3)" }}>{p.groupShort}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.hasVotingRight}
                        onChange={(e) => act("PATCH", `/api/meeting-participants/${p.id}`, { hasVotingRight: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.isInvitedGuest}
                        onChange={(e) => act("PATCH", `/api/meeting-participants/${p.id}`, { isInvitedGuest: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.isChairperson ?? false}
                        onChange={(e) => act("PATCH", `/api/meeting-participants/${p.id}`, { isChairperson: e.target.checked })}
                        title="Przewodniczący tego posiedzenia"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.hasPriorityRight ?? false}
                        onChange={(e) => act("PATCH", `/api/meeting-participants/${p.id}`, { hasPriorityRight: e.target.checked })}
                      />
                      {p.hasPriorityRight && agenda.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 9, color: "var(--color-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Zakres priorytetu</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3, maxWidth: 200, justifyContent: "center" }}>
                            {(() => {
                              const sel: string[] = p.priorityAgendaItemIds ?? (p.priorityAgendaItemId ? [p.priorityAgendaItemId] : []);
                              const isGlobal = sel.length === 0;
                              const toggle = (id: string) => {
                                const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
                                act("PATCH", `/api/meeting-participants/${p.id}`, { priorityAgendaItemIds: next, priorityAgendaItemId: null });
                              };
                              return (
                                <>
                                  <button
                                    className="pill"
                                    style={{ cursor: "pointer", fontSize: 10, padding: "1px 7px", background: isGlobal ? "var(--color-yes)" : undefined, color: isGlobal ? "#fff" : undefined, borderColor: isGlobal ? "var(--color-yes)" : undefined }}
                                    onClick={() => act("PATCH", `/api/meeting-participants/${p.id}`, { priorityAgendaItemIds: [], priorityAgendaItemId: null })}
                                    title="Priorytet przez całe posiedzenie"
                                  >Globalny</button>
                                  {agenda.map((a) => {
                                    const on = sel.includes(a.id);
                                    return (
                                      <button key={a.id} className="pill" style={{ cursor: "pointer", fontSize: 10, padding: "1px 7px", background: on ? "var(--color-yes)" : undefined, color: on ? "#fff" : undefined, borderColor: on ? "var(--color-yes)" : undefined }} onClick={() => toggle(a.id)} title={`Priorytet w punkcie ${a.number}`}>
                                        {a.number}
                                      </button>
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.canUseMiniDisplay ?? false}
                        title="Dostęp do widoku 'wyświetlacz' (wąskie okno nakładane na stream)"
                        onChange={(e) => act("PATCH", `/api/meeting-participants/${p.id}`, { canUseMiniDisplay: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.excludedFromMeeting ?? false}
                        title="Wykluczony z posiedzenia"
                        onChange={(e) => act("PATCH", `/api/meeting-participants/${p.id}`, { excludedFromMeeting: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="btn btn-danger" style={{ padding: "2px 6px", fontSize: 11 }}
                        onClick={() => { if (window.confirm("Usunąć z posiedzenia?")) act("DELETE", `/api/meeting-participants/${p.id}`); }}
                      >Usuń</button>
                    </td>
                  </tr>
                ))}
                {assigned.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm" style={{ color: "var(--color-ink-3)" }}>Brak - dodaj uczestników z prawej strony.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Dostępni */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="eyebrow">Dostępni do dodania ({filteredAvailable.length})</h2>
            <button className="text-xs underline underline-offset-2" onClick={selectAllVisible}>
              Zaznacz wszystkich widocznych
            </button>
          </div>
          <input
            className="input mb-3"
            placeholder="Wyszukaj…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="card overflow-hidden">
            <ul className="divide-y divide-[var(--color-rule-soft)] max-h-[480px] overflow-y-auto">
              {filteredAvailable.map((u) => (
                <li key={u.id}>
                  <label className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-paper-2)] cursor-pointer">
                    <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelected(u.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{u.name}</div>
                      <div className="text-xs mono truncate" style={{ color: "var(--color-ink-3)" }}>{u.email}</div>
                    </div>
                    {u.groupShort && <span className="eyebrow shrink-0" style={{ color: u.groupColor ?? undefined }}>{u.groupShort}</span>}
                  </label>
                </li>
              ))}
              {filteredAvailable.length === 0 && <li className="px-3 py-4 text-xs" style={{ color: "var(--color-ink-3)" }}>Brak.</li>}
            </ul>
          </div>

          {selectedIds.size > 0 && (
            <div className="card mt-3 p-3 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm">Zaznaczono: <strong>{selectedIds.size}</strong></span>
              <div className="flex gap-2">
                <button className="btn" onClick={() => addSelected(false, true)} disabled={pending}>+ Dodaj jako gości</button>
                <button className="btn btn-primary" onClick={() => addSelected(true, false)} disabled={pending}>+ Dodaj z prawem głosu</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
