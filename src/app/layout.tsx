import type { Metadata } from "next";
// H-08: czcionki panelu z własnego serwera (bez połączeń do Google przy każdym wejściu).
// Pliki wagowe zawierają unicode-range, więc przeglądarka pobiera tylko potrzebne zakresy znaków.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import Providers from "./providers";

// H-08: wszystkie strony renderowane dynamicznie - tylko wtedy Next.js dopisuje do skryptów
// nonce z CSP ustawionej w middleware (strona statyczna nie miałaby nonce i skrypty by nie ruszyły).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "iOBRADY - system obsługi posiedzeń",
  description: "Webowa aplikacja do obsługi posiedzeń, obecności i głosowań organów kolegialnych.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
