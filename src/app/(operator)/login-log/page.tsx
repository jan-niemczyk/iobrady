import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/labels";
import { ROLE_LABEL } from "@/lib/labels";
import { PageContainer, PageHeader } from "@/components/operator/ui";

export const dynamic = "force-dynamic";

export default async function LoginLogPage() {
  const events = await prisma.loginEvent.findMany({
    include: { user: true },
    orderBy: { at: "desc" },
    take: 500,
  });

  return (
    <PageContainer size="lg">
      <PageHeader
        kicker="Logowania"
        title="Log logowań"
        description={`Ostatnich ${events.length} logowań.`}
        actions={<a href="/api/login-log/csv" className="btn">Pobierz CSV</a>}
      />

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ width: 170 }}>Czas</th>
                <th>Kto</th>
                <th>E-mail</th>
                <th>Rola</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="num text-nowrap text-body-secondary">{formatDateTime(e.at)}</td>
                  <td>{e.user ? `${e.user.firstName} ${e.user.lastName}` : "-"}</td>
                  <td className="text-body-secondary">{e.user?.email ?? "-"}</td>
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
    </PageContainer>
  );
}
