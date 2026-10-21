import { Fragment } from "react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/operator/ui";
import { prisma } from "@/lib/db";
import { MEETING_STATUS_LABEL, formatDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function MeetingsListPage({ searchParams }: { searchParams: Promise<{ grupa?: string }> }) {
  const { grupa } = await searchParams;
  const [meetings, units] = await Promise.all([
    prisma.meeting.findMany({
      where: grupa ? { orgUnits: { some: { orgUnitId: grupa } } } : undefined,
      include: { _count: { select: { participants: true, votes: true } }, orgUnits: { select: { orgUnit: { select: { name: true, shortName: true } } } } },
      orderBy: { scheduledAt: "desc" },
      take: 200,
    }),
    prisma.orgUnit.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } }),
  ]);

  return (
    <PageContainer size="lg">
      <PageHeader
        title="Posiedzenia"
        description="Wszystkie posiedzenia, od najnowszych."
        actions={<Link href="/meetings/new" className="btn btn-primary">+ Nowe posiedzenie</Link>}
      />

      {units.length > 0 && (
        <form className="d-flex flex-wrap align-items-end gap-2 mb-3" method="get">
          <div>
            <label className="form-label small mb-1" htmlFor="ml-group">Grupa organizacyjna</label>
            <select id="ml-group" name="grupa" className="form-select" defaultValue={grupa ?? ""}>
              <option value="">Wszystkie posiedzenia</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (archiwalna)"}</option>)}
            </select>
          </div>
          <button className="btn btn-outline-secondary" type="submit">Filtruj</button>
          {grupa && <Link className="btn btn-link" href="/meetings">Wyczyść filtr</Link>}
        </form>
      )}
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
                      <td style={{ minWidth: 220 }}>
                        <Link href={`/meetings/${m.id}`} className="fw-medium">{m.name}</Link>
                        {m.orgUnits.length > 0 && <div className="small text-body-secondary">{m.orgUnits.map((o) => o.orgUnit.shortName || o.orgUnit.name).join(", ")}</div>}
                      </td>
                      <td className="num text-body-secondary text-nowrap">{formatDateTime(m.scheduledAt)}</td>
                      <td className="text-end num">{m._count.participants}</td>
                      <td className="text-end num">{m._count.votes}</td>
                      <td><span className="badge text-bg-light border">{MEETING_STATUS_LABEL[m.status]}</span></td>
                    </tr>
                  </Fragment>
                );
              })}
              {meetings.length === 0 && (
                <tr><td className="text-center text-body-secondary py-4" colSpan={6}>{grupa ? "Brak posiedzeń przypisanych do tej grupy." : "Brak posiedzeń."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
