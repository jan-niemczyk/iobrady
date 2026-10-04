import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildVoteReportData } from "@/lib/voteReportData";
import { formatDateTime, formatTime } from "@/lib/labels";
import { PublicVoteResult } from "@/components/public/PublicVoteResult";

export const dynamic = "force-dynamic";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PublicMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;

  const [meeting, settings] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        agenda: { orderBy: { order: "asc" }, where: { hiddenFromDisplay: false } },
        votes: { where: { status: "CLOSED" }, orderBy: { number: "asc" } },
        attachments: { where: { visibleToPublic: true } },
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);
  // Nie zdradzamy różnicy między "nie istnieje" a "nie opublikowane" - zawsze 404.
  if (!meeting || !meeting.publicEnabled) notFound();

  const votesByItem = new Map<string, typeof meeting.votes>();
  for (const v of meeting.votes) {
    if (!v.agendaItemId) continue;
    const arr = votesByItem.get(v.agendaItemId) ?? []; arr.push(v); votesByItem.set(v.agendaItemId, arr);
  }
  const attByItem = new Map<string, typeof meeting.attachments>();
  const meetingAttachments: typeof meeting.attachments = [];
  for (const a of meeting.attachments) {
    if (a.agendaItemId) { const arr = attByItem.get(a.agendaItemId) ?? []; arr.push(a); attByItem.set(a.agendaItemId, arr); }
    else meetingAttachments.push(a);
  }

  const points = await Promise.all(meeting.agenda.map(async (a) => ({
    id: a.id, number: a.number, title: a.title, isSubItem: a.isSubItem,
    presenter: a.presenter, committee: a.committee,
    times: a.startedAt ? `${formatTime(a.startedAt)}${a.completedAt ? ` - ${formatTime(a.completedAt)}` : ""}` : null,
    attachments: attByItem.get(a.id) ?? [],
    results: await Promise.all((votesByItem.get(a.id) ?? []).map((v) => buildVoteReportData(v.id))),
  })));

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-paper)" }}>
      <header className="text-center py-10 px-5" style={{ borderBottom: "1px solid var(--color-rule)" }}>
        {settings?.presentationLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.presentationLogoUrl} alt="" style={{ height: 64, margin: "0 auto 12px", objectFit: "contain" }} />
        )}
        <div className="eyebrow" style={{ fontSize: 13 }}>{settings?.organizationName ?? "Organizacja"}</div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginTop: 8 }}>
          Posiedzenie nr {meeting.number} - {meeting.name}
        </h1>
        <div className="text-sm mt-2" style={{ color: "var(--color-ink-3)" }}>{formatDateTime(meeting.scheduledAt)}</div>
      </header>

      <div className="px-5 py-8 max-w-[800px] mx-auto">
        {meetingAttachments.length > 0 && (
          <div className="card p-4 mb-6">
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
          {points.map((p) => (
            <li key={p.id} className="px-4 py-3" style={{ marginLeft: p.isSubItem ? 20 : 0 }}>
              <div className="flex items-start gap-3">
                <span className="mono text-xs mt-0.5 shrink-0" style={{ color: "var(--color-ink-3)", width: 32 }}>{p.number}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.title}</div>
                  {(p.presenter || p.committee) && (
                    <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>
                      {p.presenter && <>Referent: {p.presenter} </>}{p.committee && <>· Opinia: {p.committee}</>}
                    </div>
                  )}
                  {p.times && <div className="text-xs mono mt-0.5" style={{ color: "var(--color-ink-3)" }}>{p.times}</div>}
                  {p.attachments.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {p.attachments.map((a) => (
                        <a key={a.id} href={`/api/attachments/${a.id}/download`} className="text-xs hover:underline flex items-center gap-1" style={{ color: "var(--color-ink-2)" }}>
                          📎 {a.fileName} <span style={{ color: "var(--color-ink-3)" }}>({formatSize(a.sizeBytes)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                  {p.results.filter(Boolean).map((r, i) => r && <PublicVoteResult key={i} data={r} />)}
                </div>
              </div>
            </li>
          ))}
          {points.length === 0 && (
            <li className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-ink-3)" }}>Brak punktów porządku.</li>
          )}
        </ol>
      </div>
    </div>
  );
}
