"use client";

import { useCallback, useEffect, useState } from "react";
import { CardHeader, PageContainer, PageHeader } from "../ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { EMPTY_CONTENT, normalizeContent, type NoticeAgendaItem, type NoticeContent } from "@/lib/noticeText";
import { NoticeContentEditor } from "./NoticeContentEditor";
import { NoticePreview } from "./NoticePreview";

type Tpl = {
  id: string; name: string; description: string | null; orgUnitId: string | null; orgUnit: { id: string; name: string } | null;
  active: boolean; isDefault: boolean; version: number; content: unknown; updatedAt: string;
};

/** Przykładowe dane do podglądu szablonu (szablon nie jest związany z posiedzeniem). */
const SAMPLE_VALUES: Record<string, string> = {
  organ: "Rada", nazwa_posiedzenia: "Sesja", numer_posiedzenia: "XII", data_posiedzenia: "15 października 2026",
  godzina: "10:00", miejsce: "Sala obrad", podpisujacy: "", data_pisma: "1 października 2026", miejscowosc: "",
};
const SAMPLE_AGENDA: NoticeAgendaItem[] = [
  { key: "a", number: "1", title: "Otwarcie posiedzenia.", level: 0 },
  { key: "b", number: "2", title: "Przyjęcie porządku obrad.", level: 0 },
  { key: "c", number: "3", title: "Rozpatrzenie projektów uchwał:", level: 0 },
  { key: "d", number: "a", title: "w sprawie przykładowej.", level: 1 },
  { key: "e", number: "4", title: "Zamknięcie posiedzenia.", level: 0 },
];

const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });

/**
 * Nazwane, wielokrotnie używane szablony tekstów zawiadomień. Zawiadomienie dostaje KOPIĘ treści
 * szablonu - zmiana lub archiwizacja szablonu nie zmienia dokumentów już utworzonych.
 */
