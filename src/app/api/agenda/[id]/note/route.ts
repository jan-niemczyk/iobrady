import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { getMeetingParticipant } from "@/lib/participantAccess";

/** IA-09: notatka tylko przy punkcie posiedzenia, w którym osoba jest uczestnikiem (operator - każdym). */
async function canNote(session: { user: { id: string; role: string } }, agendaItemId: string) {
  const item = await prisma.agendaItem.findUnique({ where: { id: agendaItemId }, select: { meetingId: true } });
  if (!item) return false;
  if (session.user.role === "OPERATOR") return true;
  return !!(await getMeetingParticipant(session.user.id, item.meetingId));
}

/** Prywatna notatka radnego do punktu porządku - zawsze scoped do session.user.id, nigdy do
 * parametru z requestu, żeby nie dało się odczytać/nadpisać cudzej notatki. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id: agendaItemId } = await ctx.params;
  if (!(await canNote(session, agendaItemId))) return new NextResponse("Not found", { status: 404 });

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
  if (!parsed.success) return validationError(parsed.error);
  if (!(await canNote(session, agendaItemId))) return new NextResponse("Not found", { status: 404 });

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
