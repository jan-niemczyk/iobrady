"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { MeetingParticipantsData } from "@/lib/meetingParticipantsData";
import Link from "next/link";
import { IconArrowLeft, IconTrash } from "@/components/ui/Icon";
import { CardHeader, PageContainer, PageHeader } from "./ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";

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
  meetingId, meetingName, meetingNumber, assigned: initialAssigned, available: initialAvailable, agenda = [], orgUnits = [], meetingStatus, embedded, onChanged,
}: {
  meetingId: string;
  meetingName: string;
  meetingNumber: string;
  assigned: AssignedParticipant[];
  available: AvailableUser[];
  agenda?: { id: string; number: string; title: string }[];
  orgUnits?: { id: string; name: string; memberCount: number; linked: boolean }[];
  meetingStatus?: string;
  /** Osadzony w planerze panelu posiedzenia - bez nagłówka strony, odświeżanie przez onChanged. */
  embedded?: boolean;
  onChanged?: () => void;
}) {
  const [assigned, setAssigned] = useState(initialAssigned);
  const [available, setAvailable] = useState(initialAvailable);
  const [pending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  function refetch() {
    if (onChanged) onChanged();
    else window.location.reload();
  }

  function act(method: string, url: string, body?: object) {
    startTransition(async () => {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) { await notifyFailure(r); return; }
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

  const patch = (p: AssignedParticipant, body: object) => act("PATCH", `/api/meeting-participants/${p.id}`, body);

  const body = (
    <>
      <OrgUnitsBar meetingId={meetingId} orgUnits={orgUnits} meetingStatus={meetingStatus} pending={pending} onChanged={refetch} />

      <div className="row g-3 align-items-start">
        {/* Przypisani */}
        <section className="col-12 col-xl-8">
          <div className="card">
            <CardHeader title={<>Przypisani do posiedzenia <span className="text-body-secondary fw-normal">({assigned.length})</span></>} />
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Osoba</th>
                    <th className="text-center" title="Prawo głosu w tym posiedzeniu">Głos</th>
                    <th className="text-center" title="Zaproszony gość - bez prawa głosu, może zgłaszać się do dyskusji">Gość</th>
                    <th className="text-center" title="Przewodniczący tego posiedzenia - prowadzi obrady i głosuje">Przew.</th>
                    <th className="text-center" title="Prawo zgłoszenia się do dyskusji z priorytetem">Priorytet</th>
                    <th className="text-center" title="Dostęp do widoku 'wyświetlacz' (wąskie okno nakładane na stream/prezentację)">Wyświetlacz</th>
                    <th className="text-center" title="Wykluczony z posiedzenia - nie może się zapisywać do dyskusji ani głosować">Wykluczony</th>
                    <th><span className="visually-hidden">Akcje</span></th>
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((p) => (
                    <tr key={p.id} className={p.excludedFromMeeting ? "opacity-50" : undefined}>
                      <td style={{ minWidth: 160 }}>
                        <div className="fw-medium">{p.name}</div>
                        {p.groupShort && (
                          <div className="small d-flex align-items-center gap-1 text-body-secondary">
                            <span className="rounded-circle flex-shrink-0" style={{ width: 8, height: 8, background: p.groupColor ?? "var(--bs-secondary)" }} />
                            {p.groupShort}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <label className="cell-hit">
                        <input className="form-check-input m-0" type="checkbox" aria-label={`Prawo głosu: ${p.name}`}
                          title={p.isInvitedGuest ? "Gość nie głosuje i nie wlicza się do kworum" : undefined}
                          disabled={p.isInvitedGuest}
                          checked={p.hasVotingRight && !p.isInvitedGuest} onChange={(e) => patch(p, { hasVotingRight: e.target.checked })} />
                        </label>
                      </td>
                      <td className="text-center">
                        <label className="cell-hit">
                        <input className="form-check-input m-0" type="checkbox" aria-label={`Gość: ${p.name}`}
                          checked={p.isInvitedGuest} onChange={(e) => patch(p, e.target.checked ? { isInvitedGuest: true, hasVotingRight: false } : { isInvitedGuest: false })} />
                        </label>
                      </td>
                      <td className="text-center">
                        <label className="cell-hit">
                        <input className="form-check-input m-0" type="checkbox" aria-label={`Przewodniczący: ${p.name}`} title="Przewodniczący tego posiedzenia"
                          checked={p.isChairperson ?? false} onChange={(e) => patch(p, { isChairperson: e.target.checked })} />
                        </label>
                      </td>
                      <td className="text-center">
                        <label className="cell-hit">
                        <input className="form-check-input m-0" type="checkbox" aria-label={`Priorytet: ${p.name}`}
                          checked={p.hasPriorityRight ?? false} onChange={(e) => patch(p, { hasPriorityRight: e.target.checked })} />
                        </label>
                        {p.hasPriorityRight && agenda.length > 0 && (
                          <div className="mt-1">
                            <div className="small text-body-secondary">Zakres priorytetu</div>
                            <div className="d-flex flex-wrap justify-content-center gap-1 mt-1 mx-auto" style={{ maxWidth: 200 }}>
                              {(() => {
                                const sel: string[] = p.priorityAgendaItemIds ?? (p.priorityAgendaItemId ? [p.priorityAgendaItemId] : []);
                                const isGlobal = sel.length === 0;
                                const toggle = (id: string) => {
                                  const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
                                  patch(p, { priorityAgendaItemIds: next, priorityAgendaItemId: null });
                                };
                                const chip = (on: boolean) => `btn btn-sm py-0 px-2 ${on ? "btn-success" : ""}`;
                                return (
                                  <>
                                    <button
                                      className={chip(isGlobal)}
                                      aria-pressed={isGlobal}
                                      onClick={() => patch(p, { priorityAgendaItemIds: [], priorityAgendaItemId: null })}
                                      title="Priorytet przez całe posiedzenie"
                                    >Globalny</button>
                                    {agenda.map((a) => {
                                      const on = sel.includes(a.id);
                                      return (
                                        <button key={a.id} className={chip(on)} aria-pressed={on} onClick={() => toggle(a.id)} title={`Priorytet w punkcie ${a.number}`}>
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
                      <td className="text-center">
                        <label className="cell-hit">
                        <input className="form-check-input m-0" type="checkbox" aria-label={`Wyświetlacz: ${p.name}`}
                          title="Dostęp do widoku 'wyświetlacz' (wąskie okno nakładane na stream)"
                          checked={p.canUseMiniDisplay ?? false} onChange={(e) => patch(p, { canUseMiniDisplay: e.target.checked })} />
                        </label>
                      </td>
                      <td className="text-center">
                        <label className="cell-hit">
                        <input className="form-check-input m-0" type="checkbox" aria-label={`Wykluczony: ${p.name}`} title="Wykluczony z posiedzenia"
                          checked={p.excludedFromMeeting ?? false} onChange={(e) => patch(p, { excludedFromMeeting: e.target.checked })} />
                        </label>
                      </td>
                      <td className="text-end">
                        <button
                          className="btn btn-sm btn-link text-body-secondary agenda-del p-0"
                          style={{ minWidth: 36, minHeight: 36 }}
                          title="Usuń z posiedzenia"
                          aria-label={`Usuń z posiedzenia: ${p.name}`}
                          onClick={async () => { if (await ask({ title: "Usunąć z posiedzenia?", message: `${p.name} zostanie usunięty z listy uczestników tego posiedzenia.`, confirmLabel: "Usuń", danger: true })) act("DELETE", `/api/meeting-participants/${p.id}`); }}
                        ><IconTrash size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {assigned.length === 0 && (
                    <tr><td colSpan={8} className="py-4 text-center text-body-secondary">Brak - dodaj uczestników z listy dostępnych.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Dostępni */}
        <section className="col-12 col-xl-4">
          <div className="card">
            <CardHeader
              title={<>Dostępni do dodania <span className="text-body-secondary fw-normal">({filteredAvailable.length})</span></>}
              right={<button className="btn btn-link btn-sm p-0" onClick={selectAllVisible} disabled={filteredAvailable.length === 0}>Zaznacz wszystkich widocznych</button>}
            />
            <div className="card-body py-2 border-bottom">
              <input
                className="form-control form-control-sm"
                placeholder="Wyszukaj…"
                aria-label="Wyszukaj osobę"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            {filteredAvailable.length === 0 ? (
              <div className="card-body text-body-secondary">Brak.</div>
            ) : (
              <div className="list-group list-group-flush overflow-auto" style={{ maxHeight: 480 }}>
                {filteredAvailable.map((u) => (
                  <label key={u.id} className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-2">
                    <input className="form-check-input" type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelected(u.id)} />
                    <div className="flex-grow-1 min-w-0">
                      <div>{u.name}</div>
                      <div className="small text-truncate text-body-secondary">{u.email}</div>
                    </div>
                    {u.groupShort && (
                      <span className="small d-flex align-items-center gap-1 flex-shrink-0 text-body-secondary">
                        <span className="rounded-circle" style={{ width: 8, height: 8, background: u.groupColor ?? "var(--bs-secondary)" }} />
                        {u.groupShort}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
            {selectedIds.size > 0 && (
              <div className="card-footer d-flex align-items-center justify-content-between flex-wrap gap-2">
                <span>Zaznaczono: <strong>{selectedIds.size}</strong></span>
                <div className="d-flex flex-wrap gap-2">
                  <button className="btn btn-sm" onClick={() => addSelected(false, true)} disabled={pending}>+ Dodaj jako gości</button>
                  <button className="btn btn-sm btn-primary" onClick={() => addSelected(true, false)} disabled={pending}>+ Dodaj z prawem głosu</button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );

  if (embedded) {
    return (
      <section>
        <h2 className="h5 mb-3">Skład posiedzenia</h2>
        {body}
      </section>
    );
  }

  return (
    <PageContainer size="xl">
      <PageHeader
        kicker={<>Posiedzenie nr <span className="num">{meetingNumber}</span> - Uczestnicy</>}
        title={meetingName}
        actions={<Link href={`/meetings/${meetingId}`} className="btn"><IconArrowLeft size={13} /> Wróć do panelu</Link>}
      />
      {body}
    </PageContainer>
  );
}

/** Skład posiedzenia w planerze panelu - pobiera dane z API i odświeża po każdej zmianie. */
export function MeetingParticipantsLoader({ meetingId }: { meetingId: string; meetingName?: string; meetingNumber?: string }) {
  const [data, setData] = useState<MeetingParticipantsData | null>(null);
  const [version, setVersion] = useState(0);
  const load = useCallback(async () => {
    const r = await fetch(`/api/meetings/${meetingId}/participants/editor`, { cache: "no-store" });
    if (r.ok) { setData(await r.json()); setVersion((v) => v + 1); }
  }, [meetingId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="text-body-secondary small">Wczytywanie składu posiedzenia…</div>;
  return <MeetingParticipantsClient key={version} {...data} embedded onChanged={load} />;
}


/**
 * Grupy organizacyjne posiedzenia: przypisanie (wczytuje skład, bez nadpisywania praw osób już
 * przypisanych), odłączenie (skład bez zmian) oraz podgląd różnic i świadome uzupełnienie składu.
 */
function OrgUnitsBar({ meetingId, orgUnits, meetingStatus, pending, onChanged }: {
  meetingId: string;
  orgUnits: { id: string; name: string; memberCount: number; linked: boolean }[];
  meetingStatus?: string;
  pending: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<null | { missing: { userId: string; name: string; units: string[]; votingRight: boolean }[]; extra: { participantId: string; name: string }[] }>(null);
  const locked = meetingStatus === "CLOSED" || meetingStatus === "ARCHIVED" || meetingStatus === "CANCELLED";
  const linked = orgUnits.filter((o) => o.linked);
  if (orgUnits.length === 0) return null;

  async function post(body: object, msg: (d: { added: number; skipped: number }) => string) {
    setBusy(true);
    const r = await fetch(`/api/meetings/${meetingId}/org-units`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success(msg(await r.json()));
    setDiff(null);
    onChanged();
  }

  return (
    <div className="card mb-3">
      <div className="card-body d-flex flex-column gap-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="fw-semibold me-1">Grupy organizacyjne posiedzenia:</span>
          {linked.length === 0 && <span className="text-body-secondary small">brak przypisanych</span>}
          {linked.map((o) => (
            <span key={o.id} className="badge text-bg-light border d-inline-flex align-items-center gap-1 fw-normal" style={{ fontSize: ".8125rem" }}>
              {o.name}
              <button type="button" className="btn btn-sm btn-link p-0 ms-1 text-body-secondary" disabled={busy || pending}
                aria-label={`Odłącz grupę ${o.name}`} title="Odłącz grupę (skład posiedzenia bez zmian)"
                onClick={async () => { if (await ask({ title: "Odłączyć grupę?", message: `Posiedzenie przestanie być przypisane do „${o.name}”. Uczestnicy i ich prawa zostaną bez zmian.`, confirmLabel: "Odłącz" })) post({ action: "unlink", orgUnitIds: [o.id] }, () => "Odłączono grupę."); }}>
                <IconTrash size={13} />
              </button>
            </span>
          ))}
        </div>
        {!locked && (
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="small text-body-secondary">Przypisz i wczytaj skład:</span>
            {orgUnits.filter((o) => !o.linked).map((o) => (
              <button key={o.id} type="button" className="btn btn-sm btn-outline-primary" disabled={busy || pending}
                onClick={async () => {
                  if (!(await ask({ title: "Przypisać grupę do posiedzenia?", message: `Zostaną dodane osoby ze składu „${o.name}” (${o.memberCount}) z ich domyślnym prawem głosu. Osoby już przypisane do posiedzenia zostaną pominięte - ich prawa się nie zmienią.`, confirmLabel: "Przypisz i dodaj" }))) return;
                  post({ action: "link", orgUnitIds: [o.id] }, (d) => `Dodano ${d.added}, pominięto ${d.skipped} (już przypisani).`);
                }}>
                {o.name} <span className="opacity-75">({o.memberCount})</span>
              </button>
            ))}
            {linked.length > 0 && (
              <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy}
                onClick={async () => { const r = await fetch(`/api/meetings/${meetingId}/org-units`, { cache: "no-store" }); if (!r.ok) { await notifyFailure(r); return; } setDiff(await r.json()); }}>
                Porównaj ze składem grup
              </button>
            )}
          </div>
        )}
        {locked && <div className="small text-body-secondary">Posiedzenie zakończone - jego skład i prawa nie są aktualizowane ze składu grup.</div>}
        {diff && (
          <div className="border rounded p-2 small">
            {diff.missing.length === 0 && diff.extra.length === 0 && <div>Skład posiedzenia zgadza się ze składem przypisanych grup.</div>}
            {diff.missing.length > 0 && (
              <div className="mb-2">
                <div className="fw-semibold">W grupach, a nie w posiedzeniu ({diff.missing.length}):</div>
                <div>{diff.missing.map((m) => `${m.name}${m.votingRight ? "" : " (bez prawa głosu)"}`).join(", ")}</div>
                <button type="button" className="btn btn-sm btn-primary mt-1" disabled={busy} onClick={() => post({ action: "sync" }, (d) => `Dodano ${d.added} os. do posiedzenia.`)}>Dodaj brakujące osoby</button>
              </div>
            )}
            {diff.extra.length > 0 && (
              <div>
                <div className="fw-semibold">W posiedzeniu, a nie w składzie grup ({diff.extra.length}):</div>
                <div>{diff.extra.map((m) => m.name).join(", ")}</div>
                <div className="text-body-secondary">Te osoby pozostają w posiedzeniu - usuń je ręcznie w tabeli, jeśli to potrzebne.</div>
              </div>
            )}
            <button type="button" className="btn btn-sm btn-link px-0" onClick={() => setDiff(null)}>Zamknij porównanie</button>
          </div>
        )}
      </div>
    </div>
  );
}
