"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/**
 * SA-06: po zalogowaniu przekierowujemy wyłącznie na ścieżkę WEWNĘTRZNĄ aplikacji.
 * Odrzucane: adresy z protokołem, "//host", "/\\host", znaki sterujące; w razie wątpliwości "/".
 */
function safeRedirectPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\\]/.test(raw)) return "/";
  try {
    const u = new URL(raw, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return "/";
    const path = u.pathname + u.search + u.hash;
    return path === "/login" || path.startsWith("/login?") ? "/" : path;
  } catch {
    return "/";
  }
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = safeRedirectPath(params.get("from"));
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
      setError(res.code === "rate_limited"
        ? "Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za kilka minut."
        : "Nieprawidłowy e-mail lub hasło.");
      return;
    }
    router.push(from);
    router.refresh();
  }

  return (
    <main className="min-vh-100 d-flex align-items-center justify-content-center px-3 py-5">
      <div className="w-100" style={{ maxWidth: 400 }}>
        <header className="text-center mb-4">
          <div className="fs-3 fw-bold text-primary lh-1" style={{ letterSpacing: "-.01em" }}>iOBRADY</div>
          <div className="small text-body-secondary mt-1">System obsługi posiedzeń</div>
        </header>

        <div className="card">
          <div className="card-body p-4">
            <h1 className="h5 mb-1">Logowanie</h1>
            <p className="small text-body-secondary mb-4">
              Zaloguj się, aby przejść do panelu posiedzenia.
            </p>

            <form onSubmit={onSubmit}>
              <div className="mb-3">
                <label className="form-label" htmlFor="email">Adres e-mail</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                  className={`form-control form-control-lg fs-6${error ? " is-invalid" : ""}`}
                  placeholder="np. anna.kowalska@miasto.pl"
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="password">Hasło</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  className={`form-control form-control-lg fs-6${error ? " is-invalid" : ""}`}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>

              {error && (
                <div id="login-error" className="alert alert-danger py-2 small mb-3" role="alert">
                  {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-lg fs-6 w-100 justify-content-center mt-1" disabled={pending}>
                {pending && <span className="spinner-border spinner-border-sm" aria-hidden="true" />}
                {pending ? "Logowanie…" : "Zaloguj się"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
