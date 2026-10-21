"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IconBell } from "@/components/ui/Icon";

type N = { id: string; kind: string; title: string; link: string; createdAt: string; readAt: string | null };
const fmt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });

/**
 * Powiadomienia w aplikacji (nowa informacja, zdarzenia w sprawach). Lista ładuje się przy zmianie
 * ekranu; przejście do pozycji oznacza powiadomienie jako przejrzane. Wariant `app` (radny) albo
 * `bootstrap` (operator).
 */
export function NotificationsBell({ variant }: { variant: "app" | "bootstrap" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: N[]; unread: number }>({ items: [], unread: 0 });
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setData(d); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load, pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = async (n: N) => {
    setOpen(false);
    if (!n.readAt) await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [n.id] }) }).catch(() => {});
    router.push(n.link);
  };
  const readAll = async () => {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => {});
    load();
  };

  const b = variant === "bootstrap";
  return (
    <div className={b ? "position-relative" : "pt-bell"} ref={box}>
      <button ref={btn} type="button" className={b ? "btn btn-sm position-relative" : "pt-btn pt-btn-sm"} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <IconBell size={16} />
        <span className={b ? "visually-hidden" : "sr-only"}>Powiadomienia{data.unread ? `, nowe: ${data.unread}` : ""}</span>
        {data.unread > 0 && <span className={b ? "badge rounded-pill text-bg-danger ms-1" : "pt-nav-count"} aria-hidden="true">{data.unread}</span>}
      </button>
      {open && (
        <div className={b ? "card shadow position-absolute end-0 mt-1" : "pt-bell-panel"} style={b ? { width: "min(22rem, calc(100vw - 24px))", zIndex: 1050, maxHeight: "70vh", overflowY: "auto" } : undefined}>
          <div className={b ? "card-header d-flex justify-content-between align-items-center small py-2" : "pt-bell-head"}>
            <span>Powiadomienia</span>
            {data.unread > 0 && <button type="button" className={b ? "btn btn-link btn-sm p-0" : "pt-btn pt-btn-sm"} onClick={readAll}>Oznacz wszystkie</button>}
          </div>
          {data.items.length === 0 ? <div className={b ? "card-body small text-body-secondary" : "pt-empty"}>Brak powiadomień.</div> : (
            <ul className={b ? "list-group list-group-flush" : undefined}>
              {data.items.map((n) => (
                <li key={n.id} className={b ? "list-group-item p-0" : undefined}>
                  <a href={n.link} className={`${b ? "d-block px-3 py-2 text-body text-decoration-none small" : ""}${!n.readAt ? (b ? " fw-semibold" : " is-new") : ""}`} onClick={(e) => { e.preventDefault(); void go(n); }}>
                    {n.title}
                    <div className={b ? "text-body-secondary fw-normal" : "pt-label"}>{fmt(n.createdAt)}{!n.readAt ? " - nowe" : ""}</div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
