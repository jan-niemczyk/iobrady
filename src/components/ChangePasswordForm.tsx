"use client";

import { useState, useTransition } from "react";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) { setMsg({ ok: false, text: "Nowe hasło musi mieć co najmniej 8 znaków." }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: "Powtórzone hasło nie jest takie samo." }); return; }
    startTransition(async () => {
      const r = await fetch("/api/account/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (r.ok) {
        setMsg({ ok: true, text: "Hasło zostało zmienione." });
        setCurrent(""); setNext(""); setConfirm("");
      } else {
        const d = await r.json().catch(() => ({}));
        setMsg({ ok: false, text: d.error ?? "Nie udało się zmienić hasła." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-[420px]">
      <div>
        <label className="label">Obecne hasło</label>
        <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </div>
      <div>
        <label className="label">Nowe hasło</label>
        <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        <div className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Co najmniej 8 znaków.</div>
      </div>
      <div>
        <label className="label">Powtórz nowe hasło</label>
        <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </div>
      {msg && (
        <div className="text-sm" style={{ color: msg.ok ? "var(--color-yes)" : "var(--color-no)" }}>{msg.text}</div>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Zapisywanie…" : "Zmień hasło"}</button>
    </form>
  );
}
