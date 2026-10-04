"use client";

import { useState, useTransition } from "react";

export function ChangePasswordForm({ redirectAfter }: { redirectAfter?: string } = {}) {
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
        if (redirectAfter) window.location.assign(redirectAfter);
      } else {
        const d = await r.json().catch(() => ({}));
        setMsg({ ok: false, text: d.error ?? "Nie udało się zmienić hasła." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="d-flex flex-column gap-3" style={{ maxWidth: 420 }}>
      <div>
        <label className="form-label" htmlFor="pw-current">Obecne hasło</label>
        <input id="pw-current" type="password" className="form-control" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </div>
      <div>
        <label className="form-label" htmlFor="pw-next">Nowe hasło</label>
        <input id="pw-next" type="password" className="form-control" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required aria-describedby="pw-next-hint" />
        <div id="pw-next-hint" className="form-text">Co najmniej 8 znaków.</div>
      </div>
      <div>
        <label className="form-label" htmlFor="pw-confirm">Powtórz nowe hasło</label>
        <input id="pw-confirm" type="password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </div>
      {msg && (
        <div className={`alert ${msg.ok ? "alert-success" : "alert-danger"} py-2 mb-0 small`} role={msg.ok ? "status" : "alert"}>{msg.text}</div>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Zapisywanie…" : "Zmień hasło"}</button>
      </div>
    </form>
  );
}
