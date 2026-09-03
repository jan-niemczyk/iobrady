/**
 * Layout nakładki na transmisję (OBS / stream). Przezroczyste tło,
 * żeby całość dało się nałożyć na obraz z kamery jako "lower third".
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transmisja",
};

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lato:wght@400;700;900&family=Roboto:wght@400;500;700&family=DM+Sans:wght@400;500;700&family=Source+Sans+3:wght@400;600;700&family=Outfit:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
