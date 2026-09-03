import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";

/**
 * PATCH /api/messages/[id] - przełącz widoczność komunikatu (hidden/visible).
 * Body: { hidden: boolean }
 *
 * DELETE /api/messages/[id] - usuń komunikat (rzadko używany; preferuj ukrycie).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const hidden = typeof body.hidden === "boolean" ? body.hidden : null;
  if (hidden === null) return new NextResponse("Brakuje pola 'hidden'", { status: 400 });

  const msg = await prisma.message.findUnique({ where: { id } });
  if (!msg) return new NextResponse("Not found", { status: 404 });

  await prisma.message.update({
    where: { id },
    data: { hiddenAt: hidden ? new Date() : null },
  });

  publishToMeeting(msg.meetingId, { type: "message.changed" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const msg = await prisma.message.findUnique({ where: { id } });
  if (!msg) return new NextResponse("Not found", { status: 404 });

  await prisma.message.delete({ where: { id } });
  publishToMeeting(msg.meetingId, { type: "message.changed" });
  return NextResponse.json({ ok: true });
}
