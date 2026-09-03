import { Fragment } from "react";
import Link from "next/link";
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
    <div className="px-6 py-8 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between border-b border-[var(--color-rule)] pb-6 mb-8">
        <div>
          <div className="eyebrow mb-2">Posiedzenia</div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>Wszystkie posiedzenia</h1>
        </div>
        <Link href="/meetings/new" className="btn btn-primary">+ Nowe posiedzenie</Link>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--color-paper-2)" }}>
            <tr className="text-left">
              <Th>Nr</Th>
              <Th>Nazwa</Th>
              <Th>Termin</Th>
              <Th className="text-right">Uczestn.</Th>
              <Th className="text-right">Głos.</Th>
              <Th>Status</Th>
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
                <tr style={{ background: "var(--color-paper-2)" }}>
                  <Td colSpan={6}><span className="eyebrow">{year}</span></Td>
                </tr>
              )}
              <tr className="border-t border-[var(--color-rule-soft)] hover:bg-[var(--color-paper-2)]">
                <Td><span className="mono text-xs">{m.number}</span></Td>
                <Td><Link href={`/meetings/${m.id}`} className="underline-offset-2 hover:underline">{m.name}</Link></Td>
                <Td><span className="mono text-xs" style={{ color: "var(--color-ink-3)" }}>{formatDateTime(m.scheduledAt)}</span></Td>
                <Td className="text-right num">{m._count.participants}</Td>
                <Td className="text-right num">{m._count.votes}</Td>
                <Td><span className="pill pill-neutral">{MEETING_STATUS_LABEL[m.status]}</span></Td>
              </tr>
              </Fragment>
              );
            })}
            {meetings.length === 0 && (
              <tr><Td className="text-center" colSpan={6}><span style={{ color: "var(--color-ink-3)" }}>Brak posiedzeń.</span></Td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`eyebrow px-4 py-3 font-normal ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td className={`px-4 py-3 ${className ?? ""}`} colSpan={colSpan}>{children}</td>;
}
