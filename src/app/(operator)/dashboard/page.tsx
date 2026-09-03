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
    <div className="px-6 py-8 max-w-[1400px] mx-auto">
      {/* Masthead */}
      <div className="flex items-end justify-between border-b border-[var(--color-rule)] pb-6 mb-8">
        <div>
          <div className="eyebrow mb-2">{settings?.organizationName ?? "Organizacja"} - {new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })}</div>
          <h1 style={{ fontSize: 40, lineHeight: 1, fontWeight: 500 }}>Pulpit operatora</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/meetings/new" className="btn btn-primary">+ Nowe posiedzenie</Link>
        </div>
      </div>

      {/* Aktywne posiedzenia */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 style={{ fontSize: 22 }}>Aktywne posiedzenia</h2>
          <span className="eyebrow">{active.length} {active.length === 1 ? "posiedzenie" : "posiedzeń"}</span>
        </div>
        {active.length === 0 ? (
          <div className="card p-8 text-center" style={{ color: "var(--color-ink-3)" }}>
            Brak aktywnych posiedzeń. Otwórz przygotowane lub utwórz nowe.
          </div>
        ) : (
          <div className="grid gap-3">
            {active.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="card p-5 flex items-center justify-between hover:bg-[var(--color-paper-2)] transition-colors"
                style={{ borderLeftWidth: 4, borderLeftColor: "var(--color-live)" }}
              >
                <div className="flex items-center gap-6">
                  <div>
                    <span className="pill pill-live mb-2">W toku</span>
                    <div className="font-medium text-lg mt-2">{m.name}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>
                      Nr <span className="mono">{m.number}</span> - {formatDateTime(m.scheduledAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <Stat label="Uczestnicy" value={m._count.participants} />
                  <Stat label="Głosowania" value={m._count.votes} />
                  <span className="text-sm">Przejdź →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Najbliższe */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 style={{ fontSize: 22 }}>Najbliższe</h2>
        </div>
        {upcoming.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--color-ink-3)" }}>Brak zaplanowanych posiedzeń.</div>
        ) : (
          <div className="card divide-y divide-[var(--color-rule-soft)]">
            {upcoming.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-[var(--color-paper-2)]">
                <div className="flex items-center gap-4">
                  <span className="mono text-xs" style={{ color: "var(--color-ink-3)" }}>{m.number}</span>
                  <span className="font-medium">{m.name}</span>
                  <span className="pill pill-neutral">{MEETING_STATUS_LABEL[m.status]}</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="mono" style={{ color: "var(--color-ink-3)" }}>{formatDateTime(m.scheduledAt)}</span>
                  <span style={{ color: "var(--color-ink-3)" }}>{m._count.participants} osób</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Niedawne */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 style={{ fontSize: 22 }}>Niedawno zakończone</h2>
          <Link href="/meetings" className="text-sm underline underline-offset-2">Wszystkie posiedzenia →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recent.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`} className="card-soft p-4 hover:bg-[var(--color-paper-2)]">
              <div className="eyebrow mb-1">Nr {m.number}</div>
              <div className="font-medium">{m.name}</div>
              <div className="text-xs mt-2 mono" style={{ color: "var(--color-ink-3)" }}>
                Zakończone: {formatDateTime(m.closedAt)}
              </div>
            </Link>
          ))}
          {recent.length === 0 && (
            <div className="text-sm" style={{ color: "var(--color-ink-3)" }}>Brak.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="num text-2xl">{value}</div>
      <div className="eyebrow mt-1">{label}</div>
    </div>
  );
}
