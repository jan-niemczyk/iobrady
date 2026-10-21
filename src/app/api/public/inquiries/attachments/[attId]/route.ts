import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { ATTACHMENTS_DIR } from "@/lib/attachments";
import { contentDisposition } from "@/lib/serverPdf";
import { publicArchiveEnabled } from "@/lib/inquiryPublic";

const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

/** GET - plik wersji publicznej opublikowanego pisma opublikowanej sprawy. Inne pliki: 404. */
export async function GET(req: Request, ctx: { params: Promise<{ attId: string }> }) {
  const { attId } = await ctx.params;
  if (!(await publicArchiveEnabled())) return new NextResponse("Not found", { status: 404 });
  const a = await prisma.inquiryAttachment.findFirst({
    where: { id: attId, isPublicVersion: true, letter: { published: true, state: "FINAL", case: { published: true } } },
  });
  if (!a) return new NextResponse("Not found", { status: 404 });
  try {
    const buf = await readFile(path.join(ATTACHMENTS_DIR, a.storedName));
    const inline = new URL(req.url).searchParams.get("inline") === "1" && INLINE_TYPES.has(a.mimeType);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": a.mimeType, "Content-Disposition": contentDisposition(a.fileName, inline), "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
