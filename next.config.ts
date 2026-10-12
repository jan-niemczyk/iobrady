import type { NextConfig } from "next";
import { staticCsp } from "./src/lib/csp";

// CSP: strony HTML dostają politykę z jednorazowym nonce w proxy (src/proxy.ts, H-08); tutaj tylko
// odpowiedzi bez HTML aplikacji (API, pliki statyczne) - bez skryptów inline.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/api/:path*", "/_next/:path*", "/fonts/:path*", "/icon.svg"].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: staticCsp }],
      })),
      // H-04: odpowiedzi API (dane osobowe, hasła startowe, wyniki) bez zapisu w pamięci podręcznej
      // przeglądarki i pośredników. Wyjątki niżej: strumień zdarzeń i wgrane obrazy.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      // UW-01: wgrane obrazy (logo, plansza) - ostra polityka z sandboxem. Musi być PO regule ogólnej:
      // nagłówki z next.config nadpisują te ustawione w trasie, więc bez tego SVG dostawałby CSP strony.
      ...["/api/uploads/:file*", "/uploads/:file*"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      })),
      // SSE wymaga, żeby Next nie buforował odpowiedzi
      {
        source: "/api/:path*/stream",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-transform" },
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
    ];
  },
};

export default nextConfig;
