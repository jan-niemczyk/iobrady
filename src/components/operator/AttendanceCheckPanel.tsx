"use client";

import { CardHeader } from "@/components/operator/ui";
import { Modal } from "@/components/operator/Modal";
import { ask, notify, notifyFailure } from "@/lib/feedback";
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

  const presentCount = active ? active.entries.filter((e) => e.present).length : 0;
  return (
    <div className="card">
      <CardHeader
        title="Obecność"
        right={
          <>
            <a href={`/meetings/${meetingId}/participants`} className="btn btn-sm">Uczestnicy</a>
            <a href="/guests" className="btn btn-sm">Goście</a>
          </>
        }
      />

      <div className="card-body d-flex flex-column gap-3">
        {/* Bieżący stan obecności = wynik ostatniego sprawdzenia/kworum. */}
        {lastClosed ? (
          <div>
            <div>Obecnych wg ostatniej migawki: <span className="fw-semibold">{lastClosed.presentCount ?? presentNow}</span> / {lastClosed.eligibleCount ?? eligible.length}</div>
            <div className="small text-body-secondary">
              {kindLabel(lastClosed.kind)} {fmtTime(lastClosed.closedAt)}
              {lastClosed.quorumMet != null && (lastClosed.quorumMet ? " - kworum jest" : " - brak kworum")}
            </div>
          </div>
        ) : (
          <div className="small text-body-secondary">
            Brak sprawdzenia obecności - wszyscy niepotwierdzeni. Rozpocznij sprawdzenie, aby ustalić obecność.
          </div>
        )}

        <div className="d-flex flex-wrap gap-2">
          {active ? (
            <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
              Otwórz sprawdzenie ({presentCount}/{active.entries.length})
            </button>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start("CONFIRMATION")}>
                Rozpocznij sprawdzenie
              </button>
              {lastClosed && (
                <button className="btn btn-sm" disabled={pending} onClick={() => start("INCREMENTAL")} title="Popraw bieżący stan obecności bez pełnego sprawdzenia od zera">
                  Korekta
                </button>
              )}
            </>
          )}
          {history.length > 0 && (
            <button className="btn btn-sm" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
              {historyOpen ? "Ukryj historię" : `Historia (${history.length})`}
            </button>
          )}
        </div>
      </div>

      {history.length > 0 && historyOpen && (
        <ul className="list-group list-group-flush border-top">
          {history.map((c) => (
            <li key={c.id} className="list-group-item">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <div className="me-auto">
                  <span className="fw-semibold">{fmtTime(c.startedAt)}</span>
                  <span className="small text-body-secondary">
                    {" - "}{kindLabel(c.kind)}{" - "}{c.status === "CLOSED" ? "zamknięte" : "przerwane"}
                    {c.presentCount != null && ` - ${c.presentCount}/${c.eligibleCount}`}
                  </span>
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {c.status === "CLOSED" && (
                    <button className="btn btn-sm" onClick={() => onDownloadPdf(c.id)}>Raport PDF</button>
                  )}
                  <button className="btn btn-sm" onClick={() => setEditingCheckId(editingCheckId === c.id ? null : c.id)}>
                    {editingCheckId === c.id ? "Zwiń" : "Edytuj"}
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={async () => {
                      if (!(await ask({ title: "Usunąć migawkę obecności?", message: "Operacji nie można cofnąć.", confirmLabel: "Usuń", danger: true }))) return;
                      startTransition(async () => {
                        const r = await fetch(`/api/meetings/${meetingId}/attendance-checks/${c.id}`, { method: "DELETE" });
                        if (!r.ok) { await notifyFailure(r); return; }
                        notify.success("Migawka obecności została usunięta.");
                        load();
                      });
                    }}
                  >Usuń</button>
                </div>
              </div>
              {editingCheckId === c.id && (
                <SnapshotEditor check={c} meetingId={meetingId} onSaved={() => { setEditingCheckId(null); load(); }} />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Okno: lista obecności z checkboxami */}
      {active && modalOpen && (
        <Modal
          title="Sprawdzenie obecności"
          onClose={() => setModalOpen(false)}
          headerExtra={<span className="small fw-semibold">Potwierdziło: {presentCount} / {active.entries.length}</span>}
          footer={
            <>
              <button className="btn btn-primary" disabled={pending} onClick={() => finishCheck("close")}>Zamknij i zapisz</button>
              <button className="btn" disabled={pending} onClick={() => finishCheck("interrupt")}>Przerwij (bez zmian)</button>
              <button className="btn ms-auto" onClick={() => setModalOpen(false)}>Zwiń</button>
            </>
          }
        >
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <div className="form-check form-switch mb-0">
              <input className="form-check-input" type="checkbox" role="switch" id="att-self" checked={selfCheckEnabled} onChange={(e) => onToggleSelfCheck(e.target.checked)} />
              <label className="form-check-label" htmlFor="att-self">Radni potwierdzają sami</label>
            </div>
            <input className="form-control form-control-sm" style={{ maxWidth: 220 }} placeholder="Wyszukaj…" aria-label="Wyszukaj uczestnika" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="list-group">
            {active.entries
              .filter((e) => `${e.lastName} ${e.firstName}`.toLowerCase().includes(filter.toLowerCase()))
              .map((e) => (
                <label key={e.userId} className="list-group-item list-group-item-action d-flex align-items-center gap-2">
                  <input className="form-check-input" type="checkbox" checked={e.present} disabled={pending} onChange={() => mark(e.userId, !e.present)} />
                  <span className="flex-grow-1">
                    {e.lastName} {e.firstName}
                    {e.clubShort && <span className="small text-body-secondary"> ({e.clubShort})</span>}
                  </span>
                  {e.present && e.markedAt && <span className="small text-body-secondary mono">{fmtTime(e.markedAt)}</span>}
                </label>
              ))}
          </div>
        </Modal>
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
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Zmiany zapisano.");
    onSaved();
  };

  return (
    <div className="mt-2 pt-2 border-top">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <span className="small text-body-secondary">Obecnych: <span className="fw-semibold">{presentCount}</span> / {rows.length}</span>
        <input className="form-control form-control-sm" placeholder="Szukaj…" aria-label="Szukaj" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 150 }} />
      </div>
      <div className="list-group overflow-y-auto" style={{ maxHeight: 240 }}>
        {rows.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).map((x) => (
          <label key={x.userId} className="list-group-item list-group-item-action d-flex align-items-center gap-2 py-1">
            <input className="form-check-input" type="checkbox" checked={x.present} onChange={() => setRows((arr) => arr.map((y) => y.userId === x.userId ? { ...y, present: !y.present } : y))} />
            <span className="flex-grow-1">{x.name}</span>
            {x.clubShort && <span className="small text-body-secondary">{x.clubShort}</span>}
          </label>
        ))}
      </div>
      <div className="form-check mt-2">
        <input className="form-check-input" type="checkbox" id={`apply-${check.id}`} checked={applyToCurrent} onChange={(e) => setApplyToCurrent(e.target.checked)} />
        <label className="form-check-label small" htmlFor={`apply-${check.id}`}>Nadpisz też bieżący stan obecności tą migawką</label>
      </div>
      <div className="d-flex gap-2 mt-2">
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? "Zapisuję…" : "Zapisz migawkę"}</button>
      </div>
    </div>
  );
}
