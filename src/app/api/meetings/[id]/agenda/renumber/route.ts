import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

/**
 * POST /api/meetings/[id]/agenda/renumber
 * Nadaje punktom kolejne numery wg aktualnej kolejności (order).
 * Zwykłe punkty: 1, 2, 3… Podpunkty: litera pod ostatnim zwykłym punktem (3a, 3b…).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const items = await prisma.agendaItem.findMany({
    where: { meetingId },
    orderBy: { order: "asc" },
  });

  let mainNumber = 0;
  let subNumber = 0;
  const updates: { id: string; number: string }[] = [];
  for (const it of items) {
    // Punkty bez numeru (unnumbered) są pomijane - nie otrzymują numeru i nie zmieniają licznika.
    if ((it as { unnumbered?: boolean }).unnumbered) {
      if (it.number !== "") updates.push({ id: it.id, number: "" });
      continue;
    }
    let newNumber: string;
    if (it.isSubItem && mainNumber > 0) {
      // podpunkt: 1.1, 1.2… pod ostatnim zwykłym punktem
      subNumber++;
      newNumber = `${mainNumber}.${subNumber}`;
    } else {
      // zwykły punkt: kolejna liczba, zeruje licznik podpunktów
      mainNumber++;
      subNumber = 0;
      newNumber = String(mainNumber);
    }
    if (newNumber !== it.number) updates.push({ id: it.id, number: newNumber });
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.agendaItem.update({ where: { id: u.id }, data: { number: u.number } })),
    );
  }

  await audit({
    action: "AGENDA_ITEM_STARTED",
    description: `Przenumerowano porządek obrad (${updates.length} zmian)`,
    meetingId, userId: session.user.id,
  });
  publishToMeeting(meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true, changed: updates.length });
}
