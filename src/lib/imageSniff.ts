/**
 * Rozpoznanie typu obrazu po TREŚCI (sygnaturze), nie po deklaracji przeglądarki (SA-09).
 * SVG dopuszczamy tylko wtedy, gdy nie zawiera aktywnej treści ani odwołań zewnętrznych;
 * dodatkowo /api/uploads serwuje pliki z `nosniff` i CSP `sandbox`.
 */
export type ImageKind = "png" | "jpg" | "webp" | "svg";

export function sniffImage(buf: Buffer, allowSvg: boolean): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (allowSvg) {
    const head = buf.toString("utf8", 0, Math.min(buf.length, 4096)).replace(/^﻿/, "").trimStart();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
      // Encje znakowe rozwinięte przed kontrolą (np. &#106;avascript:), żeby nie omijały filtra.
      const all = buf.toString("utf8")
        .replace(/&#x([0-9a-f]{1,6});?/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
        .replace(/&#([0-9]{1,7});?/g, (_, d) => String.fromCodePoint(Math.min(parseInt(d, 10), 0x10ffff)));
      // UW-01: także elementy z prefiksem przestrzeni nazw (<s:script>, <h:iframe>) oraz przestrzenie
      // XHTML / XML Events, przez które da się osadzić aktywną treść w SVG.
      if (/<([a-z0-9_.-]+:)?(script|foreignObject|iframe|embed|object|handler|listener)\b|\son[a-z]+\s*=|javascript:|vbscript:|<!ENTITY|@import|www\.w3\.org\/1999\/xhtml|www\.w3\.org\/2001\/xml-events/i.test(all)) return null;
      // Odwołania (href / xlink:href / url()) tylko wewnętrzne (#id) lub osadzone obrazy data:image.
      const refs = [...all.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']|url\(\s*["']?([^"')]*)/gi)].map((m) => (m[1] ?? m[2] ?? "").trim());
      if (refs.some((r) => r && !r.startsWith("#") && !/^data:image\/(png|jpeg|webp|gif);/i.test(r))) return null;
      return "svg";
    }
  }
  return null;
}

export const IMAGE_MIME: Record<ImageKind, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