export function NoticeTemplatesClient({ units, logoUrl }: { units: { id: string; name: string }[]; logoUrl: string | null }) {
  const [list, setList] = useState<Tpl[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; name: string; description: string; orgUnitId: string; content: NoticeContent } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/notice-templates?all=1", { cache: "no-store" });
    if (!r.ok) { await notifyFailure(r); return; }
    setList(await r.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = async (id: string, body: Record<string, unknown>, ok: string) => {
    const r = await fetch(`/api/notice-templates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { await notifyFailure(r); return false; }
    notify.success(ok);
    await load();
    return true;
  };

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) { notify.warning("Podaj nazwę szablonu."); return; }
    setBusy(true);
    const body = { name: editing.name, description: editing.description || null, orgUnitId: editing.orgUnitId || null, content: editing.content };
    const r = editing.id
      ? await fetch(`/api/notice-templates/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/notice-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success(editing.id ? "Zapisano szablon (nowa wersja)." : "Utworzono szablon.");
    setEditing(null);
    await load();
  }

  async function duplicate(t: Tpl) {
    const r = await fetch(`/api/notice-templates/${t.id}/duplicate`, { method: "POST" });
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Utworzono kopię szablonu.");
    await load();
  }

  async function archive(t: Tpl) {
    const ok = await ask({ title: "Archiwizować szablon?", message: `Szablon „${t.name}” zniknie z listy wyboru. Utworzone z niego zawiadomienia pozostaną bez zmian.`, confirmLabel: "Archiwizuj" });
    if (ok) await patch(t.id, { active: false }, "Zarchiwizowano szablon.");
  }

  if (editing) {
    return (
      <PageContainer size="xl">
        <PageHeader title={editing.id ? "Edycja szablonu zawiadomienia" : "Nowy szablon zawiadomienia"}
          description="Szablon zawiera stałe elementy dokumentu. Datę pisma, znak sprawy, porządek obrad i adresatów uzupełnia się w konkretnym zawiadomieniu." />
        <div className="row g-3">
          <div className="col-12 col-xxl-6">
            <div className="card mb-3">
              <CardHeader title="Szablon" />
              <div className="card-body row g-2">
                <div className="col-12 col-md-6"><label className="form-label" htmlFor="tp-name">Nazwa szablonu</label><input id="tp-name" className="form-control" value={editing.name} maxLength={200} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div className="col-12 col-md-6"><label className="form-label" htmlFor="tp-scope">Zakres</label>
                  <select id="tp-scope" className="form-select" value={editing.orgUnitId} onChange={(e) => setEditing({ ...editing, orgUnitId: e.target.value })}>
                    <option value="">Cała jednostka</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select></div>
                <div className="col-12"><label className="form-label" htmlFor="tp-desc">Opis <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label><input id="tp-desc" className="form-control" value={editing.description} maxLength={1000} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              </div>
            </div>
            <NoticeContentEditor value={editing.content} onChange={(c) => setEditing({ ...editing, content: c })} withDocumentFields={false} idPrefix="tp" />
            <div className="d-flex gap-2 mt-3">
              <button className="btn btn-primary" disabled={busy} onClick={save}>Zapisz szablon</button>
              <button className="btn btn-outline-secondary" disabled={busy} onClick={() => setEditing(null)}>Anuluj</button>
            </div>
          </div>
          <div className="col-12 col-xxl-6">
            <div className="card">
              <CardHeader title="Podgląd (przykładowe dane)" />
              <div className="card-body bg-body-tertiary" style={{ overflowX: "auto" }}>
                <NoticePreview content={editing.content} agenda={SAMPLE_AGENDA} values={{ ...SAMPLE_VALUES, podpisujacy: editing.content.signer }} recipient={null} logoUrl={logoUrl} />
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  const visible = (list ?? []).filter((t) => t.active !== showArchived);
  return (
    <PageContainer size="lg">
      <PageHeader title="Szablony dokumentów" description="Nazwane szablony tekstów zawiadomień. Szablon domyślny jest podpowiadany przy tworzeniu zawiadomienia dla posiedzeń jednostki albo przypisanej grupy." />
      <div className="d-flex flex-wrap gap-2 mb-3">
        <button className="btn btn-primary" onClick={() => setEditing({ id: null, name: "", description: "", orgUnitId: "", content: { ...EMPTY_CONTENT } })}>Nowy szablon</button>
        <div className="btn-group" role="group" aria-label="Widok">
          <button className={`btn btn-outline-secondary${!showArchived ? " active" : ""}`} aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>Aktywne</button>
          <button className={`btn btn-outline-secondary${showArchived ? " active" : ""}`} aria-pressed={showArchived} onClick={() => setShowArchived(true)}>Archiwum</button>
        </div>
      </div>
      <div className="card">
        <CardHeader title={<>{showArchived ? "Zarchiwizowane szablony" : "Aktywne szablony"} <span className="text-body-secondary fw-normal">({visible.length})</span></>} />
        {list === null ? <div className="card-body text-body-secondary">Wczytywanie…</div> : visible.length === 0 ? <div className="card-body text-body-secondary">Brak szablonów.</div> : (
          <ul className="list-group list-group-flush">
            {visible.map((t) => (
              <li key={t.id} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <span className="fw-medium">{t.name}</span>
                  {t.isDefault && <span className="badge text-bg-primary ms-2">domyślny</span>}
                  <div className="small text-body-secondary">
                    {t.orgUnit ? t.orgUnit.name : "Cała jednostka"} - wersja {t.version} - zmieniono {dt(t.updatedAt)}
                    {t.description ? ` - ${t.description}` : ""}
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {t.active ? (
                    <>
                      <button className="btn btn-sm btn-outline-primary" onClick={() => setEditing({ id: t.id, name: t.name, description: t.description ?? "", orgUnitId: t.orgUnitId ?? "", content: normalizeContent(t.content) })}>Edytuj</button>
                      {!t.isDefault && <button className="btn btn-sm btn-outline-secondary" onClick={() => patch(t.id, { isDefault: true }, "Ustawiono szablon domyślny.")}>Ustaw jako domyślny</button>}
                      {t.isDefault && <button className="btn btn-sm btn-outline-secondary" onClick={() => patch(t.id, { isDefault: false }, "Szablon nie jest już domyślny.")}>Usuń domyślność</button>}
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => duplicate(t)}>Powiel</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => archive(t)}>Archiwizuj</button>
                    </>
                  ) : (
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => patch(t.id, { active: true }, "Przywrócono szablon.")}>Przywróć</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
