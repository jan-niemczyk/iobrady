import { readFileSync } from "fs";
import path from "path";

/**
 * Identyfikator wersji (kompilacji) aplikacji - zmienia się przy każdej aktualizacji. Ekrany sali
 * porównują go z wartością z chwili otwarcia i przeładowują się po aktualizacji serwera.
 */
let cached: string | null = null;
export function appVersion(): string {
  if (cached) return cached;
  try {
    cached = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    cached = `start-${Date.now().toString(36)}`;
  }
  return cached;
}
