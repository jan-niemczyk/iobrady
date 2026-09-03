"use client";
import { IconArrowUp, IconArrowDown } from "@/components/ui/Icon";

import { useEffect, useState, useTransition } from "react";
import { useHotkeys } from "@/lib/useHotkeys";
import type { SpeakerStatus, SpeakerEntryType } from "@prisma/client";

interface SpeakerEntry {
  id: string;
  userId: string | null;
  userName: string;
  groupShort?: string | null;
  isGuest?: boolean;
  order: number;
  entryType: SpeakerEntryType;
  priority?: boolean;
  status: SpeakerStatus;
  timeLimitSec: number | null;
  timeAdjustmentSec: number;
  startedAt: string | null;
  endedAt: string | null;
  consumedSec: number | null;
}

interface SpeakerListData {
  id: string;
  agendaItemId: string | null;
  selfSignupEnabled: boolean;
  allowRegular: boolean;
  allowAdVocem: boolean;
  allowFormalMotion: boolean;
  visibleToParticipants: boolean;
  defaultTimeLimitSec: number | null;
  entries: SpeakerEntry[];
}

export function SpeakersPanel({
  agendaItemId,
  meetingId,
  list,
  participants,
  onUpdate,
}: {
  agendaItemId: string | null;
  meetingId: string;
  list: SpeakerListData | null;
  participants: { id: string; userId: string; name: string; hasVotingRight: boolean }[];
  onUpdate: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [addingUserId, setAddingUserId] = useState<string>("");
  const [guests, setGuests] = useState<{ id: string; firstName: string; lastName: string; role: string | null }[]>([]);
  const [addingGuestId, setAddingGuestId] = useState<string>("");

  useEffect(() => {
    fetch("/api/guests", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { guests: [] })
      .then((d) => setGuests(d.guests ?? []))
      .catch(() => {});
  }, []);

  function act(method: "POST" | "PATCH" | "DELETE", path: string, body?: object) {
    startTransition(async () => {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) { alert(await r.text()); return; }
      onUpdate();
    });
  }

  if (!agendaItemId) {
    return (
      <div className="card p-5 text-sm" style={{ color: "var(--color-ink-3)" }}>
        Rozpocznij punkt porządku, aby zarządzać listą mówców.
      </div>
    );
  }

  if (!list) {
    return (
      <div className="card p-5">
        <div className="eyebrow mb-2">Lista mówców</div>
        <p className="text-sm mb-4" style={{ color: "var(--color-ink-3)" }}>
          Dla tego punktu nie utworzono jeszcze listy mówców.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() => act("POST", `/api/agenda/${agendaItemId}/speakerlist`, { selfSignupEnabled: false })}
          >
            Utwórz listę (operator dodaje)
          </button>
          <button
            className="btn"
            disabled={pending}
            onClick={() => act("POST", `/api/agenda/${agendaItemId}/speakerlist`, { selfSignupEnabled: true })}
          >
            Utwórz z zapisami uczestników
          </button>
        </div>
      </div>
    );
  }

  // Sortowanie: SPEAKING jako pierwsze, potem WAITING z priorytetem typu, potem FINISHED/WITHDRAWN
  const statusOrder: SpeakerStatus[] = ["SPEAKING", "WAITING", "FINISHED", "WITHDRAWN"];
  const typeOrder: Record<SpeakerEntryType, number> = { FORMAL_MOTION: 0, AD_VOCEM: 1, REGULAR: 2 };
  const entries = [...list.entries].sort((a, b) => {
    const da = statusOrder.indexOf(a.status); const db = statusOrder.indexOf(b.status);
    if (da !== db) return da - db;
    // W obrębie tego samego statusu - sortuj po typie, potem po order
    if (a.status === "WAITING" || a.status === "SPEAKING") {
      const ta = typeOrder[a.entryType]; const tb = typeOrder[b.entryType];
      if (ta !== tb) return ta - tb;
    }
    return a.order - b.order;
  });

  const speaking = entries.find((e) => e.status === "SPEAKING");
  const waiting = entries.filter((e) => e.status === "WAITING");
  const past = entries.filter((e) => e.status === "FINISHED" || e.status === "WITHDRAWN");

  // Skróty operatora (mówcy):
  //  G - udziel głosu następnemu oczekującemu (pierwszy w kolejce, wg bieżącego sortowania),
  //  K lub Spacja - zakończ bieżącą wypowiedź,
  //  + / - - dodaj / odejmij 30 s bieżącemu mówcy.
  const firstWaiting = waiting[0];
  useHotkeys([
    { key: "g", enabled: !pending && !speaking && !!firstWaiting, action: () => firstWaiting && act("POST", `/api/speaker-entries/${firstWaiting.id}/start`), description: "Udziel głosu następnemu" },
    { key: "k", enabled: !pending && !!speaking, action: () => speaking && act("POST", `/api/speaker-entries/${speaking.id}/end`), description: "Zakończ wypowiedź" },
    { key: " ", enabled: !pending && !!speaking, action: () => speaking && act("POST", `/api/speaker-entries/${speaking.id}/end`), description: "Zakończ wypowiedź" },
    { key: "+", enabled: !pending && !!speaking, action: () => speaking && act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: 30 }), description: "+30 s" },
    { key: "=", enabled: !pending && !!speaking, action: () => speaking && act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: 30 }), description: "+30 s" },
    { key: "-", enabled: !pending && !!speaking, action: () => speaking && act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: -30 }), description: "-30 s" },
  ], [pending, speaking?.id, firstWaiting?.id]);

  // Wszyscy uczestnicy zawsze dostępni w dropdown. Endpoint odrzuci powtórne dodanie tej samej osoby
  // - to lepsze UX niż znikanie nazwiska, które dezorientuje operatora.
  const availableParticipants = participants;

  return (
    <div className="card">
      <div className="px-5 py-3 border-b border-[var(--color-rule)] flex items-center justify-between">
        <div className="eyebrow">Lista mówców</div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={list.selfSignupEnabled}
              onChange={(e) => act("PATCH", `/api/speakerlists/${list.id}`, { selfSignupEnabled: e.target.checked })}
            />
            <span>Zapisy uczestników</span>
          </label>
          {list.selfSignupEnabled && (
            <>
              <span>-</span>
              <label className="flex items-center gap-1 cursor-pointer" title="Zwykłe zgłoszenie do dyskusji (zapamiętywane dla posiedzenia)">
                <input type="checkbox" checked={list.allowRegular}
                  onChange={(e) => { act("PATCH", `/api/speakerlists/${list.id}`, { allowRegular: e.target.checked }); act("PATCH", `/api/meetings/${meetingId}`, { speakerDefaultRegular: e.target.checked }); }} />
                <span>dyskusja</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer" title="Zgłoszenia ad vocem (zapamiętywane dla posiedzenia)">
                <input type="checkbox" checked={list.allowAdVocem}
                  onChange={(e) => { act("PATCH", `/api/speakerlists/${list.id}`, { allowAdVocem: e.target.checked }); act("PATCH", `/api/meetings/${meetingId}`, { speakerDefaultAdVocem: e.target.checked }); }} />
                <span>ad vocem</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer" title="Zgłoszenia wniosku formalnego (zapamiętywane dla posiedzenia)">
                <input type="checkbox" checked={list.allowFormalMotion}
                  onChange={(e) => { act("PATCH", `/api/speakerlists/${list.id}`, { allowFormalMotion: e.target.checked }); act("PATCH", `/api/meetings/${meetingId}`, { speakerDefaultFormalMotion: e.target.checked }); }} />
                <span>wniosek form.</span>
              </label>
            </>
          )}
          <span>-</span>
          <label className="flex items-center gap-1">
            <span>Limit (s):</span>
            <input
              type="number"
              min={0}
              className="input"
              style={{ width: 70, padding: "2px 6px", fontSize: 12 }}
              value={list.defaultTimeLimitSec ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                act("PATCH", `/api/speakerlists/${list.id}`, { defaultTimeLimitSec: v });
              }}
            />
          </label>
        </div>
      </div>

      {/* AKTUALNIE PRZEMAWIAJĄCY */}
      {speaking && (
        <div className="px-5 py-4 border-b-2" style={{ borderColor: "var(--color-live)", background: "var(--color-no-bg)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="eyebrow" style={{ color: "var(--color-no)" }}>Przemawia</div>
              <div className="font-medium text-base">{speaking.userName}</div>
            </div>
            <SpeakerTimer entry={speaking} />
            <div className="flex gap-2 items-center">
              {/* Manipulacja zegarem w trakcie */}
              <button
                className="btn"
                style={{ padding: "4px 8px", fontSize: 11 }}
                disabled={pending}
                onClick={() => act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: -30 })}
                title="Skróć o 30 sekund"
              >
                -30s
              </button>
              <button
                className="btn"
                style={{ padding: "4px 8px", fontSize: 11 }}
                disabled={pending}
                onClick={() => act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: 30 })}
                title="Wydłuż o 30 sekund"
              >
                +30s
              </button>
              <button className="btn btn-primary" disabled={pending} onClick={() => act("POST", `/api/speaker-entries/${speaking.id}/end`)}>
                Zakończ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCZEKUJĄCY */}
      {waiting.length > 0 && (
        <ul className="divide-y divide-[var(--color-rule-soft)]">
          {waiting.map((e, idx) => (
            <li key={e.id} className="px-5 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="mono text-xs w-6 text-right" style={{ color: "var(--color-ink-3)" }}>{idx + 1}.</span>
                <span className="text-sm truncate">{e.userName}</span>
                {e.entryType === "AD_VOCEM" && (
                  <span className="pill" style={{ background: "var(--color-no-bg)", color: "var(--color-no)", fontSize: 9 }}>AD VOCEM</span>
                )}
                {e.entryType === "FORMAL_MOTION" && (
                  <span className="pill" style={{ background: "var(--color-abstain-bg)", color: "var(--color-abstain)", fontSize: 9 }}>WNIOSEK</span>
                )}
                {e.priority && (
                  <span className="pill" style={{ background: "var(--color-yes-bg)", color: "var(--color-yes)", fontSize: 9 }}>PRIORYTET</span>
                )}
                <label className="flex items-center gap-1 text-xs" title="Limit czasu wystąpienia w sekundach. 0 lub puste = brak limitu.">
                  <span className="mono" style={{ color: "var(--color-ink-3)" }}>limit:</span>
                  <input
                    type="number"
                    min={0}
                    className="input mono"
                    style={{ width: 60, padding: "1px 4px", fontSize: 11 }}
                    defaultValue={e.timeLimitSec ?? ""}
                    onBlur={(ev) => {
                      const raw = ev.currentTarget.value.trim();
                      const v = raw === "" ? null : parseInt(raw, 10);
                      if (v === (e.timeLimitSec ?? null)) return;
                      act("PATCH", `/api/speaker-entries/${e.id}`, { timeLimitSec: v });
                    }}
                  />
                  <span style={{ color: "var(--color-ink-3)" }}>s</span>
                </label>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="btn" style={{ padding: "4px 6px", fontSize: 11 }} disabled={pending || idx === 0} onClick={() => act("PATCH", `/api/speaker-entries/${e.id}`, { move: "up" })}><IconArrowUp size={12} /></button>
                <button className="btn" style={{ padding: "4px 6px", fontSize: 11 }} disabled={pending || idx === waiting.length - 1} onClick={() => act("PATCH", `/api/speaker-entries/${e.id}`, { move: "down" })}><IconArrowDown size={12} /></button>
                <button className="btn btn-primary" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending || !!speaking} onClick={() => act("POST", `/api/speaker-entries/${e.id}/start`)}>Start</button>
                <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} disabled={pending} onClick={() => act("DELETE", `/api/speaker-entries/${e.id}`)}>Usuń</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* DODAJ MÓWCĘ */}
      <div className="px-5 py-3 border-t border-[var(--color-rule-soft)] bg-[var(--color-paper-2)]">
        <div className="flex items-center gap-2 mb-2">
          <select
            className="input"
            value={addingUserId}
            onChange={(e) => setAddingUserId(e.target.value)}
          >
            <option value="">- wybierz uczestnika -</option>
            {availableParticipants.map((p) => (
              <option key={p.id} value={p.userId}>{p.name}{!p.hasVotingRight && " (bez prawa)"}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-primary"
            style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}
            disabled={pending || !addingUserId}
            onClick={() => {
              act("POST", `/api/speakerlists/${list.id}/entries`, { userId: addingUserId, entryType: "REGULAR" });
              setAddingUserId("");
            }}
          >
            + Zwykły
          </button>
          <button
            className="btn"
            style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap", borderColor: "var(--color-yes)", color: "var(--color-yes)" }}
            disabled={pending || !addingUserId}
            onClick={() => {
              act("POST", `/api/speakerlists/${list.id}/entries`, { userId: addingUserId, entryType: "REGULAR", priority: true });
              setAddingUserId("");
            }}
            title="Priorytet - wskakuje na początek zgłoszeń zwykłych"
          >
            + Priorytet
          </button>
          <button
            className="btn"
            style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}
            disabled={pending || !addingUserId}
            onClick={() => {
              act("POST", `/api/speakerlists/${list.id}/entries`, { userId: addingUserId, entryType: "FORMAL_MOTION" });
              setAddingUserId("");
            }}
            title="Wniosek formalny - skacze przed zgłoszenia zwykłe"
          >
            + Wniosek formalny
          </button>
          <button
            className="btn"
            style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}
            disabled={pending || !addingUserId}
            onClick={() => {
              act("POST", `/api/speakerlists/${list.id}/entries`, { userId: addingUserId, entryType: "AD_VOCEM" });
              setAddingUserId("");
            }}
            title="Ad vocem - najwyższy priorytet, ponad wnioski formalne"
          >
            + Ad vocem
          </button>
        </div>

        {guests.length > 0 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-rule-soft)]">
            <select className="input" style={{ flex: 1 }} value={addingGuestId} onChange={(e) => setAddingGuestId(e.target.value)}>
              <option value="">- dopisz gościa z katalogu -</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>{g.lastName} {g.firstName}{g.role ? ` (${g.role})` : ""}</option>
              ))}
            </select>
            <button
              className="btn"
              style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}
              disabled={pending || !addingGuestId}
              onClick={() => { act("POST", `/api/speakerlists/${list.id}/entries`, { guestId: addingGuestId, entryType: "REGULAR" }); setAddingGuestId(""); }}
              title="Gość zabiera głos - nie jest radnym"
            >
              + Gość
            </button>
          </div>
        )}
      </div>

      {/* HISTORIA */}
      {past.length > 0 && (
        <details className="border-t border-[var(--color-rule-soft)]">
          <summary className="px-5 py-2 text-xs cursor-pointer" style={{ color: "var(--color-ink-3)" }}>
            Historia ({past.length})
          </summary>
          <ul className="divide-y divide-[var(--color-rule-soft)]">
            {past.map((e) => (
              <li key={e.id} className="px-5 py-2 flex items-center justify-between text-xs" style={{ color: "var(--color-ink-3)" }}>
                <span>{e.userName}</span>
                <span className="mono">
                  {e.status === "WITHDRAWN" ? "wycofany" : `${formatLimit(e.consumedSec ?? 0)} użytego`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SpeakerTimer({ entry }: { entry: SpeakerEntry }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);

  if (!entry.startedAt) return null;
  const elapsed = Math.floor((now - new Date(entry.startedAt).getTime()) / 1000);
  const baseLimit = entry.timeLimitSec;
  // Efektywny limit = oryginalny + korekta z przycisków +30s / -30s
  const effectiveLimit = baseLimit != null ? baseLimit + (entry.timeAdjustmentSec ?? 0) : null;

  // Z limitem: countdown od limit do 0, potem schodzi w minus (overtime).
  // Po przekroczeniu (elapsed >= limit) wyświetlamy ze znakiem "-" włącznie z "00:00:00".
  // Bez limitu: zwykłe odliczanie w górę.
  const displaySec = effectiveLimit != null ? effectiveLimit - elapsed : elapsed;
  const overtime = effectiveLimit != null && elapsed >= effectiveLimit;
  const over = displaySec < 0 || overtime;

  return (
    <div className="text-right">
      <div
        className="num"
        style={{
          fontSize: 28,
          lineHeight: 1,
          color: over ? "var(--color-no)" : "var(--color-ink)",
        }}
      >
        {formatDuration(displaySec, overtime)}
      </div>
      {effectiveLimit != null && (
        <div className="text-xs mono mt-1" style={{ color: "var(--color-ink-3)" }}>
          limit: {formatDuration(effectiveLimit)}
          {entry.timeAdjustmentSec !== 0 && (
            <span style={{ marginLeft: 6 }}>
              ({entry.timeAdjustmentSec > 0 ? "+" : ""}{entry.timeAdjustmentSec}s)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Formatuje liczbę sekund jako HH:MM:SS.
 * Dla wartości ujemnych lub gdy `forceNegative=true` (czas przekroczony) zwraca format -HH:MM:SS.
 * To rozwiązuje przypadek "00:00:00" - po przekroczeniu nawet zero pokazuje minus.
 */
function formatDuration(sec: number, forceNegative = false): string {
  const sign = sec < 0 || forceNegative ? "-" : "";
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${sign}${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Alias dla zachowania kompatybilności w pozostałej części pliku.
const formatLimit = formatDuration;
