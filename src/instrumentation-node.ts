/** Zadania startowe serwera Node.js (ładowane z instrumentation.ts): kod instalacyjny kreatora i retencja dzienników. */
import { scheduleRetention } from "@/lib/retention";
import { prisma } from "@/lib/db";
import { setupToken, setupTokenFromEnv } from "@/lib/setupToken";

export async function registerNode() {
  scheduleRetention();
  try {
    const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { setupComplete: true } });
    if (!s?.setupComplete) {
      if (setupTokenFromEnv()) console.log("[setup] Kreator /setup czeka na konfigurację - kod instalacyjny: wartość SETUP_TOKEN z .env");
      else console.log(`[setup] Kreator /setup czeka na konfigurację - kod instalacyjny: ${setupToken()}`);
    }
  } catch (e) {
    console.error("[setup] Nie udało się sprawdzić stanu kreatora:", e);
  }
}
