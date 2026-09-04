"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SetupWizardClient() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/setup/logo", { method: "POST", body: form });
      if (!r.ok) { alert(await r.text()); return; }
      const { url } = await r.json();
      setLogoUrl(url);
    } finally {
      setLogoBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) { setError("Hasła nie są identyczne."); return; }
    if (password.length < 8) { setError("Hasło musi mieć min. 8 znaków."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName, firstName, lastName, email, password }),
      });
      if (!r.ok) { setError(await r.text()); return; }
      router.push("/login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="card" style={{ width: "100%", maxWidth: 480 }}>
        <div className="px-6 py-5 border-b border-[var(--color-rule-soft)]">
          <div className="eyebrow mb-1">Pierwsze uruchomienie</div>
          <h1 style={{ fontSize: 24, margin: 0 }}>Skonfiguruj iOBRADY</h1>
          <p className="text-sm mt-2" style={{ color: "var(--color-ink-2)" }}>
            Kilka pól i można zacząć - to jedyny krok konfiguracji przed pierwszym logowaniem.
          </p>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="label">Nazwa organizacji</label>
            <input className="input" required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="np. Rada Miasta Przykładowo" />
          </div>

          <div>
            <label className="label">Logo (opcjonalnie)</label>
            <div className="flex items-center gap-3">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" style={{ height: 40, width: "auto", objectFit: "contain", border: "1px solid var(--color-rule-soft)", borderRadius: 4, padding: 2 }} />
              )}
              <label className="btn" style={{ cursor: logoBusy ? "default" : "pointer" }}>
                {logoBusy ? "Wgrywanie…" : logoUrl ? "Zmień logo…" : "Wybierz plik…"}
                <input
                  type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }}
                  disabled={logoBusy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Imię</label>
              <input className="input" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className="label">Nazwisko</label>
              <input className="input" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">E-mail (login operatora)</label>
            <input type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Hasło</label>
              <input type="password" className="input" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 8 znaków" />
            </div>
            <div>
              <label className="label">Powtórz hasło</label>
              <input type="password" className="input" required minLength={8} value={password2} onChange={(e) => setPassword2(e.target.value)} />
            </div>
          </div>

          {error && <div className="text-sm" style={{ color: "var(--color-no)" }}>{error}</div>}

          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={busy || logoBusy}>
            {busy ? "Konfiguruję…" : "Zakończ konfigurację i przejdź do logowania"}
          </button>
        </form>
      </div>
    </div>
  );
}
