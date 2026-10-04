"use client";

import { useEffect, useState } from "react";
import { ask, readUserError } from "@/lib/feedback";

interface AttachmentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  agendaItemId: string | null;
  visibleToParticipants: boolean;
  visibleToPublic: boolean;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Zarządzanie materiałami - całego posiedzenia (agendaItemId=null) albo jednego punktu. */
export function AttachmentsManager({ meetingId, agendaItemId }: { meetingId: string; agendaItemId?: string | null }) {
  const [all, setAll] = useState<AttachmentRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    const r = await fetch(`/api/meetings/${meetingId}/attachments`, { cache: "no-store" });
    if (r.ok) setAll(await r.json());
  }
  useEffect(() => { refetch(); }, [meetingId]);

  const items = (all ?? []).filter((a) => (agendaItemId ? a.agendaItemId === agendaItemId : a.agendaItemId === null));

  async function upload(file: File) {
    setUploading(true); setError(null);
    const form = new FormData();
    form.append("file", file);
    if (agendaItemId) form.append("agendaItemId", agendaItemId);
    const r = await fetch(`/api/meetings/${meetingId}/attachments`, { method: "POST", body: form });
    setUploading(false);
    if (!r.ok) { setError(await readUserError(r)); return; }
    await refetch();
  }

  async function toggle(id: string, field: "visibleToParticipants" | "visibleToPublic", value: boolean) {
    await fetch(`/api/attachments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    await refetch();
  }

  async function remove(id: string) {
    if (!(await ask({ title: "Usunąć materiał?", message: "Plik zostanie usunięty z materiałów posiedzenia.", confirmLabel: "Usuń", danger: true }))) return;
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    await refetch();
  }

  return (
    <div className="d-flex flex-column gap-2 align-items-start">
      {items.length > 0 && (
        <ul className="list-group w-100">
          {items.map((a) => (
            <li key={a.id} className="list-group-item d-flex align-items-center gap-2 flex-wrap py-2">
              <a href={`/api/attachments/${a.id}/download`} className="fw-medium text-truncate" style={{ flex: "1 1 8rem", minWidth: 0 }} title={a.fileName}>{a.fileName}</a>
              <span className="small text-body-secondary">{formatSize(a.sizeBytes)}</span>
              <div className="form-check mb-0 small">
                <input className="form-check-input" type="checkbox" id={`att-p-${a.id}`} checked={a.visibleToParticipants} onChange={(e) => toggle(a.id, "visibleToParticipants", e.target.checked)} />
                <label className="form-check-label" htmlFor={`att-p-${a.id}`}>radni</label>
              </div>
              <div className="form-check mb-0 small">
                <input className="form-check-input" type="checkbox" id={`att-pub-${a.id}`} checked={a.visibleToPublic} onChange={(e) => toggle(a.id, "visibleToPublic", e.target.checked)} />
                <label className="form-check-label" htmlFor={`att-pub-${a.id}`}>publiczne</label>
              </div>
              <button className="btn btn-sm btn-outline-danger" onClick={() => remove(a.id)}>Usuń</button>
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 && all !== null && (
        <div className="small text-body-secondary">Brak materiałów.</div>
      )}
      <label className={`btn btn-sm${uploading ? " disabled" : ""}`}>
        {uploading ? "Wgrywanie…" : "+ Dodaj materiał"}
        <input
          type="file" accept=".pdf,.docx,.xlsx,image/png,image/jpeg,image/webp" className="d-none"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
      </label>
      {error && <div className="small text-danger">{error}</div>}
    </div>
  );
}
