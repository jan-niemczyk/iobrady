"use client";

import { useEffect, useState } from "react";
import { VoteBallot, type ActiveVote } from "@/components/participant/ParticipantSessionClient";

// Widok "wyświetlacz" (mini) - wąskie, pełne okno nakładane na stream/prezentację.
// Zamysł (wzorowany na wyświetlaczu sejmowym): pokazuje imię i nazwisko uczestnika (zamiast
// legitymacji) oraz - z NAJWYŻSZYM priorytetem - AKTYWNE GŁOSOWANIE, w którym można oddać głos
// (z tego widoku, także skrótami klawiszowymi). Jednolite tło. Bez pełnej nazwy głosowania.

interface SessionData {
  activeVote?: ActiveVote | null;
  myFirstName?: string;
  myLastName?: string;
  currentAgendaItem?: { number: string; title: string } | null;
  speakerList?: { entries: { userName: string; isMe: boolean; status: string }[] } | null;
  meetingName?: string;
  attendanceOpen?: boolean;
}

export function MiniDisplayClient() {
  const [data, setData] = useState<SessionData | null>(null);
  const [clock, setClock] = useState("");
  const [tick, setTick] = useState(0);

  async function poll() {
    try {
      const r = await fetch("/api/me/session", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch { /* pomiń błąd pojedynczego pollingu */ }
  }

  useEffect(() => {
    poll();
    const i = setInterval(poll, 2000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setClock(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const fullName = `${data?.myFirstName ?? ""} ${data?.myLastName ?? ""}`.trim() || "-";
  const vote = data?.activeVote ?? null;
  const speaking = data?.speakerList?.entries.find((e) => e.status === "SPEAKING");

  let accent = "#1D4ED8";
  if (vote) accent = "#B45309";
  else if (speaking) accent = "#047857";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#0B1220", color: "#fff",
        display: "flex", flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
        padding: "14px 18px",
      }}
    >
      {/* Górny pasek: imię i nazwisko (zamiast legitymacji) + zegar + wyjście */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${accent}`, paddingBottom: 8, gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fullName}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", opacity: 0.9 }}>{clock}</div>
          <a href="/session" title="Wyjdź z wyświetlacza" style={{ color: "#fff", opacity: 0.7, textDecoration: "none", fontSize: 20, lineHeight: 1, padding: "2px 8px", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6 }}>✕</a>
        </div>
      </div>

      {/* Środek: gdy trwa głosowanie - realny panel do oddania głosu (priorytet). Inaczej krótki status. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: 12 }}>
        {vote ? (
          <div style={{ background: "#fff", color: "#0F1115", borderRadius: 10, padding: 14 }}>
            <VoteBallot key={vote.id} vote={vote} onCast={() => setTick((t) => t + 1)} />
          </div>
        ) : data?.attendanceOpen ? (
          <div style={{ fontSize: 24, fontWeight: 800 }}>Trwa sprawdzenie obecności</div>
        ) : speaking ? (
          <div>
            <div style={{ fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7 }}>Zabiera głos</div>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.05 }}>{speaking.userName}</div>
          </div>
        ) : data?.currentAgendaItem ? (
          <div>
            <div style={{ fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.7 }}>Punkt {data.currentAgendaItem.number}</div>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.15 }}>{data.currentAgendaItem.title}</div>
          </div>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 600, opacity: 0.85 }}>Posiedzenie w toku</div>
        )}
      </div>

      {/* Dolny pasek: nazwa posiedzenia (bez pełnej nazwy głosowania) */}
      <div style={{ fontSize: 12, opacity: 0.55, borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
        {data?.meetingName ?? ""}
      </div>
    </div>
  );
}
