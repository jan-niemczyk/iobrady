import { randomBytes, timingSafeEqual } from "crypto";

/**
 * Kod instalacyjny kreatora /setup (SA-09). Do czasu ukończenia konfiguracji kreator wymaga
 * kodu - przypadkowy gość, który trafi na świeżą instalację, nie założy konta operatora.
 *  - SETUP_TOKEN w .env (zalecane przy wdrożeniu skryptowym), albo
 *  - kod losowany przy starcie serwera i wypisywany w logu (`docker compose logs app`).
 */
const g = globalThis as unknown as { __iob_setup_token?: string };

export function setupToken(): string {
  const env = process.env.SETUP_TOKEN?.trim();
  if (env) return env;
  if (!g.__iob_setup_token) g.__iob_setup_token = randomBytes(9).toString("base64url");
  return g.__iob_setup_token;
}

export function setupTokenFromEnv(): boolean {
  return !!process.env.SETUP_TOKEN?.trim();
}

export function checkSetupToken(presented: string | null | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented.trim()), b = Buffer.from(setupToken());
  return a.length === b.length && timingSafeEqual(a, b);
}
