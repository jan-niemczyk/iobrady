import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { deleteAttachmentFile } from "@/lib/attachments";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  visibleToParticipants: z.boolean().optional(),
  visibleToPublic: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  const attachment = await prisma.attachment.update({ where: { id }, data: parsed.data }).catch(() => null);
  if (!attachment) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  await deleteAttachmentFile(attachment.storedName);
  await prisma.attachment.delete({ where: { id } });

  await audit({
    action: "ATTACHMENT_DELETED",
    description: `Usunięto materiał "${attachment.fileName}"`,
    meetingId: attachment.meetingId, userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
