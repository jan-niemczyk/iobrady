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
    <div className="container py-4" style={{ maxWidth: 1200 }}>
      <header className="d-flex align-items-end justify-content-between border-bottom pb-3 mb-4 flex-wrap gap-2">
        <div>
          <div className="text-uppercase text-body-secondary small mb-1" style={{ letterSpacing: "0.06em" }}>Logowania</div>
          <h1 className="mb-2" style={{ fontSize: 30 }}>Log logowań</h1>
          <p className="text-body-secondary small mb-0">Ostatnich {events.length} logowań.</p>
        </div>
        <a href="/api/login-log/csv" className="btn btn-outline-secondary">Pobierz CSV</a>
      </header>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th className="small text-uppercase text-body-secondary fw-normal" style={{ width: 170 }}>Czas</th>
                <th className="small text-uppercase text-body-secondary fw-normal">Kto</th>
                <th className="small text-uppercase text-body-secondary fw-normal">E-mail</th>
                <th className="small text-uppercase text-body-secondary fw-normal">Rola</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="font-monospace small text-body-secondary">{formatDateTime(e.at)}</td>
                  <td>{e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"}</td>
                  <td className="small text-body-secondary">{e.user?.email ?? "-"}</td>
                  <td><span className="badge text-bg-light border">{ROLE_LABEL[e.role]}</span></td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={4} className="text-center text-body-secondary py-5">Brak wpisów.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
