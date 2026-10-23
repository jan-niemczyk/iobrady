"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CardHeader, PageContainer, PageHeader } from "./ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { IconPlus, IconSearch, IconTrash } from "@/components/ui/Icon";
import { MEETING_STATUS_LABEL } from "@/lib/labels";
import type { MeetingStatus } from "@prisma/client";

const KIND_LABEL: Record<string, string> = {
  UNCLASSIFIED: "Bez klasyfikacji", BODY: "Organ", COMMITTEE: "Komisja", TEAM: "Zespół", OTHER: "Inna grupa",
};

interface UnitRow {
  id: string; name: string; shortName: string | null; kind: string; active: boolean; legacyTemplateId: string | null;
  parent: { id: string; name: string } | null; _count: { members: number; meetings: number };
}
interface Member {
  id: string; userId: string; functionName: string | null; defaultVotingRight: boolean;
  validFrom: string | null; validTo: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; active: boolean; group: { shortName: string | null; name: string } | null };
}
interface UnitDetail extends Omit<UnitRow, "_count" | "parent"> {
  description: string | null; parentId: string | null;
  members: Member[];
  meetings: { meeting: { id: string; number: string; name: string; scheduledAt: string; status: string } }[];
}
interface UserOption { id: string; name: string; email: string; club: string | null }

const d10 = (s: string | null) => (s ? s.slice(0, 10) : "");
const fmtDay = (s: string | null) => (s ? new Date(s).toLocaleDateString("pl-PL") : "");

/**
 * Grupy organizacyjne: trwałe organy, komisje i zespoły z własnym składem, funkcjami i okresami
 * członkostwa. Niezależne od klubów i kół (przynależność klubowa jest osobną funkcją).
 */
