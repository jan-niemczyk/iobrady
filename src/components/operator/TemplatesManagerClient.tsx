"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@/components/ui/Icon";

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
      if (!r.ok) { alert(await r.text()); return; }
      const d = await r.json();
      setNewName("");
      reload();
      if (d.templateId) setSelectedId(d.templateId);
    });
  }

  function removeTemplate(t: Template) {
    if (!window.confirm(`Usunąć szablon „${t.name}"?`)) return;
    startTransition(async () => {
      const r = await fetch(`/api/meeting-templates/${t.id}`, { method: "DELETE" });
      if (!r.ok) { alert(await r.text()); return; }
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
      if (!r.ok) { alert(await r.text()); return; }
      reload();
    });
  }

  const memberIds = new Set(selected?.members.map((m) => m.userId) ?? []);
  const addable = allUsers.filter((u) => !memberIds.has(u.id) && u.name.toLowerCase().includes(addFilter.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="btn"><IconArrowLeft size={13} /> Pulpit</Link>
        <h1 className="text-xl font-semibold">Szablony składu</h1>
      </div>

      <p className="text-sm mb-6" style={{ color: "var(--color-ink-3)" }}>
        Szablon to gotowy zestaw uczestników (np. pełny skład rady), który można hurtowo zastosować przy tworzeniu posiedzenia - bez ręcznego dodawania każdej osoby.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lista szablonów */}
        <div className="md:col-span-1">
          <div className="card divide-y divide-[var(--color-rule-soft)] mb-3">
            {templates.length === 0 && (
              <div className="px-4 py-4 text-sm" style={{ color: "var(--color-ink-3)" }}>Brak szablonów.</div>
            )}
            {templates.map((t) => (
              <button
                key={t.id}
                className="w-full text-left px-4 py-3"
                style={{ background: t.id === selectedId ? "var(--color-paper-2)" : undefined }}
                onClick={() => setSelectedId(t.id)}
              >
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>{t.members.length} uczestników</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="Nazwa nowego szablonu" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ fontSize: 13 }} />
            <button className="btn btn-primary" disabled={pending || !newName.trim()} onClick={createTemplate}>Utwórz</button>
          </div>
        </div>

        {/* Szczegóły szablonu */}
        <div className="md:col-span-2">
          {!selected ? (
            <div className="card p-6 text-sm text-center" style={{ color: "var(--color-ink-3)" }}>Wybierz szablon z listy lub utwórz nowy.</div>
          ) : (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <input
                    className="input"
                    value={selected.name}
                    onChange={(e) => setTemplates((ts) => ts.map((t) => t.id === selected.id ? { ...t, name: e.target.value } : t))}
                    onBlur={(e) => patchTemplate({ name: e.target.value.trim() })}
                    style={{ fontWeight: 600, maxWidth: 360 }}
                  />
                  <button className="btn" style={{ color: "var(--color-no)" }} disabled={pending} onClick={() => removeTemplate(selected)}>Usuń szablon</button>
                </div>
              </div>

              {/* Członkowie */}
              <div className="card">
                <div className="px-4 py-3 border-b border-[var(--color-rule-soft)] eyebrow">Uczestnicy szablonu ({selected.members.length})</div>
                <div className="divide-y divide-[var(--color-rule-soft)]" style={{ maxHeight: 300, overflowY: "auto" }}>
                  {selected.members.length === 0 && (
                    <div className="px-4 py-4 text-sm" style={{ color: "var(--color-ink-3)" }}>Brak uczestników. Dodaj poniżej.</div>
                  )}
                  {selected.members.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between gap-2 px-4 py-2">
                      <span className="text-sm truncate flex-1">
                        {m.name}{m.groupShort && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}> ({m.groupShort})</span>}
                      </span>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={m.hasVotingRight} onChange={(e) => patchTemplate({ setVotingRight: { userId: m.userId, hasVotingRight: e.target.checked } })} />
                        prawo głosu
                      </label>
                      <button className="btn" style={{ padding: "2px 8px", fontSize: 11, color: "var(--color-no)" }} disabled={pending} onClick={() => patchTemplate({ removeUserIds: [m.userId] })}>Usuń</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dodawanie */}
              <div className="card p-4">
                <div className="eyebrow mb-2">Dodaj uczestników</div>
                <input className="input mb-2" placeholder="Wyszukaj osobę…" value={addFilter} onChange={(e) => setAddFilter(e.target.value)} style={{ fontSize: 13 }} />
                <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--color-rule-soft)" }}>
                  {addable.slice(0, 50).map((u) => (
                    <button key={u.id} className="w-full text-left px-3 py-2 text-sm border-b border-[var(--color-rule-soft)] last:border-0 hover:bg-[var(--color-paper-2)]"
                      disabled={pending} onClick={() => patchTemplate({ addUserIds: [u.id] })}>
                      {u.name}{u.groupShort && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}> ({u.groupShort})</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
