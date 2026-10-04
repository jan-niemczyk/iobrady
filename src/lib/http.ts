import { NextResponse } from "next/server";

/**
 * Odpowiedzi błędów bez szczegółów technicznych (SA-10): klient dostaje krótki komunikat
 * po polsku, szczegóły (walidacja, wyjątki bazy) trafiają wyłącznie do logu serwera.
 */
export function badRequest(message = "Nieprawidłowe dane żądania.", detail?: unknown) {
  if (detail !== undefined) console.warn("[400]", message, detail instanceof Error ? detail.message : JSON.stringify(detail).slice(0, 2000));
  return new NextResponse(message, { status: 400 });
}

export function serverError(where: string, e: unknown, message = "Błąd serwera. Spróbuj ponownie.") {
  console.error(`[500] ${where}:`, e);
  return new NextResponse(message, { status: 500 });
}

/** Publiczny adres aplikacji do linków w e-mailach - z konfiguracji, nie z nagłówka Host. */
export function appOrigin(req: Request): string {
  const configured = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (configured) {
    try { return new URL(configured).origin; } catch { /* niepoprawny - użyj adresu żądania */ }
  }
  return new URL(req.url).origin;
}

/**
 * Błąd walidacji zod -> krótki komunikat. Własne (polskie) komunikaty ze schematu są przekazywane,
 * domyślne komunikaty biblioteki (angielskie, z wewnętrzną strukturą) - zastępowane ogólnym.
 */
export function validationError(error: { issues: { code: string; message: string; path: (string | number)[] }[] }) {
  const first = error.issues[0];
  const zodDefault = /^(String|Number|Array|BigInt|Date|Expected|Invalid|Required|Too |Unrecognized)/;
  const custom = !!first && (first.code === "custom" || !zodDefault.test(first.message));
  const msg = custom ? first.message : "Nieprawidłowe dane żądania.";
  return badRequest(msg, error.issues);
}
