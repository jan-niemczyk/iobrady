"use client";

import { useEffect, useRef, useState } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Prywatna notatka radnego do punktu porządku - widoczna wyłącznie dla autora (nie trafia do
 * widoku publicznego, innych osób ani raportów). Dyskretna akcja rozwijana ze stanem zapisu.
 */
export function MyAgendaItemNote({ agendaItemId }: { agendaItemId: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [hasNote, setHasNote] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaId = `note-${agendaItemId}`;

  useEffect(() => {
    if (!open || loaded) return;
    fetch(`/api/agenda/${agendaItemId}/note`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setContent(d.content ?? ""); setHasNote(!!d.content); setLoaded(true); })
      .catch(() => { setLoaded(true); setState("error"); });
  }, [open, loaded, agendaItemId]);

  async function save(value: string) {
    setState("saving");
    try {
      const r = await fetch(`/api/agenda/${agendaItemId}/note`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: value }),
      });
      setState(r.ok ? "saved" : "error");
      if (r.ok) setHasNote(!!value.trim());
    } catch { setState("error"); }
  }

  function onChange(value: string) {
    setContent(value);
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(value), 700);
  }

  const label = state === "saving" ? "Zapisywanie…" : state === "saved" ? "Zapisano" : state === "error" ? "Nie zapisano - sprawdź połączenie i spróbuj ponownie" : hasNote ? "Notatka zapisana" : "";

  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" className="pt-link-btn" aria-expanded={open} aria-controls={open ? areaId : undefined} onClick={() => setOpen((v) => !v)}>
        {open ? "Zwiń moją notatkę" : "Moja notatka"}{!open && hasNote ? " (zapisana)" : ""}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <label className="sr-only" htmlFor={areaId}>Moja notatka do punktu (widoczna tylko dla mnie)</label>
          <textarea id={areaId} className="pt-textarea" rows={3} placeholder="Widoczna tylko dla Ciebie" value={content}
            disabled={!loaded} onChange={(e) => onChange(e.target.value)} onBlur={() => { if (state === "saving") { if (timer.current) clearTimeout(timer.current); save(content); } }} />
          <div className={`pt-note-state${state === "error" ? " is-error" : ""}`} role="status" aria-live="polite">
            {!loaded ? "Wczytywanie…" : label}
            {state === "error" && <> <button type="button" className="pt-link-btn" onClick={() => save(content)}>Ponów zapis</button></>}
          </div>
        </div>
      )}
    </div>
  );
}
