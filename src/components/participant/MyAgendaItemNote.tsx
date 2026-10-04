"use client";

import { useEffect, useRef, useState } from "react";

/** Prywatna notatka radnego do punktu porządku - widoczna tylko dla niego. */
export function MyAgendaItemNote({ agendaItemId }: { agendaItemId: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch(`/api/agenda/${agendaItemId}/note`).then((r) => r.json()).then((d) => { setContent(d.content ?? ""); setLoaded(true); });
  }, [open, loaded, agendaItemId]);

  function onChange(value: string) {
    setContent(value);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await fetch(`/api/agenda/${agendaItemId}/note`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      setSaved(true);
    }, 600);
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="pt-link-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Ukryj moją notatkę" : "Moja notatka"}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <textarea
            className="pt-textarea" rows={3}
            aria-label="Moja notatka"
            placeholder="Widoczna tylko dla Ciebie…"
            value={content}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="pt-label" style={{ marginTop: 2 }}>{saved ? "Zapisano" : "Zapisywanie…"}</div>
        </div>
      )}
    </div>
  );
}
