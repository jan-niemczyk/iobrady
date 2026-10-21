import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/booth";

/**
 * Moduł „Interpelacje i zapytania” - reguły dostępu sprawdzane po stronie serwera przy KAŻDYM
 * żądaniu (ukrycie przycisku nie wystarcza):
 *  - moduł włączony w ustawieniach (Settings.inquiriesEnabled) - wyłączenie blokuje nowe sprawy
 *    i czynności, ale nie usuwa danych; operator zachowuje odczyt i eksport;
 *  - prawo „Składanie interpelacji i zapytań” (InquiryGrant) nadawane indywidualnie - nie wynika
 *    z roli, członkostwa w organie, konta ani z tego, że ktoś został wskazany jako współautor;
 *  - aktywne konto;
 *  - dostęp do sprawy: autor albo osoba zaproszona jako współautor.
 * Odczyt dostępnej sprawy i jej PDF nie wymagają prawa składania.
 */

export async function moduleEnabled(): Promise<boolean> {
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { inquiriesEnabled: true } });
  return s?.inquiriesEnabled === true;
}

export async function requireModuleEnabled() {
  if (!(await moduleEnabled())) throw new HttpError(403, "Moduł interpelacji i zapytań jest wyłączony.");
}

/** Czy osoba ma teraz prawo składania (w zakresie grupy sprawy albo całej jednostki). */
export async function hasSubmitRight(userId: string, orgUnitId?: string | null): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { active: true, role: true } });
  if (!user?.active || user.role !== "PARTICIPANT") return false;
  const grants = await prisma.inquiryGrant.findMany({ where: { userId }, select: { orgUnitId: true } });
  return grants.some((g) => g.orgUnitId === null || (orgUnitId != null && g.orgUnitId === orgUnitId) || orgUnitId === undefined);
}

/** Wymaga: moduł włączony + aktywne konto + prawo składania w zakresie sprawy. */
export async function requireSubmitRight(userId: string, orgUnitId?: string | null) {
  await requireModuleEnabled();
  if (!(await hasSubmitRight(userId, orgUnitId)))
    throw new HttpError(403, "Nie masz uprawnienia „Składanie interpelacji i zapytań”.");
}

/** Czy radny ma dostęp do sprawy (autor, współautor albo zaproszony współautor). */
export async function canReadCase(user: { id: string; role: string }, caseId: string): Promise<boolean> {
  if (user.role === "OPERATOR") return true;
  const n = await prisma.inquiryAuthor.count({ where: { caseId, userId: user.id } });
  return n > 0;
}

/** Czy pokazać radnemu zakładkę modułu: prawo składania przy włączonym module albo własne sprawy. */
export async function canSeeInquiries(userId: string, settings: { inquiriesEnabled: boolean } | null): Promise<boolean> {
  if (settings?.inquiriesEnabled && (await prisma.inquiryGrant.count({ where: { userId } })) > 0) return true;
  return (await prisma.inquiryAuthor.count({ where: { userId } })) > 0;
}
