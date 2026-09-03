"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";

// Heartbeat globalnej obecności: od momentu zalogowania (niezależnie od posiedzenia)
// klient co ~8 s informuje serwer, że użytkownik jest online.
function PresenceHeartbeat() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") return;
    let stopped = false;
    const ping = () => {
      if (stopped) return;
      fetch("/api/presence/ping", { method: "POST", cache: "no-store" }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 8000);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [status]);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PresenceHeartbeat />
      {children}
    </SessionProvider>
  );
}
