/**
 * Plansza reprezentacyjna - funkcje wspólne dla serwera (API prezentacji) i klienta
 * (komponent RepresentationBoard). Bez zależności od Reacta.
 */

const FALLBACK_COLOR = "#0B2A4A";

/** Logo planszy wg ustawienia: logo organizacji (domyślnie), osobny wariant albo brak. */
export function resolveBoardLogo(mode: string | null | undefined, orgLogoUrl: string | null, customLogoUrl: string | null): string | null {
  if (mode === "NONE") return null;
  if (mode === "CUSTOM") return customLogoUrl;
  return orgLogoUrl;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Kolor tła planszy: kolor przewodni, a gdy jest zbyt jasny dla białego tekstu - ten sam odcień
 * i nasycenie, ale przyciemniony (kontrast z bielą co najmniej 4.5:1). Tekst zostaje biały.
 */
export function boardBackgroundColor(color: string): string {
  const rgb = parseHex(color) ?? parseHex(FALLBACK_COLOR)!;
  const maxLum = 1.05 / 4.5 - 0.05; // ~0.183
  if (luminance(rgb) <= maxLum) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  const [h, s, l0] = rgbToHsl(rgb);
  let l = l0;
  let out = rgb;
  while (l > 0 && luminance(out) > maxLum) {
    l -= 0.01;
    out = hslToRgb(h, s, Math.max(0, l));
  }
  return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
}
