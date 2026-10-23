"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CardHeader, PageContainer, PageHeader } from "../ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { IconArrowLeft, IconTrash } from "@/components/ui/Icon";

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "-");

export function NoticesListClient({ meeting, notices, templates }: {
  meeting: { id: string; number: string; name: string };
  notices: { id: string; name: string; templateName: string | null; templateVersion: number | null; updatedAt: string; lastGeneratedAt: string | null; agendaEdited: boolean }[];
  templates: { id: string; name: string; scope: string; suggested: boolean }[];
}) {
  const router = useRouter();
  const def = templates.find((t) => t.suggested)?.id ?? "";
  const [tpl, setTpl] = useState(def);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const r = await fetch(`/api/meetings/${meeting.id}/notices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: tpl || null }) });
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    const d = await r.json();
    router.push(`/meetings/${meeting.id}/notices/${d.id}`);
  }

  return (
    <PageContainer size="lg">
      <PageHeader
        kicker={<Link href={`/meetings/${meeting.id}`} className="d-inline-flex align-items-center gap-1"><IconArrowLeft size={14} /> Posiedzenie nr {meeting.number}</Link>}
        title="Zawiadomienia"
        description={meeting.name}
      />
      <div className="card mb-3">
        <CardHeader title="Utwórz zawiadomienie" />
        <div className="card-body d-flex flex-wrap align-items-end gap-2">
          <div>
            <label className="form-label" htmlFor="nt-tpl">Szablon tekstu</label>
            <select id="nt-tpl" className="form-select" value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="">Bez szablonu (pusty dokument)</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.scope}){t.suggested ? " - domyślny" : ""}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={create}>Utwórz zawiadomienie</button>
          <Link className="btn btn-outline-secondary" href="/notice-templates">Szablony dokumentów</Link>
        </div>
      </div>
      <div className="card">
        <CardHeader title={<>Zawiadomienia posiedzenia <span className="text-body-secondary fw-normal">({notices.length})</span></>} />
        {notices.length === 0 ? <div className="card-body text-body-secondary">Brak zawiadomień.</div> : (
          <ul className="list-group list-group-flush">
            {notices.map((n) => (
              <li key={n.id} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <Link href={`/meetings/${meeting.id}/notices/${n.id}`} className="fw-medium">{n.name}</Link>
                  <div className="small text-body-secondary">
                    {n.templateName ? `Szablon: ${n.templateName} (wersja ${n.templateVersion})` : "Bez szablonu"} - zmieniono {dt(n.updatedAt)} - ostatnio wygenerowano {dt(n.lastGeneratedAt)}{n.agendaEdited ? " - porządek zmieniony względem posiedzenia" : ""}
                  </div>
                </div>
                <button className="btn btn-sm agenda-del" aria-label={`Usuń zawiadomienie ${n.name}`} onClick={async () => {
                  if (!(await ask({ title: "Usunąć zawiadomienie?", message: "Wersja robocza zostanie usunięta. Wygenerowane wcześniej pliki pozostają u odbiorców.", confirmLabel: "Usuń", danger: true }))) return;
                  const r = await fetch(`/api/notices/${n.id}`, { method: "DELETE" });
                  if (!r.ok) { await notifyFailure(r); return; }
                  notify.success("Usunięto."); router.refresh();
                }}><IconTrash /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
