import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Limity logowania (SA-05). Liczone są WYŁĄCZNIE nieudane próby w oknie 15 minut, więc wielu
 * radnych logujących się poprawnie z jednego publicznego IP (sala obrad, NAT) nie jest blokowanych.
 *
 *  - konto + IP:  8 błędów   -> blokada tej pary (literówki jednej osoby nie blokują innych),
 *  - konto:      30 błędów   -> blokada konta ze wszystkich IP (zgadywanie rozproszone),
 *  - IP:        150 błędów   -> blokada IP (zgadywanie wielu kont z jednego adresu).
 *
 * Blokada dotyczy dowolnego ciągu e-mail (także nieistniejącego konta), więc nie zdradza,
 * czy konto istnieje. Wygasa sama po upływie okna od najstarszej liczonej próby.
 */
export const WINDOW_MS = 15 * 60_000;
export const LIMITS = { emailIp: 8, email: 30, ip: 150 } as const;

export async function isLoginBlocked(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [pair, byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, ip, success: false, at: { gte: since } } }),
    prisma.loginAttempt.count({ where: { email, success: false, at: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, success: false, at: { gte: since } } }),
  ]);
  return pair >= LIMITS.emailIp || byEmail >= LIMITS.email || byIp >= LIMITS.ip;
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  await prisma.loginAttempt.create({ data: { email: email.slice(0, 254), ip, success } });
  if (success) return;
  // Wpis audytu w chwili osiągnięcia progu (raz na przekroczenie).
  const since = new Date(Date.now() - WINDOW_MS);
  const [pair, byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, ip, success: false, at: { gte: since } } }),
    prisma.loginAttempt.count({ where: { email, success: false, at: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, success: false, at: { gte: since } } }),
  ]);
  const hit = pair === LIMITS.emailIp ? "konto+IP" : byEmail === LIMITS.email ? "konto" : byIp === LIMITS.ip ? "IP" : null;
  if (hit) {
    await audit({
      action: "LOGIN_LOCKED",
      description: `Czasowa blokada logowania (${hit}) po serii nieudanych prób`,
      metadata: { email, ip, scope: hit, windowMinutes: WINDOW_MS / 60_000 },
    }).catch(() => {});
  }
}
