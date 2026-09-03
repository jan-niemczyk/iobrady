import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  svg: "image/svg+xml", webp: "image/webp",
};

/** Serwuje wgrane pliki (logo) z wolumenu - niezależnie od statycznego serwera Next. */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  // ochrona przed path traversal
  if (!/^[A-Za-z0-9._-]+$/.test(file)) return new NextResponse("Bad name", { status: 400 });
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) return new NextResponse("Unsupported", { status: 400 });
  try {
    const buf = await readFile(path.join(UPLOAD_DIR, file));
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
