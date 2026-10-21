"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Item = { href: string; label: string };
type Entry = Item | { label: string; items: Item[] };

/** Menu panelu operatora. Rozwijane grupy: przycisk z aria-expanded, Escape i klik poza menu zamykają. */
export function NavLinks({ inquiriesEnabled = false }: { inquiriesEnabled?: boolean }) {
  const path = usePathname() ?? "";
  const entries: Entry[] = [
    { href: "/dashboard", label: "Pulpit" },
    { label: "Posiedzenia", items: [
      { href: "/meetings", label: "Lista posiedzeń" },
      { href: "/notice-templates", label: "Szablony dokumentów" },
    ] },
    { label: "Osoby i grupy", items: [
      { href: "/participants", label: "Uczestnicy (konta)" },
      { href: "/guests", label: "Goście" },
      { href: "/contacts", label: "Kontakty" },
      { href: "/groups", label: "Grupy organizacyjne" },
      { href: "/clubs", label: "Kluby i koła" },
    ] },
    { href: "/info", label: "Informacje" },
    ...(inquiriesEnabled ? [{ href: "/inquiries", label: "Interpelacje i zapytania" } as Item] : []),
    { label: "Raporty", items: [
      { href: "/reports/attendance", label: "Raporty obecności" },
      { href: "/login-log", label: "Logowania" },
    ] },
    { href: "/settings", label: "Ustawienia" },
  ];
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <ul className="navbar-nav me-auto mb-2 mb-lg-0">
      {entries.map((e) => "href" in e
        ? (
          <li key={e.href} className="nav-item">
            <Link href={e.href} className={`nav-link${isActive(e.href) ? " active" : ""}`} aria-current={isActive(e.href) ? "page" : undefined}>{e.label}</Link>
          </li>
        )
        : <NavGroup key={e.label} label={e.label} items={e.items} isActive={isActive} />)}
    </ul>
  );
}

function NavGroup({ label, items, isActive }: { label: string; items: Item[]; isActive: (h: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const active = items.some((i) => isActive(i.href));
  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <li className="nav-item dropdown" ref={ref}>
      <button type="button" className={`nav-link dropdown-toggle btn btn-link border-0${active ? " active" : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      <ul className={`dropdown-menu${open ? " show" : ""}`}>
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className={`dropdown-item${isActive(i.href) ? " active" : ""}`} aria-current={isActive(i.href) ? "page" : undefined} onClick={() => setOpen(false)}>{i.label}</Link>
          </li>
        ))}
      </ul>
    </li>
  );
}
