import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicMeeting, type PublicMeeting, type PublicVoteSummary } from "@/lib/publicMeeting";
import { MEETING_STATUS_LABEL } from "@/lib/labels";
import { fmtDate, fmtSize, fmtTime, resultShort } from "@/components/public/publicFormat";
import { VotesTable } from "@/components/public/VotesTable";
import { PublicAutoRefresh } from "@/components/public/PublicAutoRefresh";
import type { MeetingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ meetingId: string }> }): Promise<Metadata> {
  const { meetingId } = await params;
  const m = await loadPublicMeeting(meetingId);
  return { title: m ? `${m.name} - posiedzenie nr ${m.number}` : "Posiedzenie" };
}

export default async function PublicMeetingPage({ params, searchParams }: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ widok?: string }>;
}) {
  const { meetingId } = await params;
  const { widok } = await searchParams;
  // Nie zdradzamy różnicy między „nie istnieje” a „nie udostępnione” - zawsze 404.
  const meeting = await loadPublicMeeting(meetingId);
  if (!meeting) notFound();
  const view: "agenda" | "votes" = widok === "glosowania" ? "votes" : "agenda";

  const itemNumber: Record<string, string> = {};
  for (const a of meeting.agenda) itemNumber[a.id] = a.unnumbered || !a.number ? "bez nr" : a.number;

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
                  <h2 className="h5 mb-3">Wszystkie głosowania</h2>
                  <VotesTable meetingId={meeting.id} votes={meeting.votes} itemNumber={itemNumber} />
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

function Attachments({ items }: { items: { id: string; fileName: string; sizeBytes: number }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-unstyled small mb-0 mt-1">
      {items.map((a) => (
        <li key={a.id} className="d-flex align-items-baseline gap-1">
          <span aria-hidden className="text-body-secondary">📄</span>
          <a href={`/api/attachments/${a.id}/download`} style={{ overflowWrap: "anywhere" }}>{a.fileName}</a>
          <span className="text-body-secondary text-nowrap">({fmtSize(a.sizeBytes)})</span>
        </li>
      ))}
    </ul>
  );
}

function VoteLine({ v, meetingId, itemTitle }: { v: PublicVoteSummary; meetingId: string; itemTitle?: string }) {
  // Temat głosowania różny od tytułu punktu - pokazujemy go; identyczny - nie powtarzamy.
  const showTitle = !itemTitle || v.title.trim() !== itemTitle.trim();
  return (
    <div className="pub-vote" id={`g-${v.id}`}>
      <div className="small text-body-secondary">
        Głosowanie nr {v.number ?? "-"}{v.time ? `, godz. ${fmtTime(v.time)}` : ""}{v.secret ? ", tajne" : ""}
      </div>
      {showTitle && <div style={{ overflowWrap: "anywhere" }}>{v.title}</div>}
      <div className="d-flex flex-wrap align-items-center gap-2 small">
        <span>{resultShort(v)}</span>
        {v.decision && <span className={`badge ${v.decision.positive ? "text-bg-success" : "text-bg-danger"}`}>{v.decision.label}</span>}
        {v.status === "OPEN" && <span className="badge text-bg-warning">Trwa</span>}
        <Link href={`/public/${meetingId}/glosowanie/${v.id}`}>Szczegóły<span className="visually-hidden"> głosowania nr {v.number}</span></Link>
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
                    <h3 className="h6 mb-0 fw-semibold" style={{ overflowWrap: "anywhere" }}>{a.title}</h3>
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
                        {votes.map((v) => <VoteLine key={v.id} v={v} meetingId={meeting.id} itemTitle={a.title} />)}
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
          {loose.map((v) => <VoteLine key={v.id} v={v} meetingId={meeting.id} />)}
        </section>
      )}
    </>
  );
}
