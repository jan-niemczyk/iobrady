import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled } from "@/lib/inquiryAccess";
import { myAnswerDraft, requireResponder } from "@/lib/responder";
import { deleteAttachmentFile } from "@/lib/attachments";

const schema = z.object({ title: z.string().trim().max(500).nullable().optional(), body: z.string().max(200_000).optional() });

/** PATCH - edycja własnego szkicu odpowiedzi. */
export async function PATCH(req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("responder letter PATCH", async () => {
    await requireResponder(session.user);
    await requireModuleEnabled();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const l = await myAnswerDraft(session.user.id, lid);
    if (l.state !== "DRAFT") throw new HttpError(409, "Odpowiedź została już złożona.");
    await prisma.inquiryLetter.update({ where: { id: lid }, data: { ...(parsed.data.title !== undefined ? { title: parsed.data.title || null } : {}), ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}) } });
    return NextResponse.json({ ok: true });
  });
}

/** DELETE - usunięcie własnego szkicu odpowiedzi. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ lid: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { lid } = await ctx.params;
  return guarded("responder letter DELETE", async () => {
    await requireResponder(session.user);
    const l = await myAnswerDraft(session.user.id, lid);
    if (l.state !== "DRAFT") throw new HttpError(409, "Złożonej odpowiedzi nie można usunąć.");
    const files = await prisma.inquiryAttachment.findMany({ where: { letterId: lid }, select: { storedName: true } });
    await prisma.inquiryLetter.delete({ where: { id: lid } });
    for (const f of files) await deleteAttachmentFile(f.storedName);
    return NextResponse.json({ ok: true });
  });
}
