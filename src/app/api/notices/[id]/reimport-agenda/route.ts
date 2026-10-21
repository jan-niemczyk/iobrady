import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { meetingAgendaForNotice } from "@/lib/notices";

const schema = z.object({ confirmOverwrite: z.boolean().optional() });

/**
 * Świadome ponowne pobranie porządku z posiedzenia. Jeśli porządek zawiadomienia był edytowany,
 * wymaga potwierdzenia (confirmOverwrite) - ręczne zmiany nie giną bez ostrzeżenia.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const n = await prisma.notice.findUnique({ where: { id }, select: { meetingId: true, agendaEdited: true } });
  if (!n) return new NextResponse("Nie znaleziono zawiadomienia", { status: 404 });
  if (n.agendaEdited && !(parsed.success && parsed.data.confirmOverwrite))
    return new NextResponse("Porządek w zawiadomieniu był zmieniany ręcznie - potwierdź zastąpienie zmian.", { status: 409 });
  const agenda = await meetingAgendaForNotice(n.meetingId);
  await prisma.$transaction(async (tx) => {
    await tx.notice.update({ where: { id }, data: { agenda: agenda as never, agendaSource: agenda as never, agendaEdited: false, updatedById: session.user.id } });
    await audit({ action: "NOTICE_SAVED", description: "Pobrano ponownie porządek obrad z posiedzenia do zawiadomienia", meetingId: n.meetingId, userId: session.user.id, metadata: { noticeId: id, overwroteEdits: n.agendaEdited } }, tx);
  });
  return NextResponse.json({ ok: true });
}
