import Link from "next/link";
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
    <div className="container py-4" style={{ maxWidth: 1200 }}>
      {/* Masthead */}
      <div className="d-flex align-items-end justify-content-between border-bottom pb-3 mb-4">
        <div>
          <div className="text-uppercase text-body-secondary small mb-1" style={{ letterSpacing: "0.06em" }}>
            {settings?.organizationName ?? "Organizacja"} - {new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })}
          </div>
          <h1 className="mb-0" style={{ fontSize: 34, fontWeight: 500 }}>Pulpit operatora</h1>
        </div>
        <Link href="/meetings/new" className="btn btn-primary">+ Nowe posiedzenie</Link>
      </div>

      {/* Aktywne posiedzenia */}
      <section className="mb-5">
        <div className="d-flex align-items-baseline justify-content-between mb-3">
          <h2 className="h5 mb-0">Aktywne posiedzenia</h2>
          <span className="text-body-secondary small">{active.length} {active.length === 1 ? "posiedzenie" : "posiedzeń"}</span>
        </div>
        {active.length === 0 ? (
          <div className="card">
            <div className="card-body text-center text-body-secondary py-5">
              Brak aktywnych posiedzeń. Otwórz przygotowane lub utwórz nowe.
            </div>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {active.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="card text-decoration-none text-body"
                style={{ borderLeft: "4px solid var(--bs-danger)" }}
              >
                <div className="card-body d-flex align-items-center justify-content-between flex-wrap gap-3">
                  <div>
                    <span className="badge text-bg-danger mb-2">W toku</span>
                    <div className="fw-medium fs-5">{m.name}</div>
                    <div className="small text-body-secondary mt-1">
                      Nr <span className="font-monospace">{m.number}</span> - {formatDateTime(m.scheduledAt)}
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-4">
                    <Stat label="Uczestnicy" value={m._count.participants} />
                    <Stat label="Głosowania" value={m._count.votes} />
                    <span>Przejdź →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Najbliższe */}
      <section className="mb-5">
        <h2 className="h5 mb-3">Najbliższe</h2>
        {upcoming.length === 0 ? (
          <div className="text-body-secondary small">Brak zaplanowanych posiedzeń.</div>
        ) : (
          <div className="list-group">
            {upcoming.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="list-group-item list-group-item-action d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div className="d-flex align-items-center gap-3">
                  <span className="font-monospace small text-body-secondary">{m.number}</span>
                  <span className="fw-medium">{m.name}</span>
                  <span className="badge text-bg-light border">{MEETING_STATUS_LABEL[m.status]}</span>
                </div>
                <div className="d-flex align-items-center gap-4 small">
                  <span className="font-monospace text-body-secondary">{formatDateTime(m.scheduledAt)}</span>
                  <span className="text-body-secondary">{m._count.participants} osób</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Niedawne */}
      <section>
        <div className="d-flex align-items-baseline justify-content-between mb-3">
          <h2 className="h5 mb-0">Niedawno zakończone</h2>
          <Link href="/meetings" className="small">Wszystkie posiedzenia →</Link>
        </div>
        <div className="row g-3">
          {recent.map((m) => (
            <div key={m.id} className="col-12 col-md-6 col-lg-4">
              <Link href={`/meetings/${m.id}`} className="card h-100 text-decoration-none text-body">
                <div className="card-body">
                  <div className="text-uppercase text-body-secondary small mb-1">Nr {m.number}</div>
                  <div className="fw-medium">{m.name}</div>
                  <div className="small mt-2 font-monospace text-body-secondary">
                    Zakończone: {formatDateTime(m.closedAt)}
                  </div>
                </div>
              </Link>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="col-12 text-body-secondary small">Brak.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="fs-4 font-monospace">{value}</div>
      <div className="text-uppercase text-body-secondary" style={{ fontSize: 10, letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}
