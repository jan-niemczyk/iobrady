import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

/** Prywatna notatka radnego do punktu porządku - zawsze scoped do session.user.id, nigdy do
 * parametru z requestu, żeby nie dało się odczytać/nadpisać cudzej notatki. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id: agendaItemId } = await ctx.params;

  const note = await prisma.agendaItemNote.findUnique({
    where: { agendaItemId_userId: { agendaItemId, userId: session.user.id } },
  });
  return NextResponse.json({ content: note?.content ?? "" });
}

const schema = z.object({ content: z.string().max(5000) });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id: agendaItemId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  if (parsed.data.content.trim() === "") {
    await prisma.agendaItemNote.deleteMany({ where: { agendaItemId, userId: session.user.id } });
    return NextResponse.json({ ok: true });
  }

  await prisma.agendaItemNote.upsert({
    where: { agendaItemId_userId: { agendaItemId, userId: session.user.id } },
    create: { agendaItemId, userId: session.user.id, content: parsed.data.content },
    update: { content: parsed.data.content },
  });
  return NextResponse.json({ ok: true });
}
