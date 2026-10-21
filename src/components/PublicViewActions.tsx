"use client";

import { useState } from "react";
import { notify } from "@/lib/feedback";
import { IconCopy, IconExternal } from "@/components/ui/Icon";

/**
 * Szybki dostęp do widoku publicznego posiedzenia: „Widok publiczny" (nowa karta) i „Kopiuj link".
 * Kanoniczny adres: /public/{id} w domenie instalacji (adres z konfiguracji serwera, a gdy go brak -
 * bieżąca domena przeglądarki). Przycisk niczego nie publikuje i nie zmienia uprawnień - dla
 * posiedzenia nieopublikowanego pokazuje stan „niedostępny".
 */
export function PublicViewActions({ meetingId, published, origin, variant = "bootstrap", size = "md" }: {
  meetingId: string;
  published: boolean;
  /** Adres instalacji z konfiguracji (NEXTAUTH_URL); null - bieżąca domena. */
  origin?: string | null;
  variant?: "bootstrap" | "app";
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  const path = `/public/${meetingId}`;
  const url = () => `${origin || window.location.origin}${path}`;
  const btn = variant === "app" ? `pt-btn${size === "sm" ? " pt-btn-sm" : ""}` : `btn btn-outline-secondary${size === "sm" ? " btn-sm" : ""}`;

  if (!published) {
    return (
      <span className={variant === "app" ? "pt-label" : "small text-body-secondary"} role="note">
        Widok publiczny niedostępny - posiedzenie nieopublikowane
      </span>
    );
  }

  async function copy() {
    const text = url();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Starsze przeglądarki / brak uprawnień do schowka: zaznaczenie tekstu w ukrytym polu.
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
    }
    setCopied(true);
    notify.success("Skopiowano link do widoku publicznego.");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className={variant === "app" ? "flex flex-wrap items-center gap-2" : "d-inline-flex flex-wrap align-items-center gap-2"}>
      <a className={btn} href={path} target="_blank" rel="noopener noreferrer">
        <IconExternal /> Widok publiczny<span className={variant === "app" ? "sr-only" : "visually-hidden"}> (otwiera się w nowej karcie)</span>
      </a>
      <button type="button" className={btn} onClick={copy} aria-live="polite">
        <IconCopy /> {copied ? "Skopiowano" : "Kopiuj link"}
      </button>
    </div>
  );
}
