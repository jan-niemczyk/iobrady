"use client";

import { useEffect, useState } from "react";

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
    if (!r.ok) { setError(await r.text()); return; }
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
    if (!window.confirm("Usunąć materiał?")) return;
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    await refetch();
  }

  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-2 flex-wrap text-xs px-2 py-1.5" style={{ border: "1px solid var(--color-rule-soft)", borderRadius: 4 }}>
          <a href={`/api/attachments/${a.id}/download`} className="font-medium hover:underline" style={{ flex: "1 1 auto", minWidth: 120 }}>{a.fileName}</a>
          <span style={{ color: "var(--color-ink-3)" }}>{formatSize(a.sizeBytes)}</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={a.visibleToParticipants} onChange={(e) => toggle(a.id, "visibleToParticipants", e.target.checked)} />
            radni
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={a.visibleToPublic} onChange={(e) => toggle(a.id, "visibleToPublic", e.target.checked)} />
            publiczne
          </label>
          <button className="btn btn-sm" style={{ color: "var(--color-no)" }} onClick={() => remove(a.id)}>Usuń</button>
        </div>
      ))}
      {items.length === 0 && all !== null && (
        <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>Brak materiałów.</div>
      )}
      <label className="btn btn-sm" style={{ cursor: uploading ? "default" : "pointer", display: "inline-flex" }}>
        {uploading ? "Wgrywanie…" : "+ Dodaj materiał"}
        <input
          type="file" accept=".pdf,.docx,.xlsx,image/png,image/jpeg,image/webp" style={{ display: "none" }}
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
      </label>
      {error && <div className="text-xs" style={{ color: "var(--color-no)" }}>{error}</div>}
    </div>
  );
}
