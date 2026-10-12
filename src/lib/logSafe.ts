/**
 * Bezpieczny opis błędu do logów i dziennika (H-05): bez danych wejściowych żądania.
 * - komunikaty Prismy obcinane przed listą argumentów zapytania (mogą zawierać dane osób),
 * - adresy e-mail maskowane, długość ograniczona,
 * - kod błędu (np. P2002, ECONNREFUSED, EAUTH) zachowany do diagnostyki.
 */
export function safeErrorText(e: unknown, max = 300): string {
  if (e == null) return "nieznany błąd";
  const err = e as { name?: string; code?: string | number; message?: string };
  let msg = typeof e === "string" ? e : (err.message ?? String(e));
  // Prisma: „Invalid `prisma.x.create()` invocation: { ...dane... }” - zostawiamy tylko nagłówek i przyczynę.
  if (/Invalid `prisma\./.test(msg)) {
    const lines = msg.split("\n").map((l) => l.trim()).filter(Boolean);
    const head = lines[0] ?? "";
    const cause = lines.filter((l) => !/^[{}\[\]]|^\w+:\s|^→|^\+|^-/.test(l)).slice(1).pop() ?? "";
    msg = `${head} ${cause}`.trim();
  }
  msg = msg.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail]").replace(/\s+/g, " ").trim();
  if (msg.length > max) msg = msg.slice(0, max) + "...";
  const parts = [err.name && err.name !== "Error" ? err.name : "", err.code != null ? String(err.code) : "", msg].filter(Boolean);
  return parts.join(" ");
}
