import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAutoNumbered, renumberIfAuto } from "@/lib/agendaNumbering";

const schema = z.object({
  direction: z.enum(["up", "down"]).optional(),
  afterId: z.string().optional(), // przenieś TEN punkt tuż za wskazanym punktem (null-owy sens: na początek)
  toStart: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("Not found", { status: 404 });

  // Tryb "przenieś za punktem" / "na początek" - przebudowa kolejności.
  if (parsed.data.afterId !== undefined || parsed.data.toStart) {
    const all = await prisma.agendaItem.findMany({ where: { meetingId: item.meetingId }, orderBy: { order: "asc" } });
    const without = all.filter((a) => a.id !== item.id);
    let insertIdx = 0; // domyślnie na początek
    if (parsed.data.afterId) {
      const idx = without.findIndex((a) => a.id === parsed.data.afterId);
      insertIdx = idx >= 0 ? idx + 1 : without.length;
    }
    const ordered = [...without.slice(0, insertIdx), item, ...without.slice(insertIdx)];
    const wasAuto = isAutoNumbered(all);
    await prisma.$transaction(async (tx) => {
      // najpierw wartości tymczasowe (unikalny constraint), potem docelowe
      for (let i = 0; i < ordered.length; i++) {
        await tx.agendaItem.update({ where: { id: ordered[i].id }, data: { order: -1 * (i + 1) - 1000 } });
      }
      for (let i = 0; i < ordered.length; i++) {
        await tx.agendaItem.update({ where: { id: ordered[i].id }, data: { order: i } });
      }
      await renumberIfAuto(tx, item.meetingId, wasAuto);
    });
    publishToMeeting(item.meetingId, { type: "agenda.changed" });
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.direction) return new NextResponse("Bad request", { status: 400 });

  const neighbor = await prisma.agendaItem.findFirst({
    where: {
      meetingId: item.meetingId,
      order: parsed.data.direction === "up" ? { lt: item.order } : { gt: item.order },
    },
    orderBy: { order: parsed.data.direction === "up" ? "desc" : "asc" },
  });

  if (!neighbor) return NextResponse.json({ ok: true }); // już na krańcu

  const wasAuto = isAutoNumbered(await prisma.agendaItem.findMany({ where: { meetingId: item.meetingId } }));

  // Swap orderów przez tymczasową wartość (żeby ominąć unique constraint na [meetingId, order])
  await prisma.$transaction(async (tx) => {
    // Wartość tymczasowa musi mieścić się w kolumnie Int (32 bity) - wcześniej -Date.now()
    // przekraczało zakres i każde przesunięcie strzałką kończyło się błędem 500.
    const tmp = -1_000_000 - Math.floor(Math.random() * 1_000_000);
    await tx.agendaItem.update({ where: { id: item.id }, data: { order: tmp } });
    await tx.agendaItem.update({ where: { id: neighbor.id }, data: { order: item.order } });
    await tx.agendaItem.update({ where: { id: item.id }, data: { order: neighbor.order } });

    // Renumeracja: gdy porządek był numerowany automatycznie (1, 2, 3…, podpunkty 2.1…), po
    // przesunięciu odświeżamy numery wg nowej kolejności. Numeracji ręcznej (np. "3a") nie ruszamy.
    // Punkty bez numeru są pomijane i nie blokują renumeracji.
    await renumberIfAuto(tx, item.meetingId, wasAuto);
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
