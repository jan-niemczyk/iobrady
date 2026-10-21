"use client";

import { renumber, type NoticeAgendaItem } from "@/lib/noticeText";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@/components/ui/Icon";

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Porządek obrad w zawiadomieniu - kopia robocza tego dokumentu (zmiany nie trafiają do porządku
 * posiedzenia). Edycja tytułów, numeracji, poziomu (podpunkt), dodawanie, usuwanie i kolejność.
 */
export function NoticeAgendaEditor({ items, onChange }: { items: NoticeAgendaItem[]; onChange: (v: NoticeAgendaItem[]) => void }) {
  const set = (i: number, p: Partial<NoticeAgendaItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  const add = (i: number) => onChange([...items.slice(0, i + 1), { key: newKey(), number: "", title: "", level: items[i]?.level ?? 0 }, ...items.slice(i + 1)]);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 mb-2">
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onChange(renumber(items))}>Przenumeruj automatycznie</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => add(items.length - 1)}><IconPlus /> Dodaj pozycję na końcu</button>
      </div>
      {items.length === 0 ? <p className="text-body-secondary small">Porządek jest pusty.</p> : (
        <ol className="list-unstyled d-flex flex-column gap-2 mb-0">
          {items.map((a, i) => (
            <li key={a.key} className="border rounded p-2" style={{ marginLeft: a.level === 1 ? 32 : 0 }}>
              <div className="d-flex flex-wrap gap-2 align-items-start">
                <input className="form-control form-control-sm" style={{ width: 72 }} aria-label={`Numer pozycji ${i + 1}`} value={a.number} disabled={a.unnumbered}
                  onChange={(e) => set(i, { number: e.target.value })} maxLength={20} />
                <textarea className="form-control form-control-sm flex-grow-1" style={{ minWidth: 220 }} rows={a.title.length > 90 ? 3 : 2} aria-label={`Treść pozycji ${i + 1}`} value={a.title}
                  onChange={(e) => set(i, { title: e.target.value })} maxLength={2000} />
                <div className="btn-group btn-group-sm" role="group" aria-label={`Pozycja ${i + 1}`}>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label="W górę" title="W górę"><IconArrowUp /></button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="W dół" title="W dół"><IconArrowDown /></button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => set(i, { level: a.level === 1 ? 0 : 1 })} title={a.level === 1 ? "Zmień na punkt" : "Zmień na podpunkt"}>{a.level === 1 ? "Punkt" : "Podpunkt"}</button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => add(i)} aria-label="Dodaj pozycję poniżej" title="Dodaj poniżej"><IconPlus /></button>
                  <button type="button" className="btn btn-outline-danger" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Usuń pozycję ${i + 1}`} title="Usuń"><IconTrash /></button>
                </div>
              </div>
              <div className="form-check form-check-inline mt-1 small">
                <input className="form-check-input" type="checkbox" id={`na-un-${a.key}`} checked={!!a.unnumbered} onChange={(e) => set(i, { unnumbered: e.target.checked, number: e.target.checked ? "" : a.number })} />
                <label className="form-check-label" htmlFor={`na-un-${a.key}`}>bez numeru</label>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
