"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconArrowUp, IconArrowDown, IconArrowLeft } from "@/components/ui/Icon";
import type { AgendaItemStatus } from "@prisma/client";
import { AGENDA_ITEM_STATUS_LABEL } from "@/lib/labels";

interface AgendaItem {
  id: string;
  order: number;
  number: string;
  title: string;
  description: string | null;
  committee?: string | null;
  presenter: string | null;
  status: AgendaItemStatus;
  isSubItem?: boolean;
  unnumbered?: boolean;
  hiddenFromDisplay?: boolean;
}

export function AgendaEditorClient({
  meetingId, meetingName, meetingNumber, initialAgenda,
}: {
  meetingId: string;
  meetingName: string;
  meetingNumber: string;
  initialAgenda: AgendaItem[];
}) {
  const [agenda, setAgenda] = useState(initialAgenda);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function refetch() {
    // proste - przeładuj całą stronę dla świeżych danych z serwera
    const r = await fetch(`/api/meetings/${meetingId}/state`, { cache: "no-store" });
    if (r.ok) {
      const state = await r.json();
      setAgenda(state.agenda);
    }
  }

  function act(method: "POST" | "PATCH" | "DELETE", path: string, body?: object, renumberAfter?: boolean) {
    startTransition(async () => {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) { alert(await r.text()); return; }
      if (renumberAfter) {
        await fetch(`/api/meetings/${meetingId}/agenda/renumber`, { method: "POST" });
      }
      await refetch();
    });
  }

  return (
    <div className="px-6 py-8 max-w-[960px] mx-auto">
      <header className="flex items-end justify-between border-b border-[var(--color-rule)] pb-6 mb-8">
        <div>
          <div className="eyebrow mb-2">Posiedzenie nr <span className="mono">{meetingNumber}</span> - Porządek obrad</div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>{meetingName}</h1>
        </div>
        <Link href={`/meetings/${meetingId}`} className="btn"><IconArrowLeft size={13} /> Wróć do panelu</Link>
      </header>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-rule)] flex items-center justify-between">
          <h2 className="eyebrow">Punkty ({agenda.length})</h2>
          <div className="flex gap-2">
            <button
              className="btn" style={{ padding: "6px 12px", fontSize: 12 }}
              disabled={pending || agenda.length === 0}
              onClick={() => { if (window.confirm("Nadać punktom kolejne numery (1, 2, 3…) wg obecnej kolejności? Podpunkty otrzymają numery kropkowe (2.1, 2.2…).")) act("POST", `/api/meetings/${meetingId}/agenda/renumber`); }}
              title="Nadaj kolejne numery wg aktualnej kolejności"
            >
              Przenumeruj
            </button>
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setShowImport(true)}>
              Importuj z tekstu
            </button>
            <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setAdding(true)}>+ Dodaj punkt</button>
          </div>
        </div>

        <ol className="divide-y divide-[var(--color-rule-soft)]">
          {agenda.map((a, idx) => (
            <li key={a.id} className="px-5 py-3">
              {editingId === a.id ? (
                <ItemEditor
                  item={a}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => {
                    setEditingId(null);
                    act("PATCH", `/api/agenda/${a.id}`, patch);
                  }}
                />
              ) : (
                <div style={{ marginLeft: a.isSubItem ? 28 : 0 }}>
                  {/* Nazwa punktu - pełna szerokość, u góry, czytelna */}
                  <div className="flex items-start gap-3 min-w-0 mb-2">
                    <span className="mono text-xs mt-1 shrink-0" style={{ color: "var(--color-ink-3)", width: 40 }}>{a.unnumbered ? "-" : a.number}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">
                        {a.isSubItem && <span style={{ color: "var(--color-ink-3)" }}>↳ </span>}
                        {a.title}
                        {a.hiddenFromDisplay && <span className="ml-2 text-xs" style={{ color: "var(--color-ink-3)" }}>(ukryty na prezentacji)</span>}
                      </div>
                      {a.presenter && <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>Referent: {a.presenter}</div>}
                      {(a as { committee?: string | null }).committee && <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>Opinia: {(a as { committee?: string | null }).committee}</div>}
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                  {/* Przyciski akcji - w rzędzie pod nazwą, wszystkie widoczne */}
                  <div className="flex items-center gap-1 flex-wrap" style={{ paddingLeft: 52 }}>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending || idx === 0} onClick={() => act("POST", `/api/agenda/${a.id}/move`, { direction: "up" })} title="W górę"><IconArrowUp size={13} /></button>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending || idx === agenda.length - 1} onClick={() => act("POST", `/api/agenda/${a.id}/move`, { direction: "down" })} title="W dół"><IconArrowDown size={13} /></button>
                    <select
                      className="input"
                      style={{ padding: "3px 6px", fontSize: 11, width: "auto", maxWidth: 150 }}
                      value=""
                      disabled={pending}
                      title="Przenieś ten punkt za wybranym"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        if (v === "__start__") act("POST", `/api/agenda/${a.id}/move`, { toStart: true });
                        else act("POST", `/api/agenda/${a.id}/move`, { afterId: v });
                      }}
                    >
                      <option value="">Przenieś po…</option>
                      <option value="__start__">(na początek)</option>
                      {agenda.filter((x) => x.id !== a.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.unnumbered ? x.title.slice(0, 30) : `${x.number}. ${x.title.slice(0, 26)}`}</option>
                      ))}
                    </select>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending} onClick={() => act("PATCH", `/api/agenda/${a.id}`, { isSubItem: !a.isSubItem }, true)} title={a.isSubItem ? "Zmień na zwykły punkt" : "Zmień na podpunkt (wcięcie)"}>{a.isSubItem ? "Punkt" : "Podpunkt"}</button>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending} onClick={() => act("PATCH", `/api/agenda/${a.id}`, { hiddenFromDisplay: !a.hiddenFromDisplay })} title={a.hiddenFromDisplay ? "Pokaż na prezentacji" : "Ukryj na prezentacji"}>{a.hiddenFromDisplay ? "Pokaż" : "Ukryj"}</button>
                    <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending} onClick={() => setEditingId(a.id)}>Edytuj</button>
                    {a.status === "PENDING" && (
                      <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending} onClick={() => act("POST", `/api/agenda/${a.id}/skip`)}>Pomiń</button>
                    )}
                    {(a.status === "COMPLETED" || a.status === "SKIPPED") && (
                      <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending} onClick={() => act("POST", `/api/agenda/${a.id}/reopen`)} title={a.status === "SKIPPED" ? "Cofnij pominięcie - punkt wróci do nieotwartego" : "Cofnij zakończenie - punkt wróci do nieotwartego"}>{a.status === "SKIPPED" ? "Cofnij pominięcie" : "Cofnij zakończenie"}</button>
                    )}
                    <button
                      className="btn btn-danger"
                      style={{ padding: "4px 8px", fontSize: 11 }}
                      disabled={pending || a.status === "CURRENT"}
                      onClick={() => { if (window.confirm("Usunąć punkt?")) act("DELETE", `/api/agenda/${a.id}`); }}
                    >Usuń</button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {agenda.length === 0 && (
            <li className="px-5 py-8 text-center text-sm" style={{ color: "var(--color-ink-3)" }}>Brak punktów. Dodaj pierwszy.</li>
          )}
        </ol>

        {adding && (
          <div className="px-5 py-4 border-t border-[var(--color-rule)] bg-[var(--color-paper-2)]">
            <ItemEditor
              onCancel={() => setAdding(false)}
              onSave={(payload) => { setAdding(false); act("POST", `/api/meetings/${meetingId}/agenda`, payload, payload.isSubItem); }}
            />
          </div>
        )}
      </div>

      {showImport && (
        <ImportAgendaModal
          meetingId={meetingId}
          existingCount={agenda.length}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refetch(); }}
        />
      )}
    </div>
  );
}

