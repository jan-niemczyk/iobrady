import { Fragment } from "react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/operator/ui";
import { prisma } from "@/lib/db";
import { MEETING_STATUS_LABEL, formatDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function MeetingsListPage() {
  const meetings = await prisma.meeting.findMany({
    include: { _count: { select: { participants: true, votes: true } } },
    orderBy: { scheduledAt: "desc" },
    take: 100,
  });

  return (
    <PageContainer size="lg">
      <PageHeader
        title="Posiedzenia"
        description="Wszystkie posiedzenia, od najnowszych."
        actions={<Link href="/meetings/new" className="btn btn-primary">+ Nowe posiedzenie</Link>}
      />

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ width: 120 }}>Nr</th>
                <th>Nazwa</th>
                <th style={{ width: 170 }}>Termin</th>
                <th className="text-end" style={{ width: 110 }}>Uczestnicy</th>
                <th className="text-end" style={{ width: 110 }}>Głosowania</th>
                <th style={{ width: 130 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m, i) => {
                const year = m.scheduledAt.getFullYear();
                const prevYear = i > 0 ? meetings[i - 1].scheduledAt.getFullYear() : null;
                const showYear = year !== prevYear;
                return (
                  <Fragment key={m.id}>
                    {showYear && (
                      <tr className="table-light">
                        <td colSpan={6} className="small fw-semibold text-body-secondary py-1">{year}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="num text-body-secondary text-nowrap">{m.number}</td>
                      <td style={{ minWidth: 220 }}><Link href={`/meetings/${m.id}`} className="fw-medium">{m.name}</Link></td>
                      <td className="num text-body-secondary text-nowrap">{formatDateTime(m.scheduledAt)}</td>
                      <td className="text-end num">{m._count.participants}</td>
                      <td className="text-end num">{m._count.votes}</td>
                      <td><span className="badge text-bg-light border">{MEETING_STATUS_LABEL[m.status]}</span></td>
                    </tr>
                  </Fragment>
                );
              })}
              {meetings.length === 0 && (
                <tr><td className="text-center text-body-secondary py-4" colSpan={6}>Brak posiedzeń.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
