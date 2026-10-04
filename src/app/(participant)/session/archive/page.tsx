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
    <div className="pt-page">
      <header className="pt-page-header">
        <div className="pt-kicker">Archiwum</div>
        <h1 className="pt-h1">Zakończone posiedzenia</h1>
      </header>

      <section className="pt-panel">
        {participations.length === 0 ? (
          <div className="pt-empty">Brak zakończonych posiedzeń.</div>
        ) : (
          <ul className="pt-list">
            {participations.map((p) => (
              <li key={p.meeting.id} style={{ padding: 0 }}>
                <Link href={`/session/archive/${p.meeting.id}`} className="pt-row-link">
                  <span className="pt-grow">
                    <span className="pt-row-title">{p.meeting.name}</span>
                    <span className="pt-label">Nr {p.meeting.number} - zakończono {formatDateTime(p.meeting.closedAt)}</span>
                  </span>
                  <span className="pt-badge">{MEETING_STATUS_LABEL[p.meeting.status]}</span>
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
