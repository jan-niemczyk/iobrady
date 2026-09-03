import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        userName={`${session.user.firstName} ${session.user.lastName}`}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}

function TopBar({ userName }: { userName: string }) {
  return (
    <header
      className="no-grid no-print sticky top-0 z-30 flex items-center justify-between px-6 h-14"
      style={{
        background: "var(--color-paper)",
        borderBottom: "1px solid var(--color-rule)",
      }}
    >
      <div className="flex items-center gap-8">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>
            iOBRADY
          </span>
          <span className="eyebrow">Panel operatora</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavLink href="/dashboard">Pulpit</NavLink>
          <NavLink href="/meetings">Posiedzenia</NavLink>
          <NavLink href="/participants">Uczestnicy</NavLink>
          <NavLink href="/guests">Goście</NavLink>
          <NavLink href="/templates">Szablony</NavLink>
          <NavLink href="/audit">Rejestr</NavLink>
          <NavLink href="/settings">Ustawienia</NavLink>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-xs" style={{ color: "var(--color-ink-3)" }}>Zalogowano jako</div>
          <div className="text-sm font-medium">{userName}</div>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="btn" type="submit">Wyloguj</button>
        </form>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-sm hover:bg-[var(--color-paper-2)]"
      style={{ textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}
