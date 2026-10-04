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
    <div className="pt-page">
      <header className="pt-page-header">
        <div className="pt-kicker">Nadchodzące</div>
        <h1 className="pt-h1">Zaplanowane posiedzenia</h1>
      </header>

      <section className="pt-panel">
        {participations.length === 0 ? (
          <div className="pt-empty">Brak zaplanowanych posiedzeń.</div>
        ) : (
          <ul className="pt-list">
            {participations.map((p) => (
              <li key={p.meeting.id} style={{ padding: 0 }}>
                <Link href={`/session/upcoming/${p.meeting.id}`} className="pt-row-link">
                  <span className="pt-grow">
                    <span className="pt-row-title">{p.meeting.name}</span>
                    <span className="pt-label">Nr {p.meeting.number} - {formatDateTime(p.meeting.scheduledAt)}</span>
                  </span>
                  <span className="pt-muted" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
