import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { finishActiveSpeaker } from "@/lib/finishActiveSpeaker";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("Not found", { status: 404 });

  await prisma.$transaction(async (tx) => {
    // H1: zamknięcie punktu kończy trwające przemówienie i nalicza jego czas (netto).
    await finishActiveSpeaker(tx, item.meetingId);
    await tx.agendaItem.update({
      where: { id: item.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await tx.meeting.update({
      where: { id: item.meetingId },
      data: { currentAgendaItemId: null },
    });

    // K14: zamknięcie punktu zamyka zapisy do dyskusji na jego liście mówców.
    await tx.speakerList.updateMany({
      where: { agendaItemId: item.id },
      data: { selfSignupEnabled: false },
    });

    // Jeśli zamknięto podpunkt (np. 1.2), sprawdź czy wszystkie podpunkty tego samego
    // punktu nadrzędnego (np. 1) są już zamknięte - jeśli tak, zamknij też punkt nadrzędny.
    if (item.isSubItem && item.number.includes(".")) {
      const parentNumber = item.number.split(".")[0];
      const siblings = await tx.agendaItem.findMany({
        where: { meetingId: item.meetingId, isSubItem: true, number: { startsWith: `${parentNumber}.` } },
      });
      const allDone = siblings.every((s) => s.id === item.id || s.status === "COMPLETED" || s.status === "SKIPPED");
      if (allDone) {
        const parent = await tx.agendaItem.findFirst({
          where: { meetingId: item.meetingId, isSubItem: false, number: parentNumber },
        });
        if (parent && parent.status !== "COMPLETED") {
          await tx.agendaItem.update({
            where: { id: parent.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
      }
    }
  });

  await audit({
    action: "AGENDA_ITEM_COMPLETED",
    description: `Zakończono punkt ${item.number}: ${item.title}`,
    meetingId: item.meetingId,
    userId: session.user.id,
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
