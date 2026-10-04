import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { sniffImage, type ImageKind } from "@/lib/imageSniff";

/**
 * Plansza reprezentacyjna - zdjęcie tła i osobny wariant logo.
 *   POST   /api/settings/board-image?kind=background|logo   (multipart, pole "file")
 *   DELETE /api/settings/board-image?kind=background|logo
 * Tylko operator. Typ pliku sprawdzany po treści (sygnatura), nie po deklaracji przeglądarki.
 * Pliki trafiają do tego samego wolumenu co logo (public/uploads, serwowane przez /api/uploads).
 */

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const LIMITS = { background: 8_000_000, logo: 2_000_000 } as const;
type Kind = keyof typeof LIMITS;

function sniff(buf: Buffer, kind: Kind): ImageKind | null {
  // SVG tylko dla logo (bez aktywnej treści) - patrz lib/imageSniff.
  return sniffImage(buf, kind === "logo");
}

function parseKind(req: Request): Kind | null {
  const k = new URL(req.url).searchParams.get("kind");
  return k === "background" || k === "logo" ? k : null;
}

const FIELD: Record<Kind, "boardBackgroundUrl" | "boardLogoUrl"> = { background: "boardBackgroundUrl", logo: "boardLogoUrl" };

async function removeLocal(url: string | null | undefined) {
  if (url?.startsWith("/api/uploads/")) {
    const name = url.replace("/api/uploads/", "");
    if (/^[A-Za-z0-9._-]+$/.test(name)) await unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Brak uprawnień.", { status: 403 });
  const kind = parseKind(req);
  if (!kind) return new NextResponse("Nieznany rodzaj pliku.", { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return new NextResponse("Nie wybrano pliku.", { status: 400 });
  if (file.size > LIMITS[kind]) {
    return new NextResponse(kind === "background" ? "Zdjęcie jest za duże (maks. 8 MB)." : "Logo jest za duże (maks. 2 MB).", { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf, kind);
  if (!ext) {
    return new NextResponse(kind === "background" ? "Dozwolone zdjęcia: JPG, PNG, WEBP." : "Dozwolone logo: PNG, WEBP, JPG lub SVG (bez skryptów).", { status: 415 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `board-${kind}-${Date.now()}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, filename), buf);
  const url = `/api/uploads/${filename}`;

  const prev = await prisma.settings.findUnique({ where: { id: "singleton" } });
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", [FIELD[kind]]: url },
    update: { [FIELD[kind]]: url },
  });
  await removeLocal(prev?.[FIELD[kind]]);

  await audit({
    action: "SETTINGS_CHANGED",
    description: kind === "background" ? "Plansza reprezentacyjna: wgrano zdjęcie tła" : "Plansza reprezentacyjna: wgrano logo",
    userId: session.user.id,
  });
  return NextResponse.json({ ok: true, url });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Brak uprawnień.", { status: 403 });
  const kind = parseKind(req);
  if (!kind) return new NextResponse("Nieznany rodzaj pliku.", { status: 400 });
  const prev = await prisma.settings.findUnique({ where: { id: "singleton" } });
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: { [FIELD[kind]]: null },
  });
  await removeLocal(prev?.[FIELD[kind]]);
  await audit({
    action: "SETTINGS_CHANGED",
    description: kind === "background" ? "Plansza reprezentacyjna: usunięto zdjęcie tła" : "Plansza reprezentacyjna: usunięto logo",
    userId: session.user.id,
  });
  return NextResponse.json({ ok: true });
}
