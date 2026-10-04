import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Retencja dzienników (utwardzenie - prywatność). Okresy ustawia operator w Ustawieniach;
 * null = wpisy NIE są usuwane (domyślnie - żadne dotychczasowe dane nie znikają bez decyzji).
 * Minimalny okres to 30 dni (walidacja API). Każde użycie zapisuje wpis RETENTION_APPLIED.
 *
 * Niezależnie od ustawień sprzątane są wygasłe sesje starsze niż 30 dni (rekordy techniczne).
 */
export async function applyRetention(byUserId?: string) {
  const s = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const before = (days: number) => new Date(Date.now() - days * 86_400_000);
  const result = { audit: 0, login: 0, email: 0, sessions: 0 };

  if (s?.retentionAuditDays) {
    result.audit = (await prisma.auditLog.deleteMany({ where: { createdAt: { lt: before(s.retentionAuditDays) } } })).count;
  }
  if (s?.retentionLoginDays) {
    const cut = before(s.retentionLoginDays);
    result.login = (await prisma.loginEvent.deleteMany({ where: { at: { lt: cut } } })).count
      + (await prisma.loginAttempt.deleteMany({ where: { at: { lt: cut } } })).count;
  }
  if (s?.retentionEmailLogDays) {
    result.email = (await prisma.emailLog.deleteMany({ where: { createdAt: { lt: before(s.retentionEmailLogDays) } } })).count;
  }
  result.sessions = (await prisma.userSession.deleteMany({ where: { expiresAt: { lt: before(30) } } })).count;

  await prisma.settings.updateMany({ where: { id: "singleton" }, data: { retentionLastRunAt: new Date() } });
  if (result.audit + result.login + result.email > 0 || byUserId) {
    await audit({
      action: "RETENTION_APPLIED",
      description: `Retencja dzienników: zdarzenia ${result.audit}, logowania ${result.login}, e-maile ${result.email}`,
      userId: byUserId,
      metadata: { ...result, auditDays: s?.retentionAuditDays ?? null, loginDays: s?.retentionLoginDays ?? null, emailDays: s?.retentionEmailLogDays ?? null },
    });
  }
  return result;
}

/** Uruchamiane z instrumentation.ts - raz na dobę (pierwszy raz 5 min po starcie). */
export function scheduleRetention() {
  const g = globalThis as unknown as { __iob_retention?: boolean };
  if (g.__iob_retention) return;
  g.__iob_retention = true;
  const run = () => applyRetention().catch((e) => console.error("[retention]", e));
  setTimeout(run, 5 * 60_000).unref?.();
  setInterval(run, 24 * 60 * 60_000).unref?.();
}
