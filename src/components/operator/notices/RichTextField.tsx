"use client";

import { useRef } from "react";
import { PLACEHOLDERS } from "@/lib/noticeText";

/**
 * Ograniczony edytor formatowania: akapity, pogrubienie, kursywa, listy, wyrównanie i znaczniki
 * danych. Zapis jako zwykły tekst z prostymi znacznikami (lib/noticeText) - bez HTML i bez skryptów.
 */
export function RichTextField({ id, label, value, onChange, rows = 6, hint, placeholders = true, maxLength = 20000 }: {
  id: string; label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string;
  /** Lista znaczników danych {{…}} - tylko w dokumentach z danymi posiedzenia (zawiadomienia). */
  placeholders?: boolean; maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after = before) {
    const el = ref.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || "tekst";
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  }
  /** Zmienia początek zaznaczonych wierszy (lista, wyrównanie). */
  function linePrefix(prefix: string, strip: RegExp) {
    const el = ref.current; if (!el) return;
    const s = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    let e = value.indexOf("\n", el.selectionEnd); if (e < 0) e = value.length;
    let n = 0;
    const block = value.slice(s, e).split("\n").map((l) => {
      const clean = l.replace(strip, "");
      n++;
      return prefix === "1. " ? `${n}. ${clean}` : prefix + clean;
    }).join("\n");
    onChange(value.slice(0, s) + block + value.slice(e));
    requestAnimationFrame(() => el.focus());
  }
  function insert(text: string) {
    const el = ref.current; if (!el) return;
    const p = el.selectionStart;
    onChange(value.slice(0, p) + text + value.slice(el.selectionEnd));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(p + text.length, p + text.length); });
  }
  const LIST_RE = /^(\[do-srodka\]|\[do-prawej\]|\[wyjustuj\])?\s*([-\u2022]\s+|\d+[.)]\s+)?/;
  const ALIGN_RE = /^(\[do-srodka\]|\[do-prawej\]|\[wyjustuj\])\s*/;

  return (
    <div>
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className="btn-toolbar gap-1 mb-1" role="toolbar" aria-label={`Formatowanie: ${label}`}>
        <div className="btn-group btn-group-sm">
          <button type="button" className="btn btn-outline-secondary fw-bold" onClick={() => wrap("**")} title="Pogrubienie">Pogrub.</button>
          <button type="button" className="btn btn-outline-secondary fst-italic" onClick={() => wrap("_")} title="Kursywa">Kursywa</button>
        </div>
        <div className="btn-group btn-group-sm">
          <button type="button" className="btn btn-outline-secondary" onClick={() => linePrefix("- ", LIST_RE)}>Lista</button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => linePrefix("1. ", LIST_RE)}>Lista numerowana</button>
        </div>
        <div className="btn-group btn-group-sm" aria-label="Wyrównanie">
          <button type="button" className="btn btn-outline-secondary" onClick={() => linePrefix("", ALIGN_RE)}>Do lewej</button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => linePrefix("[do-srodka] ", ALIGN_RE)}>Do środka</button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => linePrefix("[do-prawej] ", ALIGN_RE)}>Do prawej</button>
          <button type="button" className="btn btn-outline-secondary" onClick={() => linePrefix("[wyjustuj] ", ALIGN_RE)}>Wyjustuj</button>
        </div>
        {placeholders && <select className="form-select form-select-sm w-auto" aria-label="Wstaw znacznik danych" value="" onChange={(e) => { if (e.target.value) insert(`{{${e.target.value}}}`); }}>
          <option value="">Wstaw znacznik…</option>
          {PLACEHOLDERS.map((p) => <option key={p.key} value={p.key}>{`{{${p.key}}}`} - {p.label}</option>)}
        </select>}
      </div>
      <textarea ref={ref} id={id} className="form-control font-monospace" style={{ fontSize: ".875rem" }} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} />
      <div className="form-text">{hint ?? "Każdy wiersz to akapit. **pogrubienie**, _kursywa_, „- ” lista, „1. ” lista numerowana."}</div>
    </div>
  );
}
