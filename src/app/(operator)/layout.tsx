import "../bootstrap-scoped.css";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { BootstrapJs } from "@/components/BootstrapJs";
import { NavLinks } from "@/components/operator/NavLinks";
import { FeedbackHost } from "@/components/ui/FeedbackHost";
import { SessionKeeper } from "@/components/SessionKeeper";

export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") redirect("/login");
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.setupComplete) redirect("/setup");

  return (
    <div className="d-flex flex-column min-vh-100">
      <BootstrapJs />
      <SessionKeeper />
      <TopBar
        userName={`${session.user.firstName} ${session.user.lastName}`}
        logoUrl={settings?.presentationLogoUrl ?? null}
      />
      <main className="flex-grow-1">{children}</main>
      <FeedbackHost variant="bootstrap" />
    </div>
  );
}

function TopBar({ userName, logoUrl }: { userName: string; logoUrl: string | null }) {
  return (
    <nav className="navbar navbar-expand-lg sticky-top border-bottom bg-white no-print">
      <div className="container-fluid px-3 px-lg-4">
        <Link href="/dashboard" className="navbar-brand d-flex align-items-center gap-2 me-4">
          {logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt="" style={{ height: 32, width: "auto", objectFit: "contain" }} />
          )}
          <span className="fw-semibold">iOBRADY</span>
          <span className="text-body-secondary small d-none d-xl-inline">Panel operatora</span>
        </Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#opNav" aria-controls="opNav" aria-expanded="false" aria-label="Pokaż menu">
          <span className="navbar-toggler-icon" />
        </button>
        <div className="collapse navbar-collapse" id="opNav">
          <NavLinks />
          <div className="d-flex align-items-center gap-3 py-2 py-lg-0">
            <div className="small text-lg-end lh-sm">
              <div className="text-body-secondary">Zalogowano jako</div>
              <div className="fw-medium">{userName}</div>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="btn btn-sm" type="submit">Wyloguj</button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  );
}
