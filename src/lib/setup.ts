import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/**
 * Bramka kreatora pierwszego uruchomienia - wywoływana z góry layoutów/stron (Server Components,
 * Node.js runtime). Dopóki Settings.setupComplete = false, przekierowuje na /setup.
 * (Middleware nie nadaje się do tego sprawdzenia - działa w Edge, bez dostępu do Prisma.)
 */
export async function requireSetupComplete() {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { setupComplete: true } });
  if (!settings?.setupComplete) redirect("/setup");
}
