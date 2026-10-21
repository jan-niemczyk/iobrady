import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { normalizeAgenda, normalizeContent, normalizeRecipients } from "@/lib/noticeText";
import { agendaDiff, meetingAgendaForNotice, noticeValues } from "@/lib/notices";
import { unresolvedIn } from "@/lib/noticeDocx";

/** Zawiadomienie z porównaniem porządku z bieżącym porządkiem posiedzenia i listą nierozwiązanych znaczników. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const n = await prisma.notice.findUnique({ where: { id }, include: { meeting: { select: { id: true, number: true, name: true, scheduledAt: true, location: true } } } });
  if (!n) return new NextResponse("Nie znaleziono zawiadomienia", { status: 404 });
  const content = normalizeContent(n.content);
  const agenda = normalizeAgenda(n.agenda);
  const current = await meetingAgendaForNotice(n.meetingId);
  const values = await noticeValues(n.meetingId, content);
  return NextResponse.json({
    ...n, content, agenda, recipients: normalizeRecipients(n.recipients),
    meetingAgenda: current,
    meetingAgendaChanged: !agendaDiff(normalizeAgenda(n.agendaSource), current).same,
    diff: agendaDiff(agenda, current),
    values,
    unresolved: unresolvedIn(content, agenda, { ...values, adresat: "x", zwrot: "x" }),
  });
}

const schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  content: z.record(z.unknown()).optional(),
  agenda: z.array(z.unknown()).max(500).optional(),
  recipients: z.array(z.unknown()).max(1000).optional(),
});

/** Zapis wersji roboczej. Porządek posiedzenia i szablon pozostają bez zmian. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const n = await prisma.notice.findUnique({ where: { id }, select: { meetingId: true, agendaSource: true } });
  if (!n) return new NextResponse("Nie znaleziono zawiadomienia", { status: 404 });
  const d = parsed.data;
  const agenda = d.agenda ? normalizeAgenda(d.agenda) : undefined;
  await prisma.$transaction(async (tx) => {
    await tx.notice.update({
      where: { id },
      data: {
        ...(d.name ? { name: d.name } : {}),
        ...(d.content ? { content: normalizeContent(d.content) as never } : {}),
        ...(agenda ? { agenda: agenda as never, agendaEdited: !agendaDiff(agenda, normalizeAgenda(n.agendaSource)).same } : {}),
        ...(d.recipients ? { recipients: normalizeRecipients(d.recipients) as never } : {}),
        updatedById: session.user.id,
      },
    });
    await audit({ action: "NOTICE_SAVED", description: "Zapisano wersję roboczą zawiadomienia", meetingId: n.meetingId, userId: session.user.id, metadata: { noticeId: id, fields: Object.keys(d) } }, tx);
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const n = await prisma.notice.findUnique({ where: { id }, select: { meetingId: true, name: true } });
  if (!n) return new NextResponse("Nie znaleziono zawiadomienia", { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.notice.delete({ where: { id } });
    await audit({ action: "NOTICE_SAVED", description: `Usunięto zawiadomienie „${n.name}”`, meetingId: n.meetingId, userId: session.user.id, metadata: { noticeId: id } }, tx);
  });
  return NextResponse.json({ ok: true });
}
