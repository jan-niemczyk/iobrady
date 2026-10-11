"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Odświeżanie danych publicznego widoku w trakcie posiedzenia: router.refresh() pobiera nowe dane
 * serwera bez przeładowania strony - przewijanie, filtry i wpisany tekst wyszukiwania zostają.
 * Po zakończeniu posiedzenia (active = false) nic się nie odświeża.
 */
export function PublicAutoRefresh({ active, seconds = 30 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}
