import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { audit } from "@/lib/audit";
import { ATTACHMENTS_DIR, deleteAttachmentFile } from "@/lib/attachments";
import { canViewPost } from "@/lib/info";
import { contentDisposition } from "@/lib/serverPdf";

const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

/**
 * GET - pobranie załącznika komunikatu. Ta sama reguła co dla treści: operator zawsze, radny
 * tylko przy bieżącym dostępie do komunikatu (po odebraniu dostępu bezpośredni adres daje 404).
 */
export async function GET(req: Request, ctx: { params: Promise<{ attId: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Not found", { status: 404 });
  const { attId } = await ctx.params;
  const a = await prisma.infoAttachment.findUnique({ where: { id: attId } });
  if (!a || !(await canViewPost(session.user, a.postId))) return new NextResponse("Not found", { status: 404 });
  const inline = new URL(req.url).searchParams.get("inline") === "1" && INLINE_TYPES.has(a.mimeType);
  try {
    const buf = await readFile(path.join(ATTACHMENTS_DIR, a.storedName));
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": a.mimeType, "Content-Disposition": contentDisposition(a.fileName, inline), "Cache-Control": "private, no-store" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ attId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { attId } = await ctx.params;
  const a = await prisma.infoAttachment.findUnique({ where: { id: attId }, include: { post: { select: { title: true } } } });
  if (!a) return new NextResponse("Not found", { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.infoAttachment.delete({ where: { id: attId } });
    await audit({ action: "INFO_POST_CHANGED", description: `Usunięto załącznik „${a.fileName}” z informacji „${a.post.title}”`, userId: session.user.id, metadata: { postId: a.postId, attachmentId: attId } }, tx);
  });
  await deleteAttachmentFile(a.storedName);
  return NextResponse.json({ ok: true });
}
