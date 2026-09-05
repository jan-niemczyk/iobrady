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
    <div className="mt-1.5">
      <button type="button" className="text-xs hover:underline" style={{ color: "var(--color-ink-3)" }} onClick={() => setOpen((v) => !v)}>
        {open ? "Ukryj moją notatkę" : "Moja notatka"}
      </button>
      {open && (
        <div className="mt-1.5">
          <textarea
            className="input" rows={3}
            style={{ fontSize: 13 }}
            placeholder="Widoczna tylko dla Ciebie…"
            value={content}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>{saved ? "Zapisano" : "Zapisywanie…"}</div>
        </div>
      )}
    </div>
  );
}
