"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CardHeader, PageContainer, PageHeader } from "../ui";
import { notifyFailure } from "@/lib/feedback";
import { INFO_KIND_LABEL, INFO_STATUS_LABEL } from "@/lib/infoLabels";
import { IconPin } from "@/components/ui/Icon";

type Row = {
  id: string; title: string; category: string; kind: string; status: string; pinned: boolean; important: boolean;
  publishedAt: string | null; expiresAt: string | null; version: number; updatedAt: string; author: string | null; attachments: number;
  audienceAll: boolean; audienceOrgUnitIds: string[]; audienceUserIds: string[];
};
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "-");
const TABS: [string, string][] = [["", "Wszystkie"], ["DRAFT", "Szkice"], ["PUBLISHED", "Opublikowane"], ["ARCHIVED", "Archiwum"]];

/** Lista komunikatów i dokumentów stałych (operator). */
export function InfoListOperatorClient() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    fetch(`/api/info${status ? `?status=${status}` : ""}`, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) { await notifyFailure(r); if (alive) setRows([]); return; }
      const d = await r.json();
      if (alive) setRows(d);
    });
    return () => { alive = false; };
  }, [status]);

  const audience = (r: Row) => [r.audienceAll ? "wszyscy radni" : "", r.audienceOrgUnitIds.length ? `grupy: ${r.audienceOrgUnitIds.length}` : "", r.audienceUserIds.length ? `osoby: ${r.audienceUserIds.length}` : ""].filter(Boolean).join(", ") || "brak odbiorców";

  return (
    <PageContainer size="lg">
      <PageHeader title="Informacje" />
      <div className="d-flex flex-wrap gap-2 mb-3">
        <Link className="btn btn-primary" href="/info/nowa">Nowa informacja</Link>
        <div className="btn-group" role="group" aria-label="Status">
          {TABS.map(([k, l]) => <button key={k} type="button" className={`btn btn-outline-secondary${status === k ? " active" : ""}`} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
      </div>
      <div className="card">
        <CardHeader title={<>Informacje <span className="text-body-secondary fw-normal">({rows?.length ?? "…"})</span></>} />
        {rows === null ? <div className="card-body text-body-secondary">Wczytywanie…</div> : rows.length === 0 ? <div className="card-body text-body-secondary">Brak informacji.</div> : (
          <ul className="list-group list-group-flush">
            {rows.map((r) => (
              <li key={r.id} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="min-w-0">
                  <Link href={`/info/${r.id}`} className="fw-medium">{r.pinned && <IconPin size={14} />} {r.title}</Link>
                  <span className={`badge ms-2 ${r.status === "PUBLISHED" ? "text-bg-success" : r.status === "DRAFT" ? "text-bg-secondary" : "text-bg-light border"}`}>{INFO_STATUS_LABEL[r.status]}</span>
                  {r.important && <span className="badge text-bg-danger ms-1">ważne</span>}
                  <div className="small text-body-secondary">
                    {INFO_KIND_LABEL[r.kind]} - {r.category} - {audience(r)} - wersja {r.version}
                    {r.publishedAt ? ` - opublikowano ${dt(r.publishedAt)}` : ` - zmieniono ${dt(r.updatedAt)}`}
                    {r.attachments ? ` - załączniki: ${r.attachments}` : ""}{r.author ? ` - ${r.author}` : ""}
                  </div>
                </div>
                <Link className="btn btn-sm btn-outline-primary" href={`/info/${r.id}`}>Otwórz</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
