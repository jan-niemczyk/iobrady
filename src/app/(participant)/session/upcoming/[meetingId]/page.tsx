import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMeetingParticipant } from "@/lib/participantAccess";
import { formatDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function UpcomingMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { meetingId } = await params;

  const mp = await getMeetingParticipant(session.user.id, meetingId);
  if (!mp) notFound();

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      agenda: { orderBy: { order: "asc" }, where: { hiddenFromDisplay: false } },
      attachments: { where: { visibleToParticipants: true } },
    },
  });
  if (!meeting) notFound();

  const attByItem = new Map<string, typeof meeting.attachments>();
  const meetingAttachments: typeof meeting.attachments = [];
  for (const a of meeting.attachments) {
    if (a.agendaItemId) { const arr = attByItem.get(a.agendaItemId) ?? []; arr.push(a); attByItem.set(a.agendaItemId, arr); }
    else meetingAttachments.push(a);
  }

  return (
    <div className="pt-page">
      <header className="pt-page-header">
        <div className="pt-kicker">Nadchodzące - {formatDateTime(meeting.scheduledAt)}</div>
        <h1 className="pt-h1">Posiedzenie nr {meeting.number} - {meeting.name}</h1>
      </header>

      {meetingAttachments.length > 0 && (
        <section className="pt-panel">
          <div className="pt-panel-head"><h2 className="pt-panel-title">Materiały posiedzenia</h2></div>
          <div className="pt-panel-body flex flex-col gap-2">
            {meetingAttachments.map((a) => (
              <a key={a.id} href={`/api/attachments/${a.id}/download`} className="pt-attachment">
                📎 {a.fileName} <span className="pt-muted">({formatSize(a.sizeBytes)})</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="pt-panel">
        <div className="pt-panel-head"><h2 className="pt-panel-title">Porządek obrad</h2></div>
        {meeting.agenda.length === 0 ? (
          <div className="pt-empty">Porządek obrad nie został jeszcze ustalony.</div>
        ) : (
          <ol className="pt-list">
            {meeting.agenda.map((a) => (
              <li key={a.id} style={{ alignItems: "flex-start", paddingLeft: a.isSubItem ? 36 : undefined }}>
                <span className="pt-num" style={{ minWidth: 28, paddingTop: 1 }}>{a.number}</span>
                <div className="pt-grow">
                  <div style={{ fontWeight: 500 }}>{a.title}</div>
                  {(a.presenter || a.committee) && (
                    <div className="pt-label" style={{ marginTop: 2 }}>
                      {[a.presenter ? `Referent: ${a.presenter}` : null, a.committee ? `Opinia: ${a.committee}` : null].filter(Boolean).join(" - ")}
                    </div>
                  )}
                  {(attByItem.get(a.id) ?? []).length > 0 && (
                    <div className="flex flex-col gap-1" style={{ marginTop: 6 }}>
                      {(attByItem.get(a.id) ?? []).map((att) => (
                        <a key={att.id} href={`/api/attachments/${att.id}/download`} className="pt-attachment">
                          📎 {att.fileName} <span className="pt-muted">({formatSize(att.sizeBytes)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
