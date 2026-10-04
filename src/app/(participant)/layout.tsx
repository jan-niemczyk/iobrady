import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import "./participant.css";
import { ParticipantNav } from "@/components/participant/ParticipantNav";
import { ThemeToggle } from "@/components/participant/ThemeToggle";
import { prisma } from "@/lib/db";
import { FeedbackHost } from "@/components/ui/FeedbackHost";
import { SessionKeeper } from "@/components/SessionKeeper";

export const dynamic = "force-dynamic";

export default async function ParticipantLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "PARTICIPANT") redirect("/login");
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.setupComplete) redirect("/setup");

  return (
    <div className="pt-shell min-h-screen flex flex-col">
      <SessionKeeper />
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          <div className="pt-brand">
            {settings?.presentationLogoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={settings.presentationLogoUrl} alt="" className="pt-brand-logo" />
            )}
            <span className="pt-brand-name">iOBRADY</span>
            {settings?.organizationName && (
              <span className="pt-brand-org hidden sm:inline">{settings.organizationName}</span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="pt-user hidden md:inline">
              {session.user.firstName} {session.user.lastName}
            </span>
            <ThemeToggle />
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="pt-btn pt-btn-sm" type="submit">Wyloguj</button>
            </form>
          </div>
        </div>
        <ParticipantNav />
      </header>
      <main className="pt-main flex-1">{children}</main>
      <FeedbackHost variant="app" />
    </div>
  );
}
