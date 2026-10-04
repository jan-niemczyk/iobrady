import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sniffImage } from "@/lib/imageSniff";
import { checkSetupToken } from "@/lib/setupToken";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * POST /api/setup/logo - wgranie logo w trakcie kreatora pierwszego uruchomienia.
 * Samo-wyłączający się: działa tylko dopóki Settings.setupComplete = false (nie wymaga
 * zalogowania, bo w tym momencie nie istnieje jeszcze żadne konto operatora).
 */
export async function POST(req: Request) {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (settings?.setupComplete) return new NextResponse("Konfiguracja została już ukończona", { status: 403 });
  if (!checkSetupToken(req.headers.get("x-setup-token")))
    return new NextResponse("Nieprawidłowy kod instalacyjny (znajdziesz go w logu serwera lub w SETUP_TOKEN).", { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return new NextResponse("Brak pliku", { status: 400 });

  if (file.size > 2_000_000) return new NextResponse("Plik za duży (max 2 MB)", { status: 400 });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  // SA-09: typ po treści pliku, nie po deklaracji przeglądarki; SVG bez aktywnej treści.
  const ext = sniffImage(buffer, true);
  if (!ext) return new NextResponse("Dozwolone: PNG, JPG, WEBP lub SVG bez skryptów i odwołań zewnętrznych.", { status: 400 });
  const filename = `logo-${Date.now()}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  const url = `/api/uploads/${filename}`;

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", presentationLogoUrl: url },
    update: { presentationLogoUrl: url },
  });

  return NextResponse.json({ ok: true, url });
}
