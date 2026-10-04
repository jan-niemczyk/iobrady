import Link from "next/link";
import { PageContainer, PageHeader, CardHeader } from "@/components/operator/ui";
import { prisma } from "@/lib/db";
import { MEETING_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { MeetingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [active, upcoming, recent, settings] = await Promise.all([
    prisma.meeting.findMany({
      where: { status: { in: [MeetingStatus.OPEN, MeetingStatus.IN_PROGRESS, MeetingStatus.PAUSED] } },
      include: { _count: { select: { participants: true, votes: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.meeting.findMany({
      where: { status: { in: [MeetingStatus.PREPARED, MeetingStatus.DRAFT] } },
      include: { _count: { select: { participants: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 8,
    }),
    prisma.meeting.findMany({
      where: { status: { in: [MeetingStatus.CLOSED, MeetingStatus.ARCHIVED] } },
      orderBy: { closedAt: "desc" },
      take: 5,
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);

  return (
    <PageContainer size="lg">
      <PageHeader
        kicker={`${settings?.organizationName ?? "Organizacja"} - ${new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })}`}
        title="Pulpit operatora"
        actions={<Link href="/meetings/new" className="btn btn-primary">+ Nowe posiedzenie</Link>}
      />

      {/* Aktywne posiedzenia */}
      <section className="mb-4">
        <div className="d-flex align-items-baseline justify-content-between mb-2">
          <h2 className="h4 mb-0">Aktywne posiedzenia</h2>
          <span className="text-body-secondary small">{active.length} {active.length === 1 ? "posiedzenie" : "posiedzeń"}</span>
        </div>
        {active.length === 0 ? (
          <div className="card">
            <div className="card-body text-body-secondary">
              Brak aktywnych posiedzeń. Otwórz przygotowane lub utwórz nowe.
            </div>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {active.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="card text-decoration-none text-body" style={{ borderLeft: "4px solid var(--bs-danger)" }}>
                <div className="card-body d-flex align-items-center justify-content-between flex-wrap gap-3">
                  <div className="min-w-0">
                    <span className="badge badge-live mb-1">{MEETING_STATUS_LABEL[m.status]}</span>
                    <div className="fw-semibold fs-5" style={{ overflowWrap: "anywhere" }}>{m.name}</div>
                    <div className="small text-body-secondary">
                      Nr <span className="num">{m.number}</span> - {formatDateTime(m.scheduledAt)}
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-4">
                    <Stat label="Uczestnicy" value={m._count.participants} />
                    <Stat label="Głosowania" value={m._count.votes} />
                    <span className="btn btn-primary btn-sm">Przejdź</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="row g-3">
        {/* Najbliższe */}
        <section className="col-12 col-lg-7">
          <div className="card h-100">
            <CardHeader title="Najbliższe" />
            {upcoming.length === 0 ? (
              <div className="card-body small text-body-secondary">Brak zaplanowanych posiedzeń.</div>
            ) : (
              <div className="list-group list-group-flush">
                {upcoming.map((m) => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className="list-group-item list-group-item-action">
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                      <span className="fw-medium">{m.name}</span>
                      <span className="badge text-bg-light border">{MEETING_STATUS_LABEL[m.status]}</span>
                    </div>
                    <div className="small text-body-secondary">
                      Nr <span className="num">{m.number}</span> - {formatDateTime(m.scheduledAt)} - {m._count.participants} osób
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Niedawne */}
        <section className="col-12 col-lg-5">
          <div className="card h-100">
            <CardHeader title="Niedawno zakończone" right={<Link href="/meetings" className="small">Wszystkie posiedzenia →</Link>} />
            {recent.length === 0 ? (
              <div className="card-body small text-body-secondary">Brak zakończonych posiedzeń.</div>
            ) : (
              <div className="list-group list-group-flush">
                {recent.map((m) => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className="list-group-item list-group-item-action">
                    <div className="fw-medium">{m.name}</div>
                    <div className="small text-body-secondary">Nr <span className="num">{m.number}</span> - zakończone {formatDateTime(m.closedAt)}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="fs-4 fw-semibold num lh-1">{value}</div>
      <div className="small text-body-secondary">{label}</div>
    </div>
  );
}
