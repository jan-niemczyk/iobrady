"use client";
import { CardHeader } from "@/components/operator/ui";
import { IconArrowUp, IconArrowDown } from "@/components/ui/Icon";

import { useEffect, useState, useTransition } from "react";
import { useHotkeys } from "@/lib/useHotkeys";
import type { SpeakerStatus, SpeakerEntryType } from "@prisma/client";
import { notifyFailure } from "@/lib/feedback";

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
  /** false = wpis bez limitu (czas liczony w górę) */
  limitEnabled: boolean;
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
  /** Przełącznik limitu listy - stan zapamiętany na całe posiedzenie, domyślny dla nowych wpisów. */
  limitEnabled: boolean;
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
      if (!r.ok) { await notifyFailure(r); return; }
      onUpdate();
    });
  }

  // Sortowanie: SPEAKING jako pierwsze, potem WAITING z priorytetem typu, potem FINISHED/WITHDRAWN
  const statusOrder: SpeakerStatus[] = ["SPEAKING", "WAITING", "FINISHED", "WITHDRAWN"];
  const typeOrder: Record<SpeakerEntryType, number> = { FORMAL_MOTION: 0, AD_VOCEM: 1, REGULAR: 2 };
  const entries = [...(list?.entries ?? [])].sort((a, b) => {
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

  // Skróty operatora (mówcy). Hook MUSI stać przed warunkowymi `return` poniżej - inaczej po
  // zakończeniu punktu (brak listy) React zgłasza "Rendered fewer hooks" (#300) i panel się wysypuje.
  // Skróty operatora (mówcy):
  //  G - udziel głosu następnemu oczekującemu (pierwszy w kolejce, wg bieżącego sortowania),
  //  K lub Spacja - zakończ bieżącą wypowiedź,
  //  + / - - dodaj / odejmij 30 s bieżącemu mówcy.
  const firstWaiting = waiting[0];
  useHotkeys([
    { key: "g", enabled: !!list && !pending && !speaking && !!firstWaiting, action: () => firstWaiting && act("POST", `/api/speaker-entries/${firstWaiting.id}/start`), description: "Udziel głosu następnemu" },
    { key: "k", enabled: !!list && !pending && !!speaking, action: () => speaking && act("POST", `/api/speaker-entries/${speaking.id}/end`), description: "Zakończ wypowiedź" },
    { key: " ", enabled: !!list && !pending && !!speaking, action: () => speaking && act("POST", `/api/speaker-entries/${speaking.id}/end`), description: "Zakończ wypowiedź" },
    { key: "+", enabled: !!list && !pending && !!speaking, action: () => speaking && act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: 30 }), description: "+30 s" },
    { key: "=", enabled: !!list && !pending && !!speaking, action: () => speaking && act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: 30 }), description: "+30 s" },
    { key: "-", enabled: !!list && !pending && !!speaking, action: () => speaking && act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: -30 }), description: "-30 s" },
  ], [pending, speaking?.id, firstWaiting?.id]);

  if (!agendaItemId) {
    return (
      <div className="card">
        <CardHeader title="Lista mówców" />
        <div className="card-body small text-body-secondary">
          Rozpocznij punkt porządku, aby zarządzać listą mówców.
        </div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="card">
        <CardHeader title="Lista mówców" />
        <div className="card-body">
          <p className="small text-body-secondary mb-3">
            Dla tego punktu nie utworzono jeszcze listy mówców.
          </p>
          <div className="d-flex flex-wrap gap-2">
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
      </div>
    );
  }

  // Wszyscy uczestnicy zawsze dostępni w dropdown. Endpoint odrzuci powtórne dodanie tej samej osoby
  // - to lepsze UX niż znikanie nazwiska, które dezorientuje operatora.
  const availableParticipants = participants;

  const addEntry = (entryType: SpeakerEntryType, priority?: boolean) => {
    act("POST", `/api/speakerlists/${list.id}/entries`, { userId: addingUserId, entryType, ...(priority ? { priority: true } : {}) });
    setAddingUserId("");
  };

  return (
    <div className="card">
      <CardHeader
        title="Lista mówców"
        right={
          <div className="d-flex align-items-center gap-2">
            <div className="form-check form-switch mb-0 small" title="Limit czasu dla całej listy (stan zapamiętywany na całe posiedzenie). Bez limitu czas liczy się w górę.">
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id={`sl-limit-${list.id}`}
                checked={list.limitEnabled}
                disabled={pending}
                onChange={(e) => act("PATCH", `/api/speakerlists/${list.id}`, { limitEnabled: e.target.checked })}
              />
              <label className="form-check-label text-nowrap" htmlFor={`sl-limit-${list.id}`}>{list.limitEnabled ? "Limit" : "Bez limitu"}</label>
            </div>
            {list.limitEnabled && (
              <div className="input-group input-group-sm" style={{ width: 104 }} title="Domyślny limit czasu wystąpienia w sekundach (puste = limit z ustawień)">
                <input
                  type="number"
                  min={0}
                  className="form-control"
                  aria-label="Domyślny limit czasu (s)"
                  value={list.defaultTimeLimitSec ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                    act("PATCH", `/api/speakerlists/${list.id}`, { defaultTimeLimitSec: v });
                  }}
                />
                <span className="input-group-text">s</span>
              </div>
            )}
          </div>
        }
      />

      {/* Ustawienia zapisów uczestników */}
      <div className="card-body py-2 border-bottom d-flex flex-wrap align-items-center gap-3 small">
        <div className="form-check form-switch mb-0">
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            id={`sl-self-${list.id}`}
            checked={list.selfSignupEnabled}
            onChange={(e) => act("PATCH", `/api/speakerlists/${list.id}`, { selfSignupEnabled: e.target.checked })}
          />
          <label className="form-check-label" htmlFor={`sl-self-${list.id}`}>Zapisy uczestników</label>
        </div>
        {list.selfSignupEnabled && (
          <div className="d-flex flex-wrap align-items-center gap-3">
            <span className="text-body-secondary">Dozwolone:</span>
            <div className="form-check mb-0" title="Zwykłe zgłoszenie do dyskusji (zapamiętywane dla posiedzenia)">
              <input className="form-check-input" type="checkbox" id={`sl-reg-${list.id}`} checked={list.allowRegular}
                onChange={(e) => { act("PATCH", `/api/speakerlists/${list.id}`, { allowRegular: e.target.checked }); act("PATCH", `/api/meetings/${meetingId}`, { speakerDefaultRegular: e.target.checked }); }} />
              <label className="form-check-label" htmlFor={`sl-reg-${list.id}`}>dyskusja</label>
            </div>
            <div className="form-check mb-0" title="Zgłoszenia ad vocem (zapamiętywane dla posiedzenia)">
              <input className="form-check-input" type="checkbox" id={`sl-av-${list.id}`} checked={list.allowAdVocem}
                onChange={(e) => { act("PATCH", `/api/speakerlists/${list.id}`, { allowAdVocem: e.target.checked }); act("PATCH", `/api/meetings/${meetingId}`, { speakerDefaultAdVocem: e.target.checked }); }} />
              <label className="form-check-label" htmlFor={`sl-av-${list.id}`}>ad vocem</label>
            </div>
            <div className="form-check mb-0" title="Zgłoszenia wniosku formalnego (zapamiętywane dla posiedzenia)">
              <input className="form-check-input" type="checkbox" id={`sl-fm-${list.id}`} checked={list.allowFormalMotion}
                onChange={(e) => { act("PATCH", `/api/speakerlists/${list.id}`, { allowFormalMotion: e.target.checked }); act("PATCH", `/api/meetings/${meetingId}`, { speakerDefaultFormalMotion: e.target.checked }); }} />
              <label className="form-check-label" htmlFor={`sl-fm-${list.id}`}>wniosek formalny</label>
            </div>
          </div>
        )}
      </div>

      {/* AKTUALNIE PRZEMAWIAJĄCY */}
      {speaking && (
        <div className="card-body bg-danger-subtle border-bottom border-danger-subtle">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div className="min-w-0">
              <div className="small fw-semibold text-danger">Przemawia</div>
              <div className="fw-semibold" style={{ overflowWrap: "anywhere" }}>{speaking.userName}</div>
            </div>
            <SpeakerTimer entry={speaking} />
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <EntryLimitSwitch entry={speaking} disabled={pending} onChange={(v) => act("PATCH", `/api/speaker-entries/${speaking.id}`, { limitEnabled: v })} />
              <div className="btn-group btn-group-sm" role="group" aria-label="Korekta czasu">
                <button className="btn" disabled={pending} onClick={() => act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: -30 })} title="Skróć o 30 sekund">-30 s</button>
                <button className="btn" disabled={pending} onClick={() => act("PATCH", `/api/speaker-entries/${speaking.id}`, { addSeconds: 30 })} title="Wydłuż o 30 sekund">+30 s</button>
              </div>
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act("POST", `/api/speaker-entries/${speaking.id}/end`)}>
                Zakończ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCZEKUJĄCY */}
      {waiting.length > 0 ? (
        <ul className="list-group list-group-flush">
          {waiting.map((e, idx) => (
            <li key={e.id} className="list-group-item d-flex flex-wrap align-items-center gap-2">
              <span className="row-num mono small">{idx + 1}.</span>
              <div className="d-flex flex-wrap align-items-center gap-1 min-w-0 flex-grow-1" style={{ flexBasis: 160 }}>
                <span className="text-truncate" title={e.userName}>{e.userName}</span>
                {e.entryType === "AD_VOCEM" && <span className="badge bg-danger-subtle text-danger-emphasis">Ad vocem</span>}
                {e.entryType === "FORMAL_MOTION" && <span className="badge bg-warning-subtle text-warning-emphasis">Wniosek formalny</span>}
                {e.priority && <span className="badge bg-success-subtle text-success-emphasis">Priorytet</span>}
              </div>
              <div className="d-flex align-items-center gap-1 ms-auto">
                <EntryLimitSwitch entry={e} disabled={pending} onChange={(v) => act("PATCH", `/api/speaker-entries/${e.id}`, { limitEnabled: v })} />
                {e.limitEnabled && <div className="input-group input-group-sm" style={{ width: 104 }} title="Limit czasu wystąpienia w sekundach. 0 lub puste = brak limitu.">
                  <input
                    type="number"
                    min={0}
                    className="form-control mono"
                    aria-label="Limit czasu (s)"
                    placeholder="limit"
                    defaultValue={e.timeLimitSec ?? ""}
                    onBlur={(ev) => {
                      const raw = ev.currentTarget.value.trim();
                      const v = raw === "" ? null : parseInt(raw, 10);
                      if (v === (e.timeLimitSec ?? null)) return;
                      act("PATCH", `/api/speaker-entries/${e.id}`, { timeLimitSec: v });
                    }}
                  />
                  <span className="input-group-text">s</span>
                </div>}
                <div className="btn-group btn-group-sm" role="group" aria-label="Kolejność">
                  <button className="btn" disabled={pending || idx === 0} onClick={() => act("PATCH", `/api/speaker-entries/${e.id}`, { move: "up" })} title="W górę"><IconArrowUp size={13} /></button>
                  <button className="btn" disabled={pending || idx === waiting.length - 1} onClick={() => act("PATCH", `/api/speaker-entries/${e.id}`, { move: "down" })} title="W dół"><IconArrowDown size={13} /></button>
                </div>
                <button className="btn btn-primary btn-sm" disabled={pending || !!speaking} onClick={() => act("POST", `/api/speaker-entries/${e.id}/start`)}>Start</button>
                <button className="btn btn-sm btn-outline-danger" disabled={pending} onClick={() => act("DELETE", `/api/speaker-entries/${e.id}`)}>Usuń</button>
              </div>
            </li>
          ))}
        </ul>
      ) : !speaking && (
        <div className="card-body small text-body-secondary">Nikt nie oczekuje na głos.</div>
      )}

      {/* DODAJ MÓWCĘ */}
      <div className="card-footer bg-body-tertiary d-flex flex-column gap-2">
        <select
          className="form-select"
          aria-label="Uczestnik do dopisania"
          value={addingUserId}
          onChange={(e) => setAddingUserId(e.target.value)}
        >
          <option value="">Wybierz uczestnika…</option>
          {availableParticipants.map((p) => (
            <option key={p.id} value={p.userId}>{p.name}{!p.hasVotingRight && " (bez prawa)"}</option>
          ))}
        </select>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" disabled={pending || !addingUserId} onClick={() => addEntry("REGULAR")}>
            + Zwykły
          </button>
          <button className="btn btn-sm btn-outline-success" disabled={pending || !addingUserId} onClick={() => addEntry("REGULAR", true)} title="Priorytet - wskakuje na początek zgłoszeń zwykłych">
            + Priorytet
          </button>
          <button className="btn btn-sm" disabled={pending || !addingUserId} onClick={() => addEntry("FORMAL_MOTION")} title="Wniosek formalny - skacze przed zgłoszenia zwykłe">
            + Wniosek formalny
          </button>
          <button className="btn btn-sm" disabled={pending || !addingUserId} onClick={() => addEntry("AD_VOCEM")} title="Ad vocem - najwyższy priorytet, ponad wnioski formalne">
            + Ad vocem
          </button>
        </div>

        {guests.length > 0 && (
          <div className="d-flex align-items-center gap-2 pt-2 border-top">
            <select className="form-select" aria-label="Gość do dopisania" value={addingGuestId} onChange={(e) => setAddingGuestId(e.target.value)}>
              <option value="">Dopisz gościa z katalogu…</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>{g.lastName} {g.firstName}{g.role ? ` (${g.role})` : ""}</option>
              ))}
            </select>
            <button
              className="btn btn-sm"
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
        <details className="border-top">
          <summary className="card-body py-2 small text-body-secondary" style={{ cursor: "pointer" }}>
            Historia ({past.length})
          </summary>
          <ul className="list-group list-group-flush border-top">
            {past.map((e) => (
              <li key={e.id} className="list-group-item d-flex justify-content-between gap-2 small text-body-secondary">
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
    <div className="text-end">
      <div className={`num fs-3 fw-semibold lh-1${over ? " text-danger" : ""}`}>
        {formatDuration(displaySec, overtime)}
      </div>
      {effectiveLimit != null && (
        <div className="small mono mt-1 text-body-secondary">
          limit: {formatDuration(effectiveLimit)}
          {entry.timeAdjustmentSec !== 0 && (
            <span className="ms-1">
              ({entry.timeAdjustmentSec > 0 ? "+" : ""}{entry.timeAdjustmentSec}s)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Przełącznik limitu pojedynczego wystąpienia (domyślnie stan przełącznika listy). */
export function EntryLimitSwitch({ entry, disabled, onChange }: {
  entry: { id: string; limitEnabled: boolean };
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="form-check form-switch mb-0 small" title="Limit czasu tego wystąpienia. Bez limitu czas liczy się w górę.">
      <input
        className="form-check-input"
        type="checkbox"
        role="switch"
        id={`entry-limit-${entry.id}`}
        aria-label="Limit czasu wystąpienia"
        checked={entry.limitEnabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {!entry.limitEnabled && <label className="form-check-label text-nowrap text-body-secondary" htmlFor={`entry-limit-${entry.id}`}>bez limitu</label>}
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
