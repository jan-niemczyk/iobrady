/**
 * Adres IP klienta do limitów (logowanie, prezentacja, SSE).
 *
 * Za zaufanym reverse proxy (Caddy w docker-compose) ustaw TRUST_PROXY=true - wtedy brany jest
 * OSTATNI wpis X-Forwarded-For (dopisany przez nasze proxy; wcześniejsze może podać klient).
 * Bez TRUST_PROXY nagłówki od klienta są ignorowane (nie da się nimi obejść limitu).
 */
export function clientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1") {
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((x) => x.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1].slice(0, 64);
    }
    const real = headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  return "direct";
}
