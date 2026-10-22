import { readFile } from "fs/promises";
import path from "path";
import { sniffImage } from "@/lib/imageSniff";

/**
 * Obraz do dokumentów (DOCX, PDF): PNG/JPEG bez zmian, SVG i WEBP renderowane do PNG (sharp).
 * Word i pdfmake nie obsługują pewnie SVG/WEBP - wcześniej logo w tym formacie znikało z zawiadomień.
 * SVG przeszło przy wgraniu kontrolę bez aktywnej treści i odwołań zewnętrznych (imageSniff).
 */
export type RasterImage = { data: Buffer; kind: "png" | "jpg"; width: number; height: number };

export function uploadedFilePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^\/(?:api\/)?uploads\/([A-Za-z0-9._-]{1,200})$/.exec(url);
  return m ? path.join(process.cwd(), "public", "uploads", m[1]) : null;
}

export async function loadRaster(filePath: string | null, maxWidthPx = 1600): Promise<RasterImage | null> {
  if (!filePath) return null;
  let buf: Buffer;
  try { buf = await readFile(filePath); } catch { return null; }
  const kind = sniffImage(buf, true);
  if (!kind) return null;
  const sharp = (await import("sharp")).default;
  try {
    if (kind === "png" || kind === "jpg") {
      const m = await sharp(buf).metadata();
      return { data: buf, kind, width: m.width ?? 1, height: m.height ?? 1 };
    }
    // SVG: gęstość dobrana tak, by wynik miał rozsądną rozdzielczość druku (bez rozmycia).
    const img = kind === "svg" ? sharp(buf, { density: 300 }) : sharp(buf);
    const png = await img.resize({ width: maxWidthPx, withoutEnlargement: kind !== "svg" }).png().toBuffer();
    const m = await sharp(png).metadata();
    return { data: png, kind: "png", width: m.width ?? 1, height: m.height ?? 1 };
  } catch {
    return null;
  }
}
