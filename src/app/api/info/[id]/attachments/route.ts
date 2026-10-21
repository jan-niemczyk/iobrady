import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { ALLOWED_ATTACHMENT_MIME, MAX_ATTACHMENT_SIZE, saveAttachmentFile, sniffAttachment } from "@/lib/attachments";

/** POST (multipart) - załącznik komunikatu. Tylko operator; typ rozpoznawany po treści pliku. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const post = await prisma.infoPost.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!post) return new NextResponse("Nie znaleziono", { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return new NextResponse("Brak pliku", { status: 400 });
  if (file.size > MAX_ATTACHMENT_SIZE) return new NextResponse("Plik za duży (max 20 MB)", { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffAttachment(buffer);
  if (!mime || !ALLOWED_ATTACHMENT_MIME[mime] || (file.type && file.type !== mime))
    return new NextResponse("Zawartość pliku nie odpowiada jego typowi. Dozwolone: PDF, DOCX, XLSX, PNG, JPG, WEBP.", { status: 400 });
  const { storedName } = await saveAttachmentFile(buffer, mime);
  const fileName = (file.name || "plik").replace(/[\\/\0]/g, "_").slice(0, 200);
  const a = await prisma.$transaction(async (tx) => {
    const a = await tx.infoAttachment.create({ data: { postId: id, fileName, storedName, mimeType: mime, sizeBytes: buffer.length, uploadedById: session.user.id } });
    await audit({ action: "INFO_POST_CHANGED", description: `Dodano załącznik „${fileName}” do informacji „${post.title}”`, userId: session.user.id, metadata: { postId: id, attachmentId: a.id } }, tx);
    return a;
  });
  return NextResponse.json({ ok: true, id: a.id });
}
