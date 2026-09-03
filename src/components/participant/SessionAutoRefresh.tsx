"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Odświeża stronę, gdy zmienia się dostępność posiedzenia (otwarcie/zamknięcie),
// tak by radny nie musiał ręcznie odświeżać. Pyta lekki endpoint co kilka sekund.
export function SessionAutoRefresh({ hasMeeting }: { hasMeeting: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped) return;
      try {
        const r = await fetch("/api/me/session", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        const nowHas = !!data?.meetingId;
        // Zmiana stanu (pojawiło się / zniknęło aktywne posiedzenie) -> przeładuj widok serwerowy.
        if (nowHas !== hasMeeting) router.refresh();
      } catch { /* ignore */ }
    };
    const t = setInterval(check, 4000);
    return () => { stopped = true; clearInterval(t); };
  }, [hasMeeting, router]);
  return null;
}
