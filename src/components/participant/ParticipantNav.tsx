"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Nawigacja ekranów radnego - zakładki pod paskiem nagłówka, przewijane w poziomie na wąskich ekranach. */
export function ParticipantNav({ inquiries = false }: { inquiries?: boolean }) {
  const pathname = usePathname() ?? "";
  const [unread, setUnread] = useState(0);
  // Licznik nieprzeczytanych informacji - odświeżany przy zmianie ekranu (bez zapisu odczytu).
  useEffect(() => {
    let alive = true;
    fetch("/api/info/unread", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setUnread(d.unread ?? 0); }).catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  const links = [
    { href: "/session", label: "Bieżące" },
    { href: "/session/upcoming", label: "Nadchodzące" },
    { href: "/session/archive", label: "Archiwum" },
    { href: unread > 0 ? "/session/informacje?widok=nieprzeczytane" : "/session/informacje", match: "/session/informacje", label: "Informacje", count: unread },
    ...(inquiries ? [{ href: "/session/interpelacje", label: "Interpelacje" }] : []),
  ];
  const active = (href: string) =>
    href === "/session" ? pathname === "/session" : pathname.startsWith(href);
  return (
    <nav className="pt-nav" aria-label="Sekcje">
      <div className="pt-nav-inner">
        {links.map((l) => {
          const m = "match" in l && l.match ? l.match : l.href;
          return (
            <Link key={m} href={l.href} className="pt-nav-link" aria-current={active(m) ? "page" : undefined}>
              {l.label}
              {"count" in l && l.count ? <span className="pt-nav-count">{l.count}<span className="sr-only"> nieprzeczytanych</span></span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
