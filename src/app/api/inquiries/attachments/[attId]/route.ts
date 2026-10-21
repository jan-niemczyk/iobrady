import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { letterForViewer } from "@/lib/inquiryLetterAccess";
import { ATTACHMENTS_DIR, deleteAttachmentFile } from "@/lib/attachments";
import { contentDisposition } from "@/lib/serverPdf";

const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

/** GET - załącznik pisma wewnętrznego (te same reguły co karta sprawy). Publiczne pliki: /api/public/inquiries/... */
export async function GET(req: Request, ctx: { params: Promise<{ attId: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Not found", { status: 404 });
  const { attId } = await ctx.params;
  const a = await prisma.inquiryAttachment.findUnique({ where: { id: attId } });
  if (!a) return new NextResponse("Not found", { status: 404 });
  try { await letterForViewer(a.letterId, session.user); } catch { return new NextResponse("Not found", { status: 404 }); }
  if (a.isPublicVersion && session.user.role !== "OPERATOR") return new NextResponse("Not found", { status: 404 });
  try {
    const buf = await readFile(path.join(ATTACHMENTS_DIR, a.storedName));
    const inline = new URL(req.url).searchParams.get("inline") === "1" && INLINE_TYPES.has(a.mimeType);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": a.mimeType, "Content-Disposition": contentDisposition(a.fileName, inline), "Cache-Control": "private, no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

/** DELETE - operator: dowolny załącznik; autor: załącznik własnego szkicu. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ attId: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { attId } = await ctx.params;
  return guarded("inquiry attachment DELETE", async () => {
    const a = await prisma.inquiryAttachment.findUnique({ where: { id: attId } });
    if (!a) throw new HttpError(404, "Nie znaleziono");
    const { letter: l, isOperator } = await letterForViewer(a.letterId, session.user);
    if (!isOperator && (l.createdById !== session.user.id || l.state !== "DRAFT")) throw new HttpError(409, "Usunąć można załącznik własnego szkicu.");
    await prisma.$transaction(async (tx) => {
      await tx.inquiryAttachment.delete({ where: { id: attId } });
      await audit({ action: "INQUIRY_CHANGED", description: `Usunięto załącznik „${a.fileName}” - sprawa „${l.case.title}”`, userId: session.user.id, metadata: { caseId: l.caseId, letterId: l.id } }, tx);
    });
    await deleteAttachmentFile(a.storedName);
    return NextResponse.json({ ok: true });
  });
}
