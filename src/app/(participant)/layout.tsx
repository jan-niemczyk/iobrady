import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/participant/ThemeToggle";

export default async function ParticipantLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "PARTICIPANT") redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="no-grid sticky top-0 z-30 flex items-center justify-between px-4 h-14 gap-2"
        style={{ background: "var(--color-paper)", borderBottom: "1px solid var(--color-rule)" }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span style={{ fontSize: 20, fontWeight: 600 }}>iOBRADY</span>
          <span className="eyebrow hidden sm:inline">Panel uczestnika</span>
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
