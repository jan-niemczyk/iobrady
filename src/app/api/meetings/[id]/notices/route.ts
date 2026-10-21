import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { EMPTY_CONTENT } from "@/lib/noticeText";
import { contentFromTemplate, defaultTemplateFor, meetingAgendaForNotice } from "@/lib/notices";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const list = await prisma.notice.findMany({ where: { meetingId: id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, templateName: true, templateVersion: true, updatedAt: true, lastGeneratedAt: true, agendaEdited: true } });
  return NextResponse.json(list);
}

const schema = z.object({ templateId: z.string().max(64).optional().nullable(), name: z.string().trim().max(200).optional() });

/**
 * Nowe zawiadomienie: kopia treści szablonu (wybranego albo domyślnego dla grupy posiedzenia)
 * i kopia porządku obrad. Dalsza edycja nie zmienia szablonu ani porządku posiedzenia.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!meeting) return new NextResponse("Nie znaleziono posiedzenia", { status: 404 });
  const tpl = parsed.data.templateId
    ? await prisma.noticeTemplate.findUnique({ where: { id: parsed.data.templateId } })
    : await defaultTemplateFor(id);
  if (parsed.data.templateId && !tpl) return new NextResponse("Nie znaleziono szablonu", { status: 404 });
  const agenda = await meetingAgendaForNotice(id);
  const n = await prisma.$transaction(async (tx) => {
    const n = await tx.notice.create({
      data: {
        meetingId: id, name: parsed.data.name || `Zawiadomienie - posiedzenie nr ${meeting.number}`,
        templateId: tpl?.id ?? null, templateName: tpl?.name ?? null, templateVersion: tpl?.version ?? null,
        content: (tpl ? contentFromTemplate(tpl.content) : { ...EMPTY_CONTENT, letterDate: new Date().toISOString().slice(0, 10) }) as never,
        agenda: agenda as never, agendaSource: agenda as never, createdById: session.user.id, updatedById: session.user.id,
      },
    });
    await audit({ action: "NOTICE_SAVED", description: `Utworzono zawiadomienie${tpl ? ` z szablonu „${tpl.name}” (wersja ${tpl.version})` : ""}`, meetingId: id, userId: session.user.id, metadata: { noticeId: n.id, templateId: tpl?.id ?? null } }, tx);
    return n;
  });
  return NextResponse.json({ ok: true, id: n.id });
}
