import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  return (
    <div className="px-6 py-10 max-w-[520px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-8">
        <div className="eyebrow mb-2">Konto</div>
        <h1 style={{ fontSize: 28, lineHeight: 1.05 }}>Zmiana hasła</h1>
        <p className="text-sm mt-2" style={{ color: "var(--color-ink-2)" }}>
          Zalogowano jako {session.user.email}
        </p>
      </header>
      <ChangePasswordForm />
      <div className="mt-8">
        <a href="/" className="btn" style={{ padding: "6px 12px", fontSize: 12 }}>Powrót</a>
      </div>
    </div>
  );
}
