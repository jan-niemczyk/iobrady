"use client";

import { useEffect } from "react";

/**
 * Niewidoczny komponent sesji (bez wpływu na wygląd):
 *  - po realnej interakcji użytkownika (klawisz, kliknięcie, dotyk, przewinięcie kółkiem)
 *    zgłasza aktywność na serwer - najwyżej raz na minutę;
 *  - co minutę sprawdza, czy sesja jest ważna; po unieważnieniu (wylogowanie z innego miejsca,
 *    dezaktywacja, limit bezczynności, zamknięcie posiedzenia) przechodzi do logowania.
 * Ruch SSE i odpytywanie danych NIE są traktowane jako aktywność.
 */
export function SessionKeeper() {
  useEffect(() => {
    let lastSent = 0;
    let pending = false;
    const onActivity = () => {
      const now = Date.now();
      if (pending || now - lastSent < 60_000) return;
      pending = true;
      lastSent = now;
      fetch("/api/session/activity", { method: "POST", keepalive: true })
        .then((r) => { if (r.status === 401) toLogin(); })
        .catch(() => { lastSent = 0; })
        .finally(() => { pending = false; });
    };
    const toLogin = () => {
      const from = window.location.pathname + window.location.search;
      window.location.assign(`/login?from=${encodeURIComponent(from)}`);
    };
    const events = ["keydown", "pointerdown", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true, capture: true });
    onActivity();
    const check = setInterval(() => {
      fetch("/api/session/status", { cache: "no-store" })
        .then((r) => { if (r.status === 401) toLogin(); })
        .catch(() => {});
    }, 60_000);
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity, { capture: true });
      clearInterval(check);
    };
  }, []);
  return null;
}
