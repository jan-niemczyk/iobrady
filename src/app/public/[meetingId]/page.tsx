import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicMeeting, type PublicMeeting, type PublicVoteSummary } from "@/lib/publicMeeting";
import { MEETING_STATUS_LABEL } from "@/lib/labels";
import { fmtDate, fmtSize, fmtTime, resultShort, voteWhen } from "@/components/public/publicFormat";
import { VotesTable } from "@/components/public/VotesTable";
import { PublicAutoRefresh } from "@/components/public/PublicAutoRefresh";
import { PublicPdfButton } from "@/components/public/PublicPdfButton";
import type { MeetingStatus } from "@prisma/client";
import { IconDocument } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ meetingId: string }> }): Promise<Metadata> {
  const { meetingId } = await params;
  const m = await loadPublicMeeting(meetingId);
  return { title: m ? `${m.name} - posiedzenie nr ${m.number}` : "Posiedzenie" };
}

export default async function PublicMeetingPage({ params, searchParams }: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ widok?: string; q?: string }>;
}) {
  const { meetingId } = await params;
  const { widok, q } = await searchParams;
  // Nie zdradzamy różnicy między „nie istnieje” a „nie udostępnione” - zawsze 404.
  const meeting = await loadPublicMeeting(meetingId);
  if (!meeting) notFound();
  const view: "agenda" | "votes" = widok === "glosowania" ? "votes" : "agenda";

  return (
    <>
      <PublicAutoRefresh active={meeting.active} />
      <MeetingHeader meeting={meeting} />

      <main className="container-lg py-4" style={{ maxWidth: 1080 }}>
        <nav aria-label="Widok posiedzenia" className="mb-3">
          <ul className="nav nav-pills gap-1">
            <li className="nav-item">
              <Link className={`nav-link${view === "agenda" ? " active" : ""}`} aria-current={view === "agenda" ? "page" : undefined} href={`/public/${meeting.id}`} scroll={false}>
                Porządek obrad
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link${view === "votes" ? " active" : ""}`} aria-current={view === "votes" ? "page" : undefined} href={`/public/${meeting.id}?widok=glosowania`} scroll={false}>
                Wszystkie głosowania <span className="badge text-bg-light border ms-1">{meeting.votes.length}</span>
              </Link>
            </li>
          </ul>
        </nav>

        <section className="card">
          <div className="card-body">
            {view === "agenda"
              ? <AgendaView meeting={meeting} />
              : (
                <>
                  <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                    <h2 className="h5 mb-0">Wszystkie głosowania</h2>
                    {meeting.votes.some((v) => v.status === "CLOSED") && (
                      <PublicPdfButton meetingId={meeting.id} fileName={`glosowania-posiedzenie-${meeting.number ?? meeting.id}`.replace(/[^\p{L}\p{N}_-]+/gu, "-")} label="Pobierz wyniki wszystkich głosowań (PDF)" />
                    )}
                  </div>
                  <VotesTable meetingId={meeting.id} votes={meeting.votes} initialQuery={typeof q === "string" ? q.slice(0, 200) : ""} />
                </>
              )}
          </div>
        </section>
      </main>
    </>
  );
}

function MeetingHeader({ meeting }: { meeting: PublicMeeting }) {
  const title = meeting.name;
  return (
    <header className="pub-header">
      <div className="container-lg py-3" style={{ maxWidth: 1080 }}>
        <div className="d-flex align-items-center gap-3">
          {meeting.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meeting.logoUrl} alt="" className="pub-logo" />
          )}
          <div className="min-w-0">
            {meeting.organization && <div className="small text-uppercase fw-semibold text-body-secondary" style={{ letterSpacing: ".06em" }}>{meeting.organization}</div>}
            <h1 className="h4 mb-1" style={{ overflowWrap: "anywhere" }}>{title}</h1>
            <div className="small text-body-secondary d-flex flex-wrap column-gap-3 row-gap-1">
              {meeting.number && <span>Posiedzenie nr {meeting.number}</span>}
              <span>{fmtDate(meeting.scheduledAt)}, godz. {fmtTime(meeting.scheduledAt)}</span>
              {meeting.location && <span>{meeting.location}</span>}
              <span>
                <span className={`badge ${meeting.active ? "text-bg-success" : "text-bg-light border"}`}>
                  {MEETING_STATUS_LABEL[meeting.status as MeetingStatus] ?? meeting.status}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function fileFormat(name: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  return m ? m[1].toUpperCase() : "";
}

function Attachments({ items }: { items: { id: string; fileName: string; sizeBytes: number }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-unstyled small mb-0 mt-1" aria-label="Materiały">
      {items.map((a) => (
        <li key={a.id} className="d-flex align-items-baseline gap-1">
          <span aria-hidden className="text-body-secondary"><IconDocument size={15} /></span>
          <a href={`/api/attachments/${a.id}/download`} className="pub-tap" style={{ overflowWrap: "anywhere" }} download>{a.fileName}</a>
          <span className="text-body-secondary text-nowrap">({[fileFormat(a.fileName), fmtSize(a.sizeBytes)].filter(Boolean).join(", ")}, pobranie)</span>
        </li>
      ))}
    </ul>
  );
}

function VoteLine({ v, meetingId }: { v: PublicVoteSummary; meetingId: string }) {
  return (
    <div className="pub-vote" id={`g-${v.id}`}>
      <div className="small text-body-secondary">
        Głosowanie nr {v.number ?? "-"}{v.time ? ` - ${voteWhen(v.time)}` : ""}{v.secret ? ", tajne" : ""}
      </div>
      <div style={{ overflowWrap: "anywhere" }}>{v.title}</div>
      <div className="d-flex flex-wrap align-items-center gap-2 small">
        <span>{resultShort(v)}</span>
        {v.decision && <span className={`badge ${v.decision.positive ? "text-bg-success" : "text-bg-danger"}`}>{v.decision.label}</span>}
        {v.status === "OPEN" && <span className="badge text-bg-warning">Trwa</span>}
        <Link href={`/public/${meetingId}/glosowanie/${v.id}`} className="btn btn-sm btn-outline-primary">Szczegóły<span className="visually-hidden"> głosowania nr {v.number}</span></Link>
      </div>
    </div>
  );
}

function AgendaView({ meeting }: { meeting: PublicMeeting }) {
  const byItem = new Map<string, PublicVoteSummary[]>();
  const loose: PublicVoteSummary[] = [];
  const itemIds = new Set(meeting.agenda.map((a) => a.id));
  for (const v of meeting.votes) {
    if (v.agendaItemId && itemIds.has(v.agendaItemId)) byItem.set(v.agendaItemId, [...(byItem.get(v.agendaItemId) ?? []), v]);
    else loose.push(v);
  }

  return (
    <>
      {meeting.meetingAttachments.length > 0 && (
        <section className="mb-4" aria-labelledby="pub-materials">
          <h2 id="pub-materials" className="h6 text-uppercase text-body-secondary mb-1" style={{ letterSpacing: ".05em" }}>Materiały posiedzenia</h2>
          <Attachments items={meeting.meetingAttachments} />
        </section>
      )}

      <h2 className="h5 mb-2">Porządek obrad</h2>
      {meeting.agenda.length === 0 ? (
        <p className="text-body-secondary mb-0">Porządek obrad nie został jeszcze opublikowany.</p>
      ) : (
        <ol className="list-unstyled mb-0">
          {meeting.agenda.map((a) => {
            const votes = byItem.get(a.id) ?? [];
            return (
              <li key={a.id} className={`pub-item py-3${a.isSubItem ? " pub-sub" : ""}`}>
                <div className="d-flex gap-2">
                  <span className="pub-item-num fw-semibold text-body-secondary">{a.unnumbered || !a.number ? "" : `${a.number}.`}</span>
                  <div className="min-w-0 flex-grow-1">
                    <h3 className="h6 mb-0 fw-semibold" style={{ overflowWrap: "anywhere" }}>
                      {a.title}
                      {a.status === "COMPLETED" && <span className="badge text-bg-light border fw-normal ms-2">zakończony</span>}
                      {a.status === "CURRENT" && <span className="badge text-bg-success fw-normal ms-2">rozpatrywany</span>}
                    </h3>
                    {(a.presenter || a.committee) && (
                      <div className="small text-body-secondary">
                        {a.presenter && <span>Referuje: {a.presenter}</span>}
                        {a.presenter && a.committee && <span> - </span>}
                        {a.committee && <span>Opinia: {a.committee}</span>}
                      </div>
                    )}
                    <Attachments items={a.attachments} />
                    {votes.length > 0 && (
                      <div className="mt-2">
                        {votes.map((v) => <VoteLine key={v.id} v={v} meetingId={meeting.id} />)}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {loose.length > 0 && (
        <section className="mt-4" aria-labelledby="pub-loose">
          <h2 id="pub-loose" className="h5 mb-1">Głosowania bez przypisania do punktu</h2>
          <p className="small text-body-secondary mb-2">Np. wnioski formalne zgłoszone w trakcie obrad.</p>
          {loose.map((v) => (
            <div key={v.id}>
              {v.contextLabel && <div className="small fw-semibold" style={{ overflowWrap: "anywhere" }}>{v.contextLabel}</div>}
              <VoteLine v={v} meetingId={meeting.id} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
