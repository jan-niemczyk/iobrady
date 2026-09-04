import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/labels";
import { ROLE_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function LoginLogPage() {
  const events = await prisma.loginEvent.findMany({
    include: { user: true },
    orderBy: { at: "desc" },
    take: 500,
  });

  return (
    <div className="px-6 py-8 max-w-[1400px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-8 flex items-end justify-between">
        <div>
          <div className="eyebrow mb-2">Logowania</div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>Log logowań</h1>
          <p className="text-sm mt-3" style={{ color: "var(--color-ink-2)" }}>
            Ostatnich {events.length} logowań.
          </p>
        </div>
        <a href="/api/login-log/csv" className="btn">Pobierz CSV</a>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--color-paper-2)" }}>
            <tr className="text-left">
              <th className="eyebrow px-4 py-3 font-normal" style={{ width: 170 }}>Czas</th>
              <th className="eyebrow px-4 py-3 font-normal">Kto</th>
              <th className="eyebrow px-4 py-3 font-normal">E-mail</th>
              <th className="eyebrow px-4 py-3 font-normal">Rola</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-[var(--color-rule-soft)]">
                <td className="px-4 py-2 mono text-xs" style={{ color: "var(--color-ink-3)" }}>{formatDateTime(e.at)}</td>
                <td className="px-4 py-2">{e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"}</td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--color-ink-3)" }}>{e.user?.email ?? "-"}</td>
                <td className="px-4 py-2"><span className="pill pill-neutral">{ROLE_LABEL[e.role]}</span></td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--color-ink-3)" }}>Brak wpisów.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
