import "../bootstrap-scoped.css";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { BootstrapJs } from "@/components/BootstrapJs";
import { FeedbackHost } from "@/components/ui/FeedbackHost";
import { SessionKeeper } from "@/components/SessionKeeper";
import { NotificationsBell } from "@/components/NotificationsBell";

export const dynamic = "force-dynamic";

/** Panel konta odpowiadającego - wyłącznie przekazane sprawy i odpowiedzi. */
export default async function ResponderLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "RESPONDER") redirect("/login");
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { organizationName: true, presentationLogoUrl: true } });
  return (
    <div className="d-flex flex-column min-vh-100 bg-body-tertiary">
      <BootstrapJs />
      <SessionKeeper />
      <nav className="navbar border-bottom bg-white">
        <div className="container-lg px-3 d-flex flex-wrap gap-2">
          <Link href="/odpowiedzi" className="navbar-brand d-flex align-items-center gap-2 me-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {settings?.presentationLogoUrl && <img src={settings.presentationLogoUrl} alt="" style={{ height: 28, width: "auto" }} />}
            <span className="fw-semibold">iOBRADY</span>
            <span className="text-body-secondary d-none d-sm-inline" style={{ fontSize: ".85rem" }}>{settings?.organizationName}</span>
          </Link>
          <NotificationsBell variant="bootstrap" />
          <span className="small d-none d-md-inline">{session.user.firstName} {session.user.lastName}</span>
          <Link href="/account" className="btn btn-sm">Konto</Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="btn btn-sm" type="submit">Wyloguj</button>
          </form>
        </div>
      </nav>
      <main className="flex-grow-1">{children}</main>
      <FeedbackHost variant="bootstrap" />
    </div>
  );
}
