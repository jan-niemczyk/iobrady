"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["/dashboard", "Pulpit"],
  ["/meetings", "Posiedzenia"],
  ["/participants", "Uczestnicy"],
  ["/guests", "Goście"],
  ["/templates", "Szablony"],
  ["/login-log", "Logowania"],
  ["/settings", "Ustawienia"],
];

export function NavLinks() {
  const path = usePathname() ?? "";
  return (
    <ul className="navbar-nav me-auto mb-2 mb-lg-0">
      {LINKS.map(([href, label]) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <li key={href} className="nav-item">
            <Link href={href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
