import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { sniffImage } from "@/lib/imageSniff";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** POST /api/settings/logo - wgranie logo prezentacji (multipart/form-data, pole "file"). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

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

  // Usuń poprzednie logo (jeśli było lokalnym plikiem), żeby nie zaśmiecać wolumenu.
  const prev = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (prev?.presentationLogoUrl?.startsWith("/api/uploads/")) {
    await unlink(path.join(UPLOAD_DIR, prev.presentationLogoUrl.replace("/api/uploads/", ""))).catch(() => {});
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", presentationLogoUrl: url },
    update: { presentationLogoUrl: url },
  });

  await audit({ action: "SETTINGS_CHANGED", description: "Wgrano logo prezentacji", userId: session.user.id });
  return NextResponse.json({ ok: true, url });
}

/** DELETE /api/settings/logo - usunięcie logo. */
export async function DELETE() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const prev = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (prev?.presentationLogoUrl?.startsWith("/api/uploads/")) {
    await unlink(path.join(UPLOAD_DIR, prev.presentationLogoUrl.replace("/api/uploads/", ""))).catch(() => {});
  }
  await prisma.settings.update({ where: { id: "singleton" }, data: { presentationLogoUrl: null } });
  return NextResponse.json({ ok: true });
}
