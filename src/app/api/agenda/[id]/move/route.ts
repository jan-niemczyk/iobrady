import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

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
    await prisma.$transaction(async (tx) => {
      // najpierw wartości tymczasowe (unikalny constraint), potem docelowe
      for (let i = 0; i < ordered.length; i++) {
        await tx.agendaItem.update({ where: { id: ordered[i].id }, data: { order: -1 * (i + 1) - 1000 } });
      }
      for (let i = 0; i < ordered.length; i++) {
        await tx.agendaItem.update({ where: { id: ordered[i].id }, data: { order: i } });
      }
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

  // Swap orderów przez tymczasową wartość (żeby ominąć unique constraint na [meetingId, order])
  await prisma.$transaction(async (tx) => {
    const tmp = -1 * (Date.now() + Math.floor(Math.random() * 1000));
    await tx.agendaItem.update({ where: { id: item.id }, data: { order: tmp } });
    await tx.agendaItem.update({ where: { id: neighbor.id }, data: { order: item.order } });
    await tx.agendaItem.update({ where: { id: item.id }, data: { order: neighbor.order } });

    // Renumeracja: jeśli WSZYSTKIE punkty mają numery będące kolejnymi liczbami (1,2,3…),
    // to po przesunięciu odświeżamy numery wg nowej kolejności. Jeśli ktoś używa
    // numeracji niestandardowej (np. "3a", "4b"), NIE ruszamy numerów.
    const all = await tx.agendaItem.findMany({
      where: { meetingId: item.meetingId },
      orderBy: { order: "asc" },
    });
    const allPlainNumeric = all.every((a, idx) => a.number === String(idx + 1));
    // (sprawdzamy względem PRZED zmianą - czyli czy to była czysta sekwencja 1..n)
    const wasSequential = [...all]
      .map((a) => a.number)
      .every((n) => /^\d+$/.test(n));
    if (allPlainNumeric || wasSequential) {
      for (let i = 0; i < all.length; i++) {
        const want = String(i + 1);
        if (all[i].number !== want) {
          await tx.agendaItem.update({ where: { id: all[i].id }, data: { number: want } });
        }
      }
    }
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
