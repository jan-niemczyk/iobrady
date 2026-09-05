import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getMeetingParticipant } from "@/lib/participantAccess";
import { formatDateTime, formatTime } from "@/lib/labels";
import { ArchiveMeetingDetailClient } from "@/components/participant/ArchiveMeetingDetailClient";

export const dynamic = "force-dynamic";

export default async function ArchiveMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { meetingId } = await params;

  const mp = await getMeetingParticipant(session.user.id, meetingId);
  if (!mp) notFound();

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      agenda: { orderBy: { order: "asc" }, where: { hiddenFromDisplay: false } },
      votes: { where: { status: "CLOSED" }, orderBy: { number: "asc" } },
      attachments: { where: { visibleToParticipants: true } },
    },
  });
  if (!meeting) notFound();

  const votesByItem = new Map<string, typeof meeting.votes>();
  const adHocVotes: typeof meeting.votes = [];
  for (const v of meeting.votes) {
    if (v.agendaItemId) { const arr = votesByItem.get(v.agendaItemId) ?? []; arr.push(v); votesByItem.set(v.agendaItemId, arr); }
    else adHocVotes.push(v);
  }
  const attByItem = new Map<string, typeof meeting.attachments>();
  const meetingAttachments: typeof meeting.attachments = [];
  for (const a of meeting.attachments) {
    if (a.agendaItemId) { const arr = attByItem.get(a.agendaItemId) ?? []; arr.push(a); attByItem.set(a.agendaItemId, arr); }
    else meetingAttachments.push(a);
  }

  const points = meeting.agenda.map((a) => ({
    id: a.id, number: a.number, title: a.title, isSubItem: a.isSubItem,
    presenter: a.presenter, committee: a.committee,
    times: a.startedAt ? `${formatTime(a.startedAt)}${a.completedAt ? ` - ${formatTime(a.completedAt)}` : ""}` : null,
    attachments: (attByItem.get(a.id) ?? []).map((att) => ({ id: att.id, fileName: att.fileName, sizeBytes: att.sizeBytes })),
    votes: (votesByItem.get(a.id) ?? []).map((v) => ({ id: v.id, number: v.number, title: v.title, type: v.type })),
  }));

  return (
    <div className="px-5 py-8 max-w-[900px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-6">
        <div className="eyebrow mb-2">Archiwum - {formatDateTime(meeting.scheduledAt)}</div>
        <h1 style={{ fontSize: 26, lineHeight: 1.1 }}>Posiedzenie nr {meeting.number} - {meeting.name}</h1>
      </header>

      <ArchiveMeetingDetailClient
        points={points}
        meetingAttachments={meetingAttachments.map((a) => ({ id: a.id, fileName: a.fileName, sizeBytes: a.sizeBytes }))}
        adHocVotes={adHocVotes.map((v) => ({ id: v.id, number: v.number, title: v.title, type: v.type }))}
      />
    </div>
  );
}
