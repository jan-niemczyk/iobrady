import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { audit } from "@/lib/audit";
import { sniffImage } from "@/lib/imageSniff";
import { loadRaster } from "@/lib/rasterImage";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * POST (multipart: file) - papier firmowy do zawiadomień: obraz całej strony A4 (PNG, JPG, WEBP
 * lub SVG bez aktywnej treści). Zwraca adres do zapisania w treści szablonu/zawiadomienia.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return new NextResponse("Brak pliku", { status: 400 });
  if (file.size > 5_000_000) return new NextResponse("Plik za duży (max 5 MB)", { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = sniffImage(buffer, true);
  if (!ext) return new NextResponse("Dozwolone: PNG, JPG, WEBP lub SVG (obraz całej strony A4).", { status: 400 });
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `letterhead-${Date.now()}.${ext}`;
  const full = path.join(UPLOAD_DIR, filename);
  await writeFile(full, buffer);
  const img = await loadRaster(full, 600);
  if (!img) return new NextResponse("Nie udało się odczytać obrazu.", { status: 400 });
  await audit({ action: "NOTICE_TEMPLATE_CHANGED", description: "Wgrano papier firmowy zawiadomień", userId: session.user.id, metadata: { file: filename } });
  // Proporcje inne niż A4 - obraz zostanie rozciągnięty na stronę; informujemy o tym w odpowiedzi.
  const ratio = img.height / img.width;
  return NextResponse.json({ ok: true, url: `/api/uploads/${filename}`, a4: Math.abs(ratio - 297 / 210) < 0.03 });
}
