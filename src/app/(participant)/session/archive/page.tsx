import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { MEETING_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { MeetingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ParticipantArchivePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const participations = await prisma.meetingParticipant.findMany({
    where: {
      userId: session.user.id,
      meeting: { status: { in: [MeetingStatus.CLOSED, MeetingStatus.ARCHIVED, MeetingStatus.CANCELLED] } },
    },
    include: { meeting: true },
    orderBy: { meeting: { closedAt: "desc" } },
    take: 200,
  });

  return (
    <div className="px-5 py-8 max-w-[900px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-6">
        <div className="eyebrow mb-2">Archiwum</div>
        <h1 style={{ fontSize: 28, lineHeight: 1.05 }}>Zakończone posiedzenia</h1>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--color-paper-2)" }}>
            <tr className="text-left">
              <th className="eyebrow px-4 py-3 font-normal">Nr</th>
              <th className="eyebrow px-4 py-3 font-normal">Nazwa</th>
              <th className="eyebrow px-4 py-3 font-normal">Zakończono</th>
              <th className="eyebrow px-4 py-3 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {participations.map((p) => (
              <tr key={p.meeting.id} className="border-t border-[var(--color-rule-soft)] hover:bg-[var(--color-paper-2)]">
                <td className="px-4 py-3 mono text-xs">{p.meeting.number}</td>
                <td className="px-4 py-3"><Link href={`/session/archive/${p.meeting.id}`} className="hover:underline">{p.meeting.name}</Link></td>
                <td className="px-4 py-3 mono text-xs" style={{ color: "var(--color-ink-3)" }}>{formatDateTime(p.meeting.closedAt)}</td>
                <td className="px-4 py-3"><span className="pill pill-neutral">{MEETING_STATUS_LABEL[p.meeting.status]}</span></td>
              </tr>
            ))}
            {participations.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--color-ink-3)" }}>Brak zakończonych posiedzeń.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