function ImportAgendaModal({
  meetingId, existingCount, onClose, onImported,
}: {
  meetingId: string;
  existingCount: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((raw) => {
    const indented = /^(\t| {2,})/.test(raw);
    const t = raw.trim();
    const bulleted = /^[-*-›]\s+/.test(t);
    return { indented: indented || bulleted };
  });
  const lines = parsedLines;
  const subCount = parsedLines.filter((l) => l.indented).length;

  async function submit() {
    setError(null);
    if (lines.length === 0) {
      setError("Brak punktów do zaimportowania.");
      return;
    }
    if (mode === "replace" && existingCount > 0
      && !window.confirm(`Zastąpić ${existingCount} istniejących punktów? Operacji nie można cofnąć.`)) {
      return;
    }
    setSubmitting(true);
    const r = await fetch(`/api/meetings/${meetingId}/agenda/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode }),
    });
    setSubmitting(false);
    if (!r.ok) { setError(await r.text()); return; }
    onImported();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card no-grid" style={{ width: "100%", maxWidth: 640, background: "#FFFFFF" }}>
        <div className="px-5 py-3 border-b border-[var(--color-rule)] flex items-center justify-between">
          <h2 className="eyebrow">Import porządku obrad</h2>
          <button onClick={onClose} className="btn" style={{ padding: "4px 10px", fontSize: 12 }}>Zamknij</button>
        </div>
        <div className="p-5">
          <p className="text-sm mb-3">
            Wklej listę punktów - każdy w osobnej linii. Numery (1, 2, 3…) zostaną nadane automatycznie.
            <span className="block text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
              Podpunkt: zacznij linię od wcięcia (spacja/tab) albo od „-”. Otrzyma numer z literą (np. 3a, 3b).
            </span>
          </p>
          <textarea
            className="input mono"
            style={{ minHeight: 220, fontSize: 12 }}
            placeholder={`Otwarcie posiedzenia\nProjekt uchwały w sprawie budżetu\n  - autopoprawka nr 1\n  - autopoprawka nr 2\nSprawy różne`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-3 text-xs" style={{ color: "var(--color-ink-3)" }}>
            Wczyta {lines.length} {lines.length === 1 ? "punkt" : lines.length < 5 ? "punkty" : "punktów"}{subCount > 0 ? ` (w tym ${subCount} jako podpunkty)` : ""}.
          </div>

          <div className="mt-3 flex gap-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} />
              <span>Dopisz na koniec ({existingCount} {existingCount === 1 ? "istniejący" : "istniejących"})</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
              <span style={{ color: "var(--color-no)" }}>Zastąp wszystkie</span>
            </label>
          </div>

          {error && (
            <div className="mt-3 p-2 text-sm" style={{ background: "var(--color-no-bg)", color: "var(--color-no)" }}>
              {error}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button className="btn" onClick={onClose}>Anuluj</button>
            <button className="btn btn-primary" disabled={submitting || lines.length === 0} onClick={submit}>
              {submitting ? "Importuję…" : `Importuj ${lines.length} ${lines.length === 1 ? "punkt" : "punktów"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemEditor({
  item, onCancel, onSave,
}: {
  item?: AgendaItem;
  onCancel: () => void;
  onSave: (data: { number: string; title: string; committee: string | null; presenter: string | null; isSubItem: boolean; unnumbered: boolean }) => void;
}) {
  const [number, setNumber] = useState(item?.number ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [committee, setCommittee] = useState((item as { committee?: string | null })?.committee ?? "");
  const [presenter, setPresenter] = useState(item?.presenter ?? "");
  const [isSubItem, setIsSubItem] = useState(item?.isSubItem ?? false);
  const [unnumbered, setUnnumbered] = useState(item?.unnumbered ?? false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ number: unnumbered ? "" : number, title, committee: committee || null, presenter: presenter || null, isSubItem, unnumbered });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <div>
          <label className="label">Numer</label>
          <input className="input" required={!unnumbered} disabled={unnumbered} value={unnumbered ? "" : number} onChange={(e) => setNumber(e.target.value)} placeholder={unnumbered ? "-" : "np. 3a"} />
        </div>
        <div>
          <label className="label">Tytuł</label>
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Referent (opcjonalnie)</label>
        <input className="input" value={presenter} onChange={(e) => setPresenter(e.target.value)} placeholder="np. Burmistrz Miasta" />
      </div>
      <div>
        <label className="label">Komisja / opinia (opcjonalnie)</label>
        <input className="input" value={committee} onChange={(e) => setCommittee(e.target.value)} placeholder="np. Komisja ds. Finansów" />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={unnumbered} onChange={(e) => setUnnumbered(e.target.checked)} />
        <span>Bez numeru (pozycja pokazywana jako sama nazwa, np. przerwa, otwarcie)</span>
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={isSubItem} onChange={(e) => setIsSubItem(e.target.checked)} />
        <span>Podpunkt (wyświetlany z wcięciem)</span>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>Anuluj</button>
        <button type="submit" className="btn btn-primary">Zapisz</button>
      </div>
    </form>
  );
}

function StatusPill({ status }: { status: AgendaItemStatus }) {
  if (status === "CURRENT") return <span className="pill pill-live">Rozpatrywany</span>;
  if (status === "COMPLETED") return <span className="pill pill-ok">Zakończony</span>;
  if (status === "SKIPPED") return <span className="pill pill-neutral">Pominięty</span>;
  return <span className="pill pill-neutral">{AGENDA_ITEM_STATUS_LABEL[status]}</span>;
}
