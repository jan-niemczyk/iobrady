"use client";

import { useEffect, useState, useTransition } from "react";

interface CheckEntry {
  userId: string; lastName: string; firstName: string;
  clubShort: string | null; present: boolean; markedAt: string | null;
}
interface Check {
  id: string; kind: string; status: string;
  startedAt: string; closedAt: string | null;
  presentCount: number | null; eligibleCount: number | null;
  quorumRequired: number | null; quorumMet: boolean | null;
  entries: CheckEntry[];
}
interface Participant { id: string; userId: string; name: string; hasVotingRight: boolean; groupShort: string | null; present: boolean }

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

export function AttendanceCheckPanel({
  meetingId, activeCheckId, selfCheckEnabled, onToggleSelfCheck, onDownloadPdf, participants,
}: {
  meetingId: string;
  activeCheckId: string | null;
  selfCheckEnabled: boolean;
  onToggleSelfCheck: (value: boolean) => void;
  onDownloadPdf: (checkId: string) => void;
  participants: Participant[];
}) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [editingCheckId, setEditingCheckId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = () => {
    fetch(`/api/meetings/${meetingId}/attendance-checks`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { checks: [] })
      .then((d) => setChecks(d.checks ?? []))
      .catch(() => {});
  };
  useEffect(() => {
    load();
    // Gdy trwa sprawdzenie (activeCheckId), odświeżamy częściej, by licznik potwierdzeń rósł na żywo.
    const t = setInterval(load, activeCheckId ? 1200 : 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, activeCheckId]);

  const active = checks.find((c) => c.id === activeCheckId && c.status === "OPEN") ?? null;
  const history = checks.filter((c) => c.status !== "OPEN");
  const lastClosed = history.find((c) => c.status === "CLOSED") ?? null;

  useEffect(() => { if (active) setModalOpen(true); }, [active?.id]);

  const eligible = participants.filter((p) => p.hasVotingRight);
  const presentNow = eligible.filter((p) => p.present).length;

  function start(kind: "CONFIRMATION" | "INCREMENTAL" = "CONFIRMATION") {
    startTransition(async () => {
      await fetch(`/api/meetings/${meetingId}/attendance-check/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }),
      });
      load();
      setModalOpen(true);
    });
  }
  function mark(userId: string, present: boolean) {
    startTransition(async () => {
      await fetch(`/api/meetings/${meetingId}/attendance-check/mark`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, present }),
      });
      load();
    });
  }
  function finishCheck(action: "close" | "interrupt") {
    startTransition(async () => {
      await fetch(`/api/meetings/${meetingId}/attendance-check/close`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      load();
      setModalOpen(false);
    });
  }

  return (
    <div className="card">
      <div className="px-5 py-3 border-b border-[var(--color-rule-soft)]">
        <h3 className="eyebrow" style={{ margin: 0, marginBottom: 8 }}>Obecność</h3>
        <div className="flex flex-wrap items-center gap-1">
          <a href={`/meetings/${meetingId}/participants`} className="btn" style={{ padding: "5px 10px", fontSize: 12 }}>Uczestnicy</a>
          <a href="/guests" className="btn" style={{ padding: "5px 10px", fontSize: 12 }}>Goście</a>
          {active ? (
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => setModalOpen(true)}>
              Otwórz sprawdzenie ({active.entries.filter((e) => e.present).length}/{active.entries.length})
            </button>
          ) : (
            <>
              {lastClosed && (
                <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} disabled={pending} onClick={() => start("INCREMENTAL")} title="Popraw bieżący stan obecności bez pełnego sprawdzenia od zera">
                  Korekta
                </button>
              )}
              <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} disabled={pending} onClick={() => start("CONFIRMATION")}>
                Rozpocznij sprawdzenie
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Bieżący stan obecności = wynik ostatniego sprawdzenia/kworum. */}
        {lastClosed ? (
          <div className="text-sm mb-2">
            Obecnych wg ostatniej migawki: <b>{lastClosed.presentCount ?? presentNow}</b> / {lastClosed.eligibleCount ?? eligible.length}
            <span style={{ color: "var(--color-ink-3)" }}> - {kindLabel(lastClosed.kind)} {fmtTime(lastClosed.closedAt)}
              {lastClosed.quorumMet != null && (lastClosed.quorumMet ? " - kworum jest" : " - brak kworum")}</span>
          </div>
        ) : (
          <div className="text-sm mb-2" style={{ color: "var(--color-ink-3)" }}>
            Brak sprawdzenia obecności - wszyscy niepotwierdzeni. Rozpocznij sprawdzenie, aby ustalić obecność.
          </div>
        )}

        {history.length > 0 && (
          <div>
            <button className="btn" style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setHistoryOpen((v) => !v)}>
              {historyOpen ? "Ukryj historię" : `Historia sprawdzeń (${history.length})`}
            </button>
            {historyOpen && (
              <div className="mt-3 flex flex-col gap-2">
                {history.map((c) => (
                  <div key={c.id} className="p-3 border border-[var(--color-rule-soft)]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm">
                        <b>{fmtTime(c.startedAt)}</b>
                        <span style={{ color: "var(--color-ink-3)" }}>
                          {" - "}{kindLabel(c.kind)}{" - "}{c.status === "CLOSED" ? "zamknięte" : "przerwane"}
                          {c.presentCount != null && ` - ${c.presentCount}/${c.eligibleCount}`}
                        </span>
                      </div>
                      {c.status === "CLOSED" && (
                        <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => onDownloadPdf(c.id)}>Raport PDF</button>
                      )}
                      <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setEditingCheckId(editingCheckId === c.id ? null : c.id)}>
                        {editingCheckId === c.id ? "Zwiń" : "Edytuj"}
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "2px 8px", fontSize: 11, color: "var(--color-no)" }}
                        onClick={() => {
                          if (!window.confirm("Usunąć tę migawkę obecności? Operacji nie można cofnąć.")) return;
                          startTransition(async () => {
                            const r = await fetch(`/api/meetings/${meetingId}/attendance-checks/${c.id}`, { method: "DELETE" });
                            if (!r.ok) { alert(await r.text()); return; }
                            load();
                          });
                        }}
                      >Usuń</button>
                    </div>
                    {editingCheckId === c.id && (
                      <SnapshotEditor check={c} meetingId={meetingId} onSaved={() => { setEditingCheckId(null); load(); }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* WYSKAKUJĄCE OKNO: lista obecności z checkboxami */}
      {active && modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setModalOpen(false)}>
          <div className="card" style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-rule-soft)]">
              <h3 className="eyebrow" style={{ margin: 0 }}>Sprawdzenie obecności</h3>
              <span className="text-sm" style={{ fontWeight: 600 }}>Potwierdziło: {active.entries.filter((e) => e.present).length} / {active.entries.length}</span>
            </div>
            <div className="px-4 pt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={selfCheckEnabled} onChange={(e) => onToggleSelfCheck(e.target.checked)} />
                  <span>Radni potwierdzają sami</span>
                </label>
              </div>
              <input className="input mb-2" placeholder="Wyszukaj…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ fontSize: 12 }} />
            </div>
            <div style={{ overflowY: "auto", flex: 1 }} className="px-4">
              {active.entries
                .filter((e) => `${e.lastName} ${e.firstName}`.toLowerCase().includes(filter.toLowerCase()))
                .map((e) => (
                  <label key={e.userId} className="flex items-center gap-3 px-1 py-2 border-b border-[var(--color-rule-soft)] cursor-pointer">
                    <input type="checkbox" checked={e.present} disabled={pending} onChange={() => mark(e.userId, !e.present)} />
                    <span className="text-sm flex-1">
                      {e.lastName} {e.firstName}
                      {e.clubShort && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}> ({e.clubShort})</span>}
                      {e.present && e.markedAt && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}> {fmtTime(e.markedAt)}</span>}
                    </span>
                  </label>
                ))}
            </div>
            <div className="flex gap-2 p-4 border-t border-[var(--color-rule-soft)]">
              <button className="btn btn-primary" disabled={pending} onClick={() => finishCheck("close")}>Zamknij i zapisz</button>
              <button className="btn" disabled={pending} onClick={() => finishCheck("interrupt")}>Przerwij (bez zmian)</button>
              <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setModalOpen(false)}>Zwiń</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function kindLabel(k: string): string {
  return k === "QUORUM_VOTE" ? "głosowanie kworum" : k === "INCREMENTAL" ? "korekta" : "potwierdzenie";
}

// S6: edytor migawki - zmiana kto był obecny "w danej godzinie" + opcjonalne nadpisanie stanu bieżącego.
function SnapshotEditor({ check, meetingId, onSaved }: { check: Check; meetingId: string; onSaved: () => void }) {
  const [rows, setRows] = useState<{ userId: string; name: string; clubShort: string | null; present: boolean }[]>(
    check.entries.filter((e) => e.userId).map((e) => ({ userId: e.userId, name: `${e.lastName} ${e.firstName}`, clubShort: e.clubShort, present: e.present })),
  );
  const [applyToCurrent, setApplyToCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const presentCount = rows.filter((r) => r.present).length;

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/meetings/${meetingId}/attendance-checks/${check.id}/entries`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: rows.map((x) => ({ userId: x.userId, present: x.present })), applyToCurrent }),
    });
    setSaving(false);
    if (!r.ok) { alert(await r.text()); return; }
    onSaved();
  };

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-rule-soft)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>Obecnych: <b>{presentCount}</b> / {rows.length}</span>
        <input className="input" placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 11, width: 140 }} />
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }} className="border border-[var(--color-rule-soft)]">
        {rows.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).map((x) => (
          <label key={x.userId} className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-rule-soft)] last:border-0 cursor-pointer text-sm">
            <input type="checkbox" checked={x.present} onChange={() => setRows((arr) => arr.map((y) => y.userId === x.userId ? { ...y, present: !y.present } : y))} />
            <span className="flex-1">{x.name}</span>
            {x.clubShort && <span className="text-xs" style={{ color: "var(--color-ink-3)" }}>{x.clubShort}</span>}
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer">
        <input type="checkbox" checked={applyToCurrent} onChange={(e) => setApplyToCurrent(e.target.checked)} />
        <span>Nadpisz też bieżący stan obecności tą migawką</span>
      </label>
      <div className="flex gap-2 mt-2">
        <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: 12 }} disabled={saving} onClick={save}>{saving ? "Zapisuję…" : "Zapisz migawkę"}</button>
      </div>
    </div>
  );
}
