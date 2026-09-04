import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const ALLOWED = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);
const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp",
};

/**
 * POST /api/setup/logo - wgranie logo w trakcie kreatora pierwszego uruchomienia.
 * Samo-wyłączający się: działa tylko dopóki Settings.setupComplete = false (nie wymaga
 * zalogowania, bo w tym momencie nie istnieje jeszcze żadne konto operatora).
 */
export async function POST(req: Request) {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (settings?.setupComplete) return new NextResponse("Konfiguracja została już ukończona", { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return new NextResponse("Brak pliku", { status: 400 });
  if (!ALLOWED.has(file.type)) return new NextResponse("Dozwolone: PNG, JPG, SVG, WEBP", { status: 400 });
  if (file.size > 2_000_000) return new NextResponse("Plik za duży (max 2 MB)", { status: 400 });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = EXT[file.type] ?? "png";
  const filename = `logo-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  const url = `/api/uploads/${filename}`;

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", presentationLogoUrl: url },
    update: { presentationLogoUrl: url },
  });

  return NextResponse.json({ ok: true, url });
}
