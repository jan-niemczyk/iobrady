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
    <div className="px-6 py-8 max-w-[1400px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-8">
        <div className="eyebrow mb-2">Archiwum</div>
        <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>Zakończone posiedzenia</h1>
        <p className="text-sm mt-3" style={{ color: "var(--color-ink-2)" }}>
          Lista posiedzeń zakończonych, zarchiwizowanych lub anulowanych. Pobieranie raportów PDF/CSV/XLSX - w iteracji 5.
        </p>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--color-paper-2)" }}>
            <tr className="text-left">
              <th className="eyebrow px-4 py-3 font-normal">Nr</th>
              <th className="eyebrow px-4 py-3 font-normal">Nazwa</th>
              <th className="eyebrow px-4 py-3 font-normal">Zakończono</th>
              <th className="eyebrow px-4 py-3 font-normal text-right">Głos.</th>
              <th className="eyebrow px-4 py-3 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-rule-soft)] hover:bg-[var(--color-paper-2)]">
                <td className="px-4 py-3 mono text-xs">{m.number}</td>
                <td className="px-4 py-3"><Link href={`/meetings/${m.id}`} className="hover:underline">{m.name}</Link></td>
                <td className="px-4 py-3 mono text-xs" style={{ color: "var(--color-ink-3)" }}>{formatDateTime(m.closedAt)}</td>
                <td className="px-4 py-3 text-right num">{m._count.votes}</td>
                <td className="px-4 py-3"><span className="pill pill-neutral">{MEETING_STATUS_LABEL[m.status]}</span></td>
              </tr>
            ))}
            {meetings.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--color-ink-3)" }}>Archiwum jest puste.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
