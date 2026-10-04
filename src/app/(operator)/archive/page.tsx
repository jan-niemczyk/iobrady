import Link from "next/link";
import { prisma } from "@/lib/db";
import { MEETING_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { MeetingStatus } from "@prisma/client";
import { PageContainer, PageHeader } from "@/components/operator/ui";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const meetings = await prisma.meeting.findMany({
    where: { status: { in: [MeetingStatus.CLOSED, MeetingStatus.ARCHIVED, MeetingStatus.CANCELLED] } },
    include: { _count: { select: { participants: true, votes: true } } },
    orderBy: { closedAt: "desc" },
    take: 200,
  });

  return (
    <PageContainer size="lg">
      <PageHeader
        kicker="Archiwum"
        title="Zakończone posiedzenia"
        description="Posiedzenia zakończone, zarchiwizowane lub anulowane."
      />

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Nr</th>
                <th>Nazwa</th>
                <th>Zakończono</th>
                <th className="text-end">Głosowania</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <td className="num text-nowrap">{m.number}</td>
                  <td><Link href={`/meetings/${m.id}`}>{m.name}</Link></td>
                  <td className="num text-nowrap text-body-secondary">{formatDateTime(m.closedAt)}</td>
                  <td className="text-end num">{m._count.votes}</td>
                  <td><span className="badge text-bg-light border">{MEETING_STATUS_LABEL[m.status]}</span></td>
                </tr>
              ))}
              {meetings.length === 0 && (
                <tr><td colSpan={5} className="text-center text-body-secondary py-5">Archiwum jest puste.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
