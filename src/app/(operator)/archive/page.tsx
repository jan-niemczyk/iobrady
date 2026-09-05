import Link from "next/link";
import { prisma } from "@/lib/db";
import { MEETING_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { MeetingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const meetings = await prisma.meeting.findMany({
    where: { status: { in: [MeetingStatus.CLOSED, MeetingStatus.ARCHIVED, MeetingStatus.CANCELLED] } },
    include: { _count: { select: { participants: true, votes: true } } },
    orderBy: { closedAt: "desc" },
    take: 200,
  });

  return (
    <div className="container py-4" style={{ maxWidth: 1200 }}>
      <header className="border-bottom pb-3 mb-4">
        <div className="text-uppercase text-body-secondary small mb-1" style={{ letterSpacing: "0.06em" }}>Archiwum</div>
        <h1 className="mb-2" style={{ fontSize: 30 }}>Zakończone posiedzenia</h1>
        <p className="text-body-secondary small mb-0">
          Lista posiedzeń zakończonych, zarchiwizowanych lub anulowanych. Pobieranie raportów PDF/CSV/XLSX - w iteracji 5.
        </p>
      </header>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="small text-uppercase text-body-secondary fw-normal">Nr</th>
                <th className="small text-uppercase text-body-secondary fw-normal">Nazwa</th>
                <th className="small text-uppercase text-body-secondary fw-normal">Zakończono</th>
                <th className="small text-uppercase text-body-secondary fw-normal text-end">Głos.</th>
                <th className="small text-uppercase text-body-secondary fw-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <td className="font-monospace small">{m.number}</td>
                  <td><Link href={`/meetings/${m.id}`}>{m.name}</Link></td>
                  <td className="font-monospace small text-body-secondary">{formatDateTime(m.closedAt)}</td>
                  <td className="text-end font-monospace">{m._count.votes}</td>
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
    </div>
  );
}
