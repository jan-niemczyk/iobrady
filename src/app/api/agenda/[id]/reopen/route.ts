import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

/** POST /api/agenda/[id]/reopen - cofnięcie zakończenia punktu (powrót do stanu "nieotwarty"). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("Not found", { status: 404 });
  if (item.status !== "COMPLETED" && item.status !== "SKIPPED")
    return new NextResponse("Można cofnąć tylko zakończony lub pominięty punkt", { status: 400 });

  await prisma.agendaItem.update({
    where: { id: item.id },
    data: { status: "PENDING", completedAt: null },
  });

  await audit({
    action: "AGENDA_ITEM_STARTED",
    description: `Cofnięto zakończenie punktu ${item.number}: ${item.title}`,
    meetingId: item.meetingId,
    userId: session.user.id,
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
