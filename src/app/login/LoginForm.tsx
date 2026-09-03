"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setPending(false);
    if (res?.error) {
      setError("Nieprawidłowy e-mail lub hasło.");
      return;
    }
    router.push(from === "/login" ? "/" : from);
    router.refresh();
  }

  return (
    <main className="no-grid min-h-screen flex items-center justify-center px-6" style={{ background: "var(--color-paper)" }}>
      <div className="w-full max-w-[440px]">
        {/* nagłówek z pieczęcią */}
        <header className="mb-10">
          <div className="eyebrow mb-3">System obsługi posiedzeń</div>
          <h1 style={{ fontSize: 44, lineHeight: 1.05, fontWeight: 500 }}>
            iOBRADY.
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--color-ink-2)" }}>
            Zaloguj się, aby przejść do panelu posiedzenia.
          </p>
        </header>

        {/* karta logowania */}
        <form onSubmit={onSubmit} className="card p-8">
          <div className="mb-5">
            <label className="label" htmlFor="email">Adres e-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="np. anna.kowalska@miasto.pl"
            />
          </div>
          <div className="mb-6">
            <label className="label" htmlFor="password">Hasło</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>

          {error && (
            <div className="mb-5 px-3 py-2 text-sm" style={{ background: "var(--color-no-bg)", border: "1px solid var(--color-no)", color: "var(--color-no)" }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={pending}>
            {pending ? "Logowanie…" : "Zaloguj się"}
          </button>
        </form>
      </div>
    </main>
  );
}
