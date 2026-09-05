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
    <div className="px-5 py-8 max-w-[900px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-6">
        <div className="eyebrow mb-2">Nadchodzące - {formatDateTime(meeting.scheduledAt)}</div>
        <h1 style={{ fontSize: 26, lineHeight: 1.1 }}>Posiedzenie nr {meeting.number} - {meeting.name}</h1>
      </header>

      {meetingAttachments.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="eyebrow mb-2">Materiały posiedzenia</div>
          <div className="space-y-1">
            {meetingAttachments.map((a) => (
              <a key={a.id} href={`/api/attachments/${a.id}/download`} className="text-xs hover:underline flex items-center gap-1" style={{ color: "var(--color-ink-2)" }}>
                📎 {a.fileName} <span style={{ color: "var(--color-ink-3)" }}>({formatSize(a.sizeBytes)})</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <ol className="divide-y divide-[var(--color-rule-soft)] card overflow-hidden">
        {meeting.agenda.map((a) => (
          <li key={a.id} className="px-4 py-3" style={{ marginLeft: a.isSubItem ? 20 : 0 }}>
            <div className="flex items-start gap-3">
              <span className="mono text-xs mt-0.5 shrink-0" style={{ color: "var(--color-ink-3)", width: 32 }}>{a.number}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.title}</div>
                {(a.presenter || a.committee) && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>
                    {a.presenter && <>Referent: {a.presenter} </>}{a.committee && <>· Opinia: {a.committee}</>}
                  </div>
                )}
                {(attByItem.get(a.id) ?? []).length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {(attByItem.get(a.id) ?? []).map((att) => (
                      <a key={att.id} href={`/api/attachments/${att.id}/download`} className="text-xs hover:underline flex items-center gap-1" style={{ color: "var(--color-ink-2)" }}>
                        📎 {att.fileName} <span style={{ color: "var(--color-ink-3)" }}>({formatSize(att.sizeBytes)})</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
        {meeting.agenda.length === 0 && (
          <li className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-ink-3)" }}>Porządek obrad nie został jeszcze ustalony.</li>
        )}
      </ol>
    </div>
  );
}
