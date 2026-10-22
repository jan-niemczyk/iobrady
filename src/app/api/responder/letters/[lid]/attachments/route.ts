import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled } from "@/lib/inquiryAccess";
import { myAnswerDraft, requireResponder } from "@/lib/responder";
import { ALLOWED_ATTACHMENT_MIME, MAX_ATTACHMENT_SIZE, saveAttachmentFile, sniffAttachment } from "@/lib/attachments";

/** POST (multipart: file) - plik do własnego szkicu odpowiedzi. */
export async function POST(req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("responder attachment", async () => {
    await requireResponder(session.user);
    await requireModuleEnabled();
    const l = await myAnswerDraft(session.user.id, lid);
    if (l.state !== "DRAFT") throw new HttpError(409, "Odpowiedź została już złożona.");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Brak pliku");
    if (file.size > MAX_ATTACHMENT_SIZE) throw new HttpError(400, "Plik za duży (max 20 MB)");
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = sniffAttachment(buffer);
    if (!mime || !ALLOWED_ATTACHMENT_MIME[mime] || (file.type && file.type !== mime))
      throw new HttpError(400, "Zawartość pliku nie odpowiada jego typowi. Dozwolone: PDF, DOCX, XLSX, PNG, JPG, WEBP.");
    const { storedName } = await saveAttachmentFile(buffer, mime);
    const a = await prisma.inquiryAttachment.create({ data: { letterId: lid, fileName: (file.name || "plik").replace(/[\\/\0]/g, "_").slice(0, 200), storedName, mimeType: mime, sizeBytes: buffer.length, uploadedById: session.user.id } });
    return NextResponse.json({ ok: true, id: a.id });
  });
}
