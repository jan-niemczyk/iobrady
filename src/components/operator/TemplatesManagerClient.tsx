"use client";

import { useState, useTransition } from "react";
import { CardHeader, PageContainer, PageHeader } from "./ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";

interface Member { userId: string; name: string; groupShort: string | null; hasVotingRight: boolean }
interface Template { id: string; name: string; description: string | null; members: Member[] }
interface SimpleUser { id: string; name: string; groupShort: string | null }

export function TemplatesManagerClient({ initialTemplates, allUsers }: { initialTemplates: Template[]; allUsers: SimpleUser[] }) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [newName, setNewName] = useState("");
  const [addFilter, setAddFilter] = useState("");

  function reload() {
    fetch("/api/meeting-templates", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.templates) setTemplates(d.templates); })
      .catch(() => {});
  }

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  function createTemplate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const r = await fetch("/api/meeting-templates", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }),
      });
      if (!r.ok) { await notifyFailure(r); return; }
      const d = await r.json();
      notify.success("Szablon został utworzony.");
      setNewName("");
      reload();
      if (d.templateId) setSelectedId(d.templateId);
    });
  }

  async function removeTemplate(t: Template) {
    if (!(await ask({ title: "Usunąć szablon?", message: `Szablon „${t.name}” zostanie usunięty.`, confirmLabel: "Usuń", danger: true }))) return;
    startTransition(async () => {
      const r = await fetch(`/api/meeting-templates/${t.id}`, { method: "DELETE" });
      if (!r.ok) { await notifyFailure(r); return; }
      notify.success("Szablon został usunięty.");
      setSelectedId(null);
      reload();
    });
  }

  function patchTemplate(body: Record<string, unknown>) {
    if (!selected) return;
    startTransition(async () => {
      const r = await fetch(`/api/meeting-templates/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) { await notifyFailure(r); return; }
      reload();
    });
  }

  const memberIds = new Set(selected?.members.map((m) => m.userId) ?? []);
  const addable = allUsers.filter((u) => !memberIds.has(u.id) && u.name.toLowerCase().includes(addFilter.toLowerCase()));

  return (
    <PageContainer size="lg">
      <PageHeader
        kicker="Katalog"
        title="Szablony składu"
        description="Szablon to gotowy zestaw uczestników (np. pełny skład rady), który można hurtowo zastosować przy tworzeniu posiedzenia - bez ręcznego dodawania każdej osoby."
      />

      <div className="row g-3 align-items-start">
        {/* Lista szablonów */}
        <div className="col-12 col-md-4">
          <div className="card">
            <CardHeader title="Szablony" />
            {templates.length === 0 ? (
              <div className="card-body text-body-secondary">Brak szablonów.</div>
            ) : (
              <div className="list-group list-group-flush">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`list-group-item list-group-item-action${t.id === selectedId ? " active" : ""}`}
                    aria-current={t.id === selectedId ? "true" : undefined}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <div className="fw-medium">{t.name}</div>
                    <div className={`small ${t.id === selectedId ? "opacity-75" : "text-body-secondary"}`}>{t.members.length} uczestników</div>
                  </button>
                ))}
              </div>
            )}
            <div className="card-footer">
              <form className="input-group input-group-sm" onSubmit={(e) => { e.preventDefault(); createTemplate(); }}>
                <input className="form-control" placeholder="Nazwa nowego szablonu" aria-label="Nazwa nowego szablonu" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <button type="submit" className="btn btn-primary" disabled={pending || !newName.trim()}>Utwórz</button>
              </form>
            </div>
          </div>
        </div>

        {/* Szczegóły szablonu */}
        <div className="col-12 col-md-8">
          {!selected ? (
            <div className="card"><div className="card-body text-center text-body-secondary py-4">Wybierz szablon z listy lub utwórz nowy.</div></div>
          ) : (
            <div className="d-flex flex-column gap-3">
              <div className="card">
                <div className="card-body">
                  <label className="form-label" htmlFor="tpl-name">Nazwa szablonu</label>
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <input
                      id="tpl-name"
                      className="form-control flex-grow-1"
                      value={selected.name}
                      onChange={(e) => setTemplates((ts) => ts.map((t) => t.id === selected.id ? { ...t, name: e.target.value } : t))}
                      onBlur={(e) => patchTemplate({ name: e.target.value.trim() })}
                      style={{ maxWidth: 420 }}
                    />
                    <button className="btn btn-outline-danger ms-auto" disabled={pending} onClick={() => removeTemplate(selected)}>Usuń szablon</button>
                  </div>
                </div>
              </div>

              {/* Członkowie */}
              <div className="card">
                <CardHeader title={<>Uczestnicy szablonu <span className="text-body-secondary fw-normal">({selected.members.length})</span></>} />
                {selected.members.length === 0 ? (
                  <div className="card-body text-body-secondary">Brak uczestników. Dodaj poniżej.</div>
                ) : (
                  <ul className="list-group list-group-flush overflow-auto" style={{ maxHeight: 360 }}>
                    {selected.members.map((m) => (
                      <li key={m.userId} className="list-group-item d-flex align-items-center justify-content-between gap-3 py-2">
                        <span className="text-truncate flex-grow-1">
                          {m.name}{m.groupShort && <span className="small text-body-secondary"> ({m.groupShort})</span>}
                        </span>
                        <div className="form-check mb-0 small flex-shrink-0">
                          <input className="form-check-input" type="checkbox" id={`tpl-vr-${m.userId}`} checked={m.hasVotingRight} onChange={(e) => patchTemplate({ setVotingRight: { userId: m.userId, hasVotingRight: e.target.checked } })} />
                          <label className="form-check-label" htmlFor={`tpl-vr-${m.userId}`}>prawo głosu</label>
                        </div>
                        <button className="btn btn-sm btn-outline-danger flex-shrink-0" disabled={pending} onClick={() => patchTemplate({ removeUserIds: [m.userId] })}>Usuń</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Dodawanie */}
              <div className="card">
                <CardHeader title="Dodaj uczestników" right={
                  <input className="form-control form-control-sm" style={{ maxWidth: 240 }} placeholder="Wyszukaj osobę…" aria-label="Wyszukaj osobę" value={addFilter} onChange={(e) => setAddFilter(e.target.value)} />
                } />
                {addable.length === 0 ? (
                  <div className="card-body text-body-secondary">Brak osób do dodania.</div>
                ) : (
                  <div className="list-group list-group-flush overflow-auto" style={{ maxHeight: 260 }}>
                    {addable.slice(0, 50).map((u) => (
                      <button key={u.id} type="button" className="list-group-item list-group-item-action py-2 d-flex align-items-center justify-content-between gap-2"
                        disabled={pending} onClick={() => patchTemplate({ addUserIds: [u.id] })}>
                        <span>{u.name}{u.groupShort && <span className="small text-body-secondary"> ({u.groupShort})</span>}</span>
                        <span className="small text-primary flex-shrink-0">+ Dodaj</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
