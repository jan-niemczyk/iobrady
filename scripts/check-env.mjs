#!/usr/bin/env node
/**
 * Sprawdzenie konfiguracji przed startem aplikacji (uruchamiane przez scripts/migrate.sh
 * w kontenerze oraz ręcznie: `node scripts/check-env.mjs`). Bez zależności.
 *
 * Błąd = start się zatrzymuje z czytelnym komunikatem (bez wypisywania wartości sekretów).
 * Ostrzeżenie = start trwa dalej.
 */
const env = process.env;
const errors = [];
const warnings = [];
const isProd = env.NODE_ENV === "production";
// Fragmenty wartości przykładowych z .env.example - takich wartości nie wolno użyć na produkcji.
const PLACEHOLDER = /ZMIEN|zmien|CHANGE_ME|change_me|przyklad|example-secret/;

function required(name, hint) {
  if (!env[name] || !env[name].trim()) errors.push(`Brak zmiennej ${name}. ${hint}`);
}

required("DATABASE_URL", "Adres bazy PostgreSQL (w Docker Compose ustawiany automatycznie z POSTGRES_*).");
required("NEXTAUTH_SECRET", "Wygeneruj: openssl rand -base64 32");
required("NEXTAUTH_URL", "Publiczny adres aplikacji, np. https://obrady.twoja-domena.pl");

if (env.NEXTAUTH_SECRET) {
  if (env.NEXTAUTH_SECRET.length < 32) errors.push("NEXTAUTH_SECRET jest za krótki (min. 32 znaki). Wygeneruj: openssl rand -base64 32");
  if (PLACEHOLDER.test(env.NEXTAUTH_SECRET)) errors.push("NEXTAUTH_SECRET ma wartość przykładową z .env.example - wygeneruj własną.");
}

if (env.DATABASE_URL) {
  try {
    const u = new URL(env.DATABASE_URL);
    if (!/^postgres(ql)?:$/.test(u.protocol)) errors.push("DATABASE_URL musi zaczynać się od postgresql://");
    if (isProd && PLACEHOLDER.test(decodeURIComponent(u.password))) errors.push("Hasło bazy (POSTGRES_PASSWORD) ma wartość przykładową - ustaw własne.");
  } catch {
    errors.push("DATABASE_URL nie jest poprawnym adresem (postgresql://użytkownik:hasło@host:5432/baza).");
  }
}

if (env.NEXTAUTH_URL) {
  try {
    const u = new URL(env.NEXTAUTH_URL);
    if (!/^https?:$/.test(u.protocol)) errors.push("NEXTAUTH_URL musi zaczynać się od http:// lub https://");
    if (u.pathname !== "/" && u.pathname !== "") errors.push("NEXTAUTH_URL ma być samym adresem (bez ścieżki), np. https://obrady.twoja-domena.pl");
    if (isProd && u.protocol === "http:" && !["localhost", "127.0.0.1"].includes(u.hostname))
      warnings.push(`NEXTAUTH_URL używa http:// (${u.hostname}) - ciasteczka sesji nie są chronione szyfrowaniem. Na produkcji użyj domeny z https://.`);
  } catch {
    errors.push("NEXTAUTH_URL nie jest poprawnym adresem URL.");
  }
}

if (env.APP_ENCRYPTION_KEY) {
  const k = Buffer.from(env.APP_ENCRYPTION_KEY.trim(), "base64");
  if (k.length !== 32) errors.push("APP_ENCRYPTION_KEY musi mieć 32 bajty w base64. Wygeneruj: openssl rand -base64 32");
} else if (isProd) {
  warnings.push("Brak APP_ENCRYPTION_KEY - hasło SMTP będzie szyfrowane kluczem wyprowadzonym z NEXTAUTH_SECRET. Zalecane: osobny klucz (openssl rand -base64 32).");
}
for (const old of (env.APP_ENCRYPTION_KEYS_OLD ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
  if (Buffer.from(old, "base64").length !== 32) errors.push("APP_ENCRYPTION_KEYS_OLD zawiera klucz o złej długości (wymagane 32 bajty w base64).");
}

if (env.SETUP_TOKEN && env.SETUP_TOKEN.trim().length < 12) errors.push("SETUP_TOKEN jest za krótki (min. 12 znaków) - albo zostaw puste, kod pojawi się w logu.");
if (env.INIT_SEED === "true" && (!env.SEED_OPERATOR_PASSWORD || env.SEED_OPERATOR_PASSWORD.length < 8))
  errors.push("INIT_SEED=true wymaga SEED_OPERATOR_PASSWORD (min. 8 znaków). Zalecane: zostaw INIT_SEED=false i użyj kreatora /setup.");
if (env.TRUST_PROXY && !["true", "false", "1", "0"].includes(env.TRUST_PROXY)) errors.push("TRUST_PROXY: dozwolone true / false.");

for (const w of warnings) console.warn(`[konfiguracja] UWAGA: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[konfiguracja] BŁĄD: ${e}`);
  console.error("[konfiguracja] Popraw plik .env (opis zmiennych: .env.example) i uruchom ponownie.");
  process.exit(1);
}
console.log("[konfiguracja] OK");
