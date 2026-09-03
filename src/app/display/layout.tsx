/**
 * Layout dla widoku prezentacyjnego (ekran sali).
 * Importuje font Outfit z Google Fonts. Brak zwykłej nawigacji aplikacji.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prezentacja",
};

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Lato:wght@400;700;900&family=Roboto:wght@400;500;700&family=DM+Sans:wght@400;500;700&family=Source+Sans+3:wght@400;600;700&family=Open+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
