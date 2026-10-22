import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { ATTACHMENTS_DIR, deleteAttachmentFile } from "@/lib/attachments";
import { contentDisposition } from "@/lib/serverPdf";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { myAnswerDraft, requireResponder, responderCase } from "@/lib/responder";

/** GET - plik pisma widocznego dla odpowiadającego (te same reguły co karta sprawy). */
export async function GET(_req: Request, ctx: { params: Promise<{ attId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "RESPONDER") return new NextResponse("Not found", { status: 404 });
  const { attId } = await ctx.params;
  const a = await prisma.inquiryAttachment.findUnique({ where: { id: attId }, include: { letter: { select: { caseId: true } } } });
  if (!a) return new NextResponse("Not found", { status: 404 });
  try {
    const c = await responderCase(session.user.id, a.letter.caseId);
    if (!c.letters.some((l) => l.attachments.some((x) => x.id === attId))) return new NextResponse("Not found", { status: 404 });
    const buf = await readFile(path.join(ATTACHMENTS_DIR, a.storedName));
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": a.mimeType, "Content-Disposition": contentDisposition(a.fileName), "Cache-Control": "private, no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

/** DELETE - plik własnego szkicu odpowiedzi. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ attId: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { attId } = await ctx.params;
  return guarded("responder attachment DELETE", async () => {
    await requireResponder(session.user);
    const a = await prisma.inquiryAttachment.findUnique({ where: { id: attId } });
    if (!a) throw new HttpError(404, "Nie znaleziono");
    const l = await myAnswerDraft(session.user.id, a.letterId);
    if (l.state !== "DRAFT") throw new HttpError(409, "Odpowiedź została już złożona.");
    await prisma.inquiryAttachment.delete({ where: { id: attId } });
    await deleteAttachmentFile(a.storedName);
    return NextResponse.json({ ok: true });
  });
}
