import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/labels";
import { MeetingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ParticipantUpcomingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const participations = await prisma.meetingParticipant.findMany({
    where: { userId: session.user.id, meeting: { status: MeetingStatus.PREPARED } },
    include: { meeting: true },
    orderBy: { meeting: { scheduledAt: "asc" } },
  });

  return (
    <div className="px-5 py-8 max-w-[900px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-6">
        <div className="eyebrow mb-2">Nadchodzące</div>
        <h1 style={{ fontSize: 28, lineHeight: 1.05 }}>Zaplanowane posiedzenia</h1>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--color-paper-2)" }}>
            <tr className="text-left">
              <th className="eyebrow px-4 py-3 font-normal">Nr</th>
              <th className="eyebrow px-4 py-3 font-normal">Nazwa</th>
              <th className="eyebrow px-4 py-3 font-normal">Termin</th>
            </tr>
          </thead>
          <tbody>
            {participations.map((p) => (
              <tr key={p.meeting.id} className="border-t border-[var(--color-rule-soft)] hover:bg-[var(--color-paper-2)]">
                <td className="px-4 py-3 mono text-xs">{p.meeting.number}</td>
                <td className="px-4 py-3"><Link href={`/session/upcoming/${p.meeting.id}`} className="hover:underline">{p.meeting.name}</Link></td>
                <td className="px-4 py-3 mono text-xs" style={{ color: "var(--color-ink-3)" }}>{formatDateTime(p.meeting.scheduledAt)}</td>
              </tr>
            ))}
            {participations.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--color-ink-3)" }}>Brak zaplanowanych posiedzeń.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
