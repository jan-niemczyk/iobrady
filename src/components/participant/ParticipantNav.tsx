"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/session", label: "Bieżące" },
  { href: "/session/upcoming", label: "Nadchodzące" },
  { href: "/session/archive", label: "Archiwum" },
];

/** Nawigacja ekranów radnego - zakładki pod paskiem nagłówka, przewijane w poziomie na wąskich ekranach. */
export function ParticipantNav() {
  const pathname = usePathname() ?? "";
  const active = (href: string) =>
    href === "/session" ? pathname === "/session" : pathname.startsWith(href);
  return (
    <nav className="pt-nav" aria-label="Sekcje">
      <div className="pt-nav-inner">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="pt-nav-link" aria-current={active(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