export function OrgUnitsManagerClient({ users, initialSelectedId }: { users: UserOption[]; initialSelectedId: string | null }) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("COMMITTEE");

  const loadUnits = useCallback(async () => {
    const r = await fetch(`/api/org-units?all=1`, { cache: "no-store" });
    if (r.ok) setUnits(await r.json());
    setLoading(false);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/org-units/${id}`, { cache: "no-store" });
    if (r.ok) setDetail(await r.json()); else setDetail(null);
  }, []);
  useEffect(() => { loadUnits(); }, [loadUnits]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);

  const visible = units.filter((u) => showArchived || u.active);

  function call(method: string, url: string, body?: unknown, okMsg?: string) {
    return new Promise<boolean>((resolve) => startTransition(async () => {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) { await notifyFailure(r); resolve(false); return; }
      if (okMsg) notify.success(okMsg);
      await loadUnits();
      if (selectedId) await loadDetail(selectedId);
      resolve(true);
    }));
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    const r = await fetch("/api/org-units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind: newKind }) });
    if (!r.ok) { await notifyFailure(r); return; }
    const d = await r.json();
    setNewName("");
    notify.success("Utworzono grupę.");
    await loadUnits();
    setSelectedId(d.id);
  }

  return (
    <PageContainer size="xl">
      <PageHeader
        kicker="Osoby i grupy"
        title="Grupy organizacyjne"
        actions={<>
          <Link className="btn btn-outline-secondary" href="/clubs">Kluby i koła</Link>
          <Link className="btn btn-outline-secondary" href="/notice-templates">Szablony dokumentów</Link>
        </>}
      />

      <div className="row g-3 align-items-start">
        <div className="col-12 col-lg-4 col-xxl-3">
          <div className="card">
            <CardHeader title="Grupy" right={
              <div className="form-check form-switch mb-0 small">
                <input className="form-check-input" type="checkbox" id="ou-arch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                <label className="form-check-label" htmlFor="ou-arch">Archiwalne</label>
              </div>
            } />
            {loading ? <div className="card-body text-body-secondary">Wczytywanie…</div>
              : visible.length === 0 ? <div className="card-body text-body-secondary">Brak grup. Utwórz pierwszą poniżej.</div>
              : (
                <div className="list-group list-group-flush">
                  {visible.map((u) => (
                    <button key={u.id} type="button" onClick={() => setSelectedId(u.id)}
                      className={`list-group-item list-group-item-action py-2${u.id === selectedId ? " active" : ""}`}
                      aria-current={u.id === selectedId ? "true" : undefined}>
                      <div className="d-flex justify-content-between gap-2">
                        <span className="fw-medium text-break">{u.name}</span>
                        {!u.active && <span className="badge text-bg-secondary align-self-start">archiwalna</span>}
                      </div>
                      <div className={`small ${u.id === selectedId ? "opacity-75" : "text-body-secondary"}`}>
                        {KIND_LABEL[u.kind]}{u.parent ? ` - ${u.parent.name}` : ""} - {u._count.members} członk., {u._count.meetings} posiedz.
                      </div>
                    </button>
                  ))}
                </div>
              )}
            <div className="card-footer">
              <form className="d-flex flex-column gap-2" onSubmit={(e) => { e.preventDefault(); create(); }}>
                <label className="form-label small mb-0" htmlFor="ou-new">Nowa grupa</label>
                <input id="ou-new" className="form-control" placeholder="np. Komisja Budżetowa" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} />
                <div className="d-flex gap-2">
                  <select className="form-select" aria-label="Typ nowej grupy" value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                    {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <button type="submit" className="btn btn-primary text-nowrap" disabled={!newName.trim() || pending}><IconPlus /> Utwórz</button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-8 col-xxl-9">
          {!detail ? (
            <div className="card"><div className="card-body text-body-secondary py-4 text-center">Nie wybrano grupy.</div></div>
          ) : (
            <UnitEditor key={detail.id} unit={detail} units={units} users={users} pending={pending} call={call} />
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function UnitEditor({ unit, units, users, pending, call }: {
  unit: UnitDetail; units: UnitRow[]; users: UserOption[]; pending: boolean;
  call: (method: string, url: string, body?: unknown, okMsg?: string) => Promise<boolean>;
}) {
  const [form, setForm] = useState({ name: unit.name, shortName: unit.shortName ?? "", description: unit.description ?? "", kind: unit.kind, parentId: unit.parentId ?? "" });
  const dirty = form.name !== unit.name || form.shortName !== (unit.shortName ?? "") || form.description !== (unit.description ?? "") || form.kind !== unit.kind || form.parentId !== (unit.parentId ?? "");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addFn, setAddFn] = useState("");
  const [addVote, setAddVote] = useState(true);
  const [addFrom, setAddFrom] = useState("");
  const [memberQ, setMemberQ] = useState("");
  const [showEnded, setShowEnded] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const isEnded = (m: Member) => !!m.validTo && d10(m.validTo) < today;
  const members = useMemo(() => [...unit.members]
    .filter((m) => showEnded || !isEnded(m))
    .filter((m) => !memberQ.trim() || `${m.user.lastName} ${m.user.firstName} ${m.functionName ?? ""}`.toLocaleLowerCase("pl").includes(memberQ.trim().toLocaleLowerCase("pl")))
    .sort((a, b) => `${a.user.lastName} ${a.user.firstName}`.localeCompare(`${b.user.lastName} ${b.user.firstName}`, "pl")),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [unit.members, showEnded, memberQ]);
  const openMemberIds = new Set(unit.members.filter((m) => !isEnded(m)).map((m) => m.userId));
  const candidates = users.filter((u) => !openMemberIds.has(u.id) && (!q.trim() || `${u.name} ${u.email}`.toLocaleLowerCase("pl").includes(q.trim().toLocaleLowerCase("pl"))));
  const endedCount = unit.members.filter(isEnded).length;

  async function addPicked() {
    if (picked.size === 0) return;
    const ok = await call("POST", `/api/org-units/${unit.id}/members`, { userIds: [...picked], functionName: addFn || null, defaultVotingRight: addVote, validFrom: addFrom || null }, `Dodano do składu: ${picked.size}`);
    if (ok) { setPicked(new Set()); setAddFn(""); }
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card">
        <CardHeader title={unit.name} sub={unit.legacyTemplateId ? "Grupa przeniesiona z dawnego szablonu składu - sklasyfikuj jej typ." : undefined} right={
          unit.active
            ? <button className="btn btn-outline-secondary" disabled={pending} onClick={async () => {
                if (await ask({ title: "Zarchiwizować grupę?", message: "Grupa zniknie z wyboru przy nowych posiedzeniach. Skład, historia i zapisane posiedzenia zostaną bez zmian.", confirmLabel: "Archiwizuj" }))
                  call("PATCH", `/api/org-units/${unit.id}`, { active: false }, "Zarchiwizowano grupę.");
              }}>Archiwizuj</button>
            : <button className="btn btn-outline-primary" disabled={pending} onClick={() => call("PATCH", `/api/org-units/${unit.id}`, { active: true }, "Przywrócono grupę.")}>Przywróć</button>
        } />
        <div className="card-body">
          <form className="row g-3" onSubmit={(e) => { e.preventDefault(); call("PATCH", `/api/org-units/${unit.id}`, { ...form, shortName: form.shortName || null, description: form.description || null, parentId: form.parentId || null }, "Zapisano."); }}>
            <div className="col-12 col-md-6">
              <label className="form-label" htmlFor="ou-name">Nazwa</label>
              <input id="ou-name" className="form-control" value={form.name} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label" htmlFor="ou-short">Skrót <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label>
              <input id="ou-short" className="form-control" value={form.shortName} maxLength={40} onChange={(e) => setForm({ ...form, shortName: e.target.value })} />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label" htmlFor="ou-kind">Typ</label>
              <select id="ou-kind" className="form-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label" htmlFor="ou-parent">Organ nadrzędny <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label>
              <select id="ou-parent" className="form-select" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">- brak -</option>
                {units.filter((u) => u.id !== unit.id && u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label" htmlFor="ou-desc">Opis <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label>
              <input id="ou-desc" className="form-control" value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="col-12 d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-outline-secondary" disabled={pending} onClick={async () => {
                const name = `${unit.name} (kopia)`;
                const r = await fetch("/api/org-units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind: unit.kind, copyMembersFromId: unit.id }) });
                if (!r.ok) { await notifyFailure(r); return; }
                notify.success(`Utworzono „${name}” ze składem tej grupy.`);
                await call("GET", "/api/org-units");
              }}>Powiel ze składem</button>
              <button type="submit" className="btn btn-primary" disabled={!dirty || pending}>Zapisz zmiany</button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <CardHeader
          title={<>Skład <span className="text-body-secondary fw-normal">({unit.members.length - endedCount}{endedCount ? ` + ${endedCount} zakończonych` : ""})</span></>}
          right={<>
            <div className="input-group input-group-sm" style={{ maxWidth: 240 }}>
              <span className="input-group-text"><IconSearch /></span>
              <input className="form-control" placeholder="Szukaj w składzie" aria-label="Szukaj w składzie" value={memberQ} onChange={(e) => setMemberQ(e.target.value)} />
            </div>
            {endedCount > 0 && (
              <div className="form-check mb-0 small">
                <input className="form-check-input" type="checkbox" id="ou-ended" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
                <label className="form-check-label" htmlFor="ou-ended">Pokaż zakończone</label>
              </div>
            )}
          </>}
        />
        {members.length === 0 ? <div className="card-body text-body-secondary">Skład jest pusty.</div> : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Osoba</th>
                  <th>Funkcja w grupie</th>
                  <th className="text-center">Domyślne prawo głosu</th>
                  <th>Członek od</th>
                  <th>Członek do</th>
                  <th><span className="visually-hidden">Akcje</span></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <MemberRow key={m.id} unitId={unit.id} m={m} ended={isEnded(m)} pending={pending} call={call} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-footer small text-body-secondary">
          Zakończenie członkostwa: wpisz datę w kolumnie „do” - historia zostaje. Usunięcie wpisu służy do poprawienia pomyłki. Zmiana składu nie przepisuje zakończonych posiedzeń.
        </div>
      </div>

      <div className="card">
        <CardHeader title="Dodaj do składu" right={
          <div className="input-group input-group-sm" style={{ maxWidth: 260 }}>
            <span className="input-group-text"><IconSearch /></span>
            <input className="form-control" placeholder="Szukaj osoby" aria-label="Szukaj osoby do dodania" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        } />
        <div className="card-body">
          {candidates.length === 0 ? <p className="text-body-secondary mb-0">Brak osób do dodania.</p> : (
            <div className="border rounded overflow-auto mb-3" style={{ maxHeight: 280 }}>
              <ul className="list-group list-group-flush">
                {candidates.slice(0, 200).map((u) => (
                  <li key={u.id} className="list-group-item py-1">
                    <div className="form-check mb-0 cell-hit">
                      <input className="form-check-input" type="checkbox" id={`ou-add-${u.id}`} checked={picked.has(u.id)} onChange={(e) => {
                        const ns = new Set(picked); if (e.target.checked) ns.add(u.id); else ns.delete(u.id); setPicked(ns);
                      }} />
                      <label className="form-check-label" htmlFor={`ou-add-${u.id}`}>{u.name}{u.club && <span className="text-body-secondary small"> ({u.club})</span>} <span className="text-body-secondary small">{u.email}</span></label>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-4">
              <label className="form-label small" htmlFor="ou-fn">Funkcja w grupie <span className="text-body-secondary">(opcjonalnie)</span></label>
              <input id="ou-fn" className="form-control" value={addFn} onChange={(e) => setAddFn(e.target.value)} placeholder="np. członek, przewodnicząca" maxLength={120} />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small" htmlFor="ou-from">Członek od <span className="text-body-secondary">(opcjonalnie)</span></label>
              <input id="ou-from" type="date" className="form-control" value={addFrom} onChange={(e) => setAddFrom(e.target.value)} />
            </div>
            <div className="col-6 col-md-3">
              <div className="form-check mb-2">
                <input className="form-check-input" type="checkbox" id="ou-vote" checked={addVote} onChange={(e) => setAddVote(e.target.checked)} />
                <label className="form-check-label" htmlFor="ou-vote">Domyślne prawo głosu</label>
              </div>
            </div>
            <div className="col-12 col-md-2 d-grid">
              <button className="btn btn-primary" disabled={picked.size === 0 || pending} onClick={addPicked}>Dodaj ({picked.size})</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <CardHeader title="Posiedzenia przypisane do grupy" />
        {unit.meetings.length === 0 ? <div className="card-body text-body-secondary">Brak przypisanych posiedzeń.</div> : (
          <ul className="list-group list-group-flush">
            {unit.meetings.map(({ meeting }) => (
              <li key={meeting.id} className="list-group-item d-flex flex-wrap justify-content-between gap-2">
                <Link href={`/meetings/${meeting.id}`}>Nr {meeting.number} - {meeting.name}</Link>
                <span className="small text-body-secondary">{new Date(meeting.scheduledAt).toLocaleDateString("pl-PL")} - {MEETING_STATUS_LABEL[meeting.status as MeetingStatus] ?? meeting.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MemberRow({ unitId, m, ended, pending, call }: {
  unitId: string; m: Member; ended: boolean; pending: boolean;
  call: (method: string, url: string, body?: unknown, okMsg?: string) => Promise<boolean>;
}) {
  const [fn, setFn] = useState(m.functionName ?? "");
  const url = `/api/org-units/${unitId}/members/${m.id}`;
  return (
    <tr className={ended ? "text-body-secondary" : undefined}>
      <td>
        <div className="fw-medium">{m.user.lastName} {m.user.firstName}</div>
        <div className="small text-body-secondary">{m.user.group ? `${m.user.group.shortName ?? m.user.group.name} - ` : ""}{m.user.email}{!m.user.active ? " - konto nieaktywne" : ""}</div>
      </td>
      <td style={{ minWidth: 160 }}>
        <input className="form-control form-control-sm" aria-label={`Funkcja: ${m.user.lastName} ${m.user.firstName}`} value={fn} maxLength={120}
          onChange={(e) => setFn(e.target.value)} onBlur={() => { if (fn !== (m.functionName ?? "")) call("PATCH", url, { functionName: fn || null }); }} />
      </td>
      <td className="text-center">
        <input className="form-check-input" type="checkbox" aria-label={`Domyślne prawo głosu: ${m.user.lastName} ${m.user.firstName}`} checked={m.defaultVotingRight}
          disabled={pending} onChange={(e) => call("PATCH", url, { defaultVotingRight: e.target.checked })} />
      </td>
      <td>
        <input type="date" className="form-control form-control-sm" aria-label="Członek od" defaultValue={d10(m.validFrom)}
          onBlur={(e) => { if (e.target.value !== d10(m.validFrom)) call("PATCH", url, { validFrom: e.target.value || null }); }} />
      </td>
      <td>
        <input type="date" className="form-control form-control-sm" aria-label="Członek do" defaultValue={d10(m.validTo)}
          onBlur={(e) => { if (e.target.value !== d10(m.validTo)) call("PATCH", url, { validTo: e.target.value || null }); }} />
        {ended && <div className="small">zakończone {fmtDay(m.validTo)}</div>}
      </td>
      <td className="text-end">
        <button className="btn btn-sm agenda-del" title="Usuń wpis (pomyłka)" aria-label={`Usuń wpis członkostwa: ${m.user.lastName} ${m.user.firstName}`} disabled={pending}
          onClick={async () => {
            if (await ask({ title: "Usunąć wpis członkostwa?", message: "Użyj tylko do poprawienia pomyłki. Aby zakończyć członkostwo z zachowaniem historii, wpisz datę „do”.", confirmLabel: "Usuń wpis", danger: true }))
              call("DELETE", url, undefined, "Usunięto wpis.");
          }}><IconTrash /></button>
      </td>
    </tr>
  );
}
