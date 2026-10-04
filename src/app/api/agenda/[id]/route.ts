import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { applyListDefaultToWaiting } from "@/lib/speechLimit";

const patchSchema = z.object({
  // Pusty numer dopuszczalny tylko dla punktu bez numeru (sprawdzane niżej).
  number: z.string().max(20).optional(),
  unnumbered: z.boolean().optional(),
  title: z.string().min(1).max(5000).optional(),
  description: z.string().max(2000).nullable().optional(),
  presenter: z.string().max(200).nullable().optional(),
  committee: z.string().max(300).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  isSubItem: z.boolean().optional(),
  hiddenFromDisplay: z.boolean().optional(),
  /** Planowany limit wypowiedzi w punkcie (s); null = limit z ustawień. */
  speechLimitSec: z.number().int().min(0).max(36000).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("Not found", { status: 404 });

  // Punkt bez numeru: numer czyszczony. Punkt numerowany musi mieć niepusty numer
  // (także przy zmianie z "bez numeru" na numerowany).
  const data = { ...parsed.data };
  const unnumbered = data.unnumbered ?? item.unnumbered;
  if (unnumbered) data.number = "";
  else if ((data.number ?? item.number).trim() === "")
    return new NextResponse("Podaj numer punktu albo zaznacz „bez numeru”.", { status: 400 });

  await prisma.agendaItem.update({ where: { id }, data });

  // Zmiana planowanego limitu: lista mówców punktu (jeśli już istnieje, np. z zapisów do
  // przyszłego punktu) i jej oczekujące wystąpienia dostają nowy limit.
  if (data.speechLimitSec !== undefined && data.speechLimitSec !== item.speechLimitSec) {
    const list = await prisma.speakerList.findUnique({ where: { agendaItemId: id } });
    if (list) {
      await prisma.speakerList.update({ where: { id: list.id }, data: { defaultTimeLimitSec: data.speechLimitSec } });
      await applyListDefaultToWaiting(list.id);
      publishToMeeting(item.meetingId, { type: "speakerlist.updated" });
    }
  }

  await audit({
    action: "AGENDA_ITEM_STARTED",
    description: `Zaktualizowano punkt ${item.number || item.title.slice(0, 60)}`,
    meetingId: item.meetingId, userId: session.user.id,
    metadata: { kind: "updated", changes: parsed.data },
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("Not found", { status: 404 });

  // nie pozwalamy usunąć aktualnie rozpatrywanego punktu
  if (item.status === "CURRENT")
    return new NextResponse("Nie można usunąć punktu, który jest właśnie rozpatrywany", { status: 400 });

  await prisma.$transaction(async (tx) => {
    await tx.agendaItem.delete({ where: { id } });
    // Przesuń pozostałe pozycje w górę, aby nie było luk - pojedynczo i rosnąco. Masowe
    // updateMany(order - 1) łamało unikalny indeks (meetingId, order) w trakcie aktualizacji,
    // przez co usunięcie punktu (innego niż ostatni) kończyło się błędem 500.
    const later = await tx.agendaItem.findMany({
      where: { meetingId: item.meetingId, order: { gt: item.order } },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });
    for (const it of later) {
      await tx.agendaItem.update({ where: { id: it.id }, data: { order: it.order - 1 } });
    }
  });

  await audit({
    action: "AGENDA_ITEM_COMPLETED",
    description: `Usunięto punkt ${item.number}: ${item.title}`,
    meetingId: item.meetingId, userId: session.user.id,
    metadata: { kind: "deleted" },
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
