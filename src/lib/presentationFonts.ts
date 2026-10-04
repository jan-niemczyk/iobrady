/**
 * Czcionki prezentacji (ekran sali) i transmisji (nakładka OBS) - jedna lista dla ustawień,
 * ekranów i ładowania z Google Fonts. Wartość `value` jest zapisywana w Settings
 * (presentationFont / overlayFont), więc istniejących wartości nie zmieniamy.
 */
export type PresentationFont = { value: string; label: string; stack: string };

const sans = (...names: string[]) => `${names.map((n) => `'${n}'`).join(", ")}, system-ui, sans-serif`;

export const PRESENTATION_FONTS: PresentationFont[] = [
  { value: "Inter", label: "Inter", stack: sans("Inter") },
  { value: "Lato", label: "Lato", stack: sans("Lato") },
  { value: "Roboto", label: "Roboto", stack: sans("Roboto") },
  { value: "DM Sans", label: "DM Sans", stack: sans("DM Sans") },
  { value: "Source Sans Pro", label: "Source Sans Pro", stack: sans("Source Sans 3", "Source Sans Pro") },
  { value: "Outfit", label: "Outfit", stack: sans("Outfit") },
  { value: "Open Sans", label: "Open Sans", stack: sans("Open Sans") },
  // Segoe UI: systemowy w Windows; poza Windows Inter (z Google Fonts) jako zastępstwo.
  { value: "Segoe UI", label: "Segoe UI (Windows)", stack: sans("Segoe UI", "Inter") },
  { value: "Fira Sans", label: "Fira Sans", stack: sans("Fira Sans") },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans", stack: sans("Plus Jakarta Sans") },
  { value: "Atkinson Hyperlegible", label: "Atkinson Hyperlegible", stack: sans("Atkinson Hyperlegible Next", "Atkinson Hyperlegible") },
  { value: "IBM Plex Sans", label: "IBM Plex Sans", stack: sans("IBM Plex Sans") },
  { value: "Clarity City", label: "Clarity City", stack: sans("Clarity City") },
  { value: "Barlow", label: "Barlow", stack: sans("Barlow") },
  { value: "Public Sans", label: "Public Sans", stack: sans("Public Sans") },
  { value: "Arimo", label: "Arimo", stack: sans("Arimo") },
  { value: "Nunito Sans", label: "Nunito Sans", stack: sans("Nunito Sans") },
  { value: "Titillium Web", label: "Titillium Web", stack: sans("Titillium Web") },
  { value: "Zalando Sans", label: "Zalando Sans", stack: sans("Zalando Sans") },
  { value: "Manrope", label: "Manrope", stack: sans("Manrope") },
  { value: "Mona Sans", label: "Mona Sans", stack: sans("Mona Sans") },
  { value: "Instrument Sans", label: "Instrument Sans", stack: sans("Instrument Sans") },
  { value: "Rethink Sans", label: "Rethink Sans", stack: sans("Rethink Sans") },
  { value: "Ubuntu Sans", label: "Ubuntu Sans", stack: sans("Ubuntu Sans") },
  { value: "Archivo", label: "Archivo", stack: sans("Archivo") },
  { value: "Familjen Grotesk", label: "Familjen Grotesk", stack: sans("Familjen Grotesk") },
  { value: "Poppins", label: "Poppins", stack: sans("Poppins") },
  // Tahoma: systemowy (Windows); poza Windows najbliższe zamienniki.
  { value: "Tahoma", label: "Tahoma (Windows)", stack: sans("Tahoma", "Verdana", "Segoe UI", "Arimo") },
  // Myriad Pro: czcionka Adobe (licencja komercyjna) - używana, gdy jest zainstalowana na komputerze
  // ekranu; w przeciwnym razie Inter (z Google Fonts).
  { value: "Myriad Pro", label: "Myriad Pro (jeśli zainstalowana, inaczej Inter)", stack: sans("Myriad Pro", "MyriadPro-Regular", "Myriad", "Inter") },
];

export function fontStack(name: string): string {
  return (PRESENTATION_FONTS.find((f) => f.value === name) ?? PRESENTATION_FONTS[0]).stack;
}

/** Rodziny dołączane do arkusza Google Fonts (dodane w AAW) - dopisywane do istniejących adresów. */
export const EXTRA_GOOGLE_FONT_FAMILIES = [
  "Clarity+City:wght@400;500;600;700",
  "Barlow:wght@400;500;600;700",
  "Public+Sans:wght@400;500;600;700",
  "Arimo:wght@400;500;600;700",
  "Nunito+Sans:wght@400;500;600;700",
  "Titillium+Web:wght@400;600;700",
  "Zalando+Sans:wght@400;500;600;700",
  "Manrope:wght@400;500;600;700",
  "Mona+Sans:wght@400;500;600;700",
  "Instrument+Sans:wght@400;500;600;700",
  "Rethink+Sans:wght@400;500;600;700",
  "Ubuntu+Sans:wght@400;500;600;700",
  "Archivo:wght@400;500;600;700",
  "Familjen+Grotesk:wght@400;500;600;700",
  "Poppins:wght@400;500;600;700",
].map((f) => `family=${f}`).join("&");
