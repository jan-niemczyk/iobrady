import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/participant/ThemeToggle";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ParticipantLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "PARTICIPANT") redirect("/login");
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (!settings?.setupComplete) redirect("/setup");

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="no-grid sticky top-0 z-30 flex items-center justify-between px-4 h-16 gap-2"
        style={{ background: "var(--color-paper)", borderBottom: "1px solid var(--color-rule)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {settings?.presentationLogoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={settings.presentationLogoUrl}
              alt=""
              style={{ height: 40, width: "auto", objectFit: "contain", flexShrink: 0 }}
            />
          )}
          {settings?.organizationName && (
            <span
              className="hidden sm:inline truncate"
              style={{
                fontSize: 14,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--color-ink-2)",
                lineHeight: 1,
              }}
            >
              {settings.organizationName}
            </span>
          )}
          <span
            className="eyebrow"
            style={{ whiteSpace: "nowrap", borderLeft: "1px solid var(--color-rule-soft)", paddingLeft: 12 }}
          >
            iOBRADY
          </span>
          <nav className="hidden md:flex items-center gap-3 text-sm ml-2">
            <Link href="/session" className="hover:underline">Bieżące</Link>
            <Link href="/session/archive" className="hover:underline">Archiwum</Link>
            <Link href="/session/upcoming" className="hover:underline">Nadchodzące</Link>
          </nav>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-medium truncate hidden sm:block">
            {session.user.firstName} {session.user.lastName}
          </div>
          <ThemeToggle />
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="btn" type="submit" style={{ whiteSpace: "nowrap" }}>Wyloguj</button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
