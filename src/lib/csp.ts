// Polityka CSP (utwardzenie, H-08). Wspólna dla proxy (src/proxy.ts - strony, z nonce) i next.config (API).
// Style: 'unsafe-inline' jest potrzebne dla stylów inline Reacta (atrybut style) - nie skryptów.
// Czcionki prezentacji/nakładki z Google Fonts (wybór operatora); panel używa czcionek własnych.
// Obrazy z własnej domeny, data: i blob: (podgląd logo, QR, generowane PDF). Ramki tylko z tej
// samej domeny (nakładka OBS osadza ekran).
const isProd = process.env.NODE_ENV === "production";

function build(scriptSrc: string): string {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** CSP strony HTML: skrypty wyłącznie z własnej domeny i z jednorazowym nonce. */
export function pageCsp(nonce: string): string {
  return build(`'self' 'nonce-${nonce}'`);
}

/** CSP odpowiedzi bez HTML aplikacji (API, pliki): żadnych skryptów inline. */
export const staticCsp = build("'self'");
