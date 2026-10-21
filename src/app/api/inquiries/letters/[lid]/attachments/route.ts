import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled, requireSubmitRight } from "@/lib/inquiryAccess";
import { letterForViewer } from "@/lib/inquiryLetterAccess";
import { ALLOWED_ATTACHMENT_MIME, MAX_ATTACHMENT_SIZE, saveAttachmentFile, sniffAttachment } from "@/lib/attachments";

/**
 * POST (multipart: file, public=1) - załącznik pisma. Operator: do każdego pisma; `public=1` oznacza
 * plik wersji publicznej (np. zanonimizowany), który zastępuje oryginał w rejestrze publicznym.
 * Autor: tylko do własnego szkicu (z prawem składania).
 */
export async function POST(req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("inquiry attachment POST", async () => {
    const { letter: l, isOperator } = await letterForViewer(lid, session.user);
    if (isOperator) await requireModuleEnabled();
    else {
      if (l.createdById !== session.user.id || l.state !== "DRAFT") throw new HttpError(409, "Załączniki dodaje się do własnego szkicu pisma.");
      await requireSubmitRight(session.user.id, l.case.orgUnitId);
    }
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Brak pliku");
    if (file.size > MAX_ATTACHMENT_SIZE) throw new HttpError(400, "Plik za duży (max 20 MB)");
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = sniffAttachment(buffer);
    if (!mime || !ALLOWED_ATTACHMENT_MIME[mime] || (file.type && file.type !== mime))
      throw new HttpError(400, "Zawartość pliku nie odpowiada jego typowi. Dozwolone: PDF, DOCX, XLSX, PNG, JPG, WEBP.");
    const isPublicVersion = isOperator && form?.get("public") === "1";
    const { storedName } = await saveAttachmentFile(buffer, mime);
    const fileName = (file.name || "plik").replace(/[\\/\0]/g, "_").slice(0, 200);
    const a = await prisma.$transaction(async (tx) => {
      const a = await tx.inquiryAttachment.create({ data: { letterId: lid, fileName, storedName, mimeType: mime, sizeBytes: buffer.length, isPublicVersion, uploadedById: session.user.id } });
      await audit({ action: "INQUIRY_CHANGED", description: `Dodano ${isPublicVersion ? "plik wersji publicznej" : "załącznik"} „${fileName}” - sprawa „${l.case.title}”`, userId: session.user.id, metadata: { caseId: l.caseId, letterId: lid, attachmentId: a.id } }, tx);
      return a;
    });
    return NextResponse.json({ ok: true, id: a.id });
  });
}
