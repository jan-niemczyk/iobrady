import "../bootstrap-scoped.css";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") redirect("/login");
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.setupComplete) redirect("/setup");

  return (
    <div className="d-flex flex-column min-vh-100">
      <TopBar
        userName={`${session.user.firstName} ${session.user.lastName}`}
        logoUrl={settings?.presentationLogoUrl ?? null}
      />
      <main className="flex-grow-1">{children}</main>
    </div>
  );
}

function TopBar({ userName, logoUrl }: { userName: string; logoUrl: string | null }) {
  return (
    <nav className="navbar navbar-expand-lg sticky-top border-bottom bg-white no-print">
      <div className="container-fluid px-4">
        <Link href="/dashboard" className="navbar-brand d-flex align-items-center gap-2">
          {logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt="" style={{ height: 36, width: "auto", objectFit: "contain" }} />
          )}
          <span style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}>iOBRADY</span>
          <span className="text-body-secondary small d-none d-md-inline">Panel operatora</span>
        </Link>
        <div className="d-flex flex-wrap align-items-center gap-1">
          <NavLink href="/dashboard">Pulpit</NavLink>
          <NavLink href="/meetings">Posiedzenia</NavLink>
          <NavLink href="/participants">Uczestnicy</NavLink>
          <NavLink href="/guests">Goście</NavLink>
          <NavLink href="/templates">Szablony</NavLink>
          <NavLink href="/login-log">Logowania</NavLink>
          <NavLink href="/settings">Ustawienia</NavLink>
        </div>
        <div className="d-flex align-items-center gap-3 ms-3">
          <div className="text-end d-none d-sm-block">
            <div className="text-body-secondary" style={{ fontSize: 11 }}>Zalogowano jako</div>
            <div className="small fw-medium">{userName}</div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="btn btn-outline-secondary btn-sm" type="submit">Wyloguj</button>
          </form>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="nav-link px-2 py-1 small">
      {children}
    </Link>
  );
}
