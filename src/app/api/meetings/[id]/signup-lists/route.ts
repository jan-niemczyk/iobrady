import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Zwraca listy mówców punktów porządku, do których bieżący uczestnik może się sam zapisać
 * (operator włączył „Zapisy uczestników"). Obejmuje także punkty jeszcze nierozpoczęte.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;

  const mp = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId: session.user.id } },
  });
  if (!mp) return new NextResponse("Nie jest uczestnikiem", { status: 403 });
  // Wykluczony z posiedzenia nie może się zapisywać.
  if (mp.excludedFromMeeting) return NextResponse.json({ lists: [] });

  const lists = await prisma.speakerList.findMany({
    where: {
      meetingId,
      kind: "DISCUSSION",
      selfSignupEnabled: true,
      visibleToParticipants: true,
      agendaItemId: { not: null },
    },
    include: {
      agendaItem: true,
      entries: { where: { status: { in: ["WAITING", "SPEAKING"] } }, select: { userId: true } },
    },
  });

  return NextResponse.json({
    lists: lists
      // D1/D2: zapisy tylko do punktów jeszcze nierozpoczętych. Bieżący i zakończone znikają.
      .filter((l) => l.agendaItem && !l.agendaItem.hiddenFromDisplay && l.agendaItem.status === "PENDING")
      .map((l) => ({
        listId: l.id,
        agendaNumber: l.agendaItem!.number,
        agendaTitle: l.agendaItem!.title,
        agendaStatus: l.agendaItem!.status,
        allowRegular: l.allowRegular,
        mySignedUp: l.entries.some((e) => e.userId === session.user.id),
        waitingCount: l.entries.length,
      }))
      .sort((a, b) => a.agendaNumber.localeCompare(b.agendaNumber, "pl", { numeric: true })),
  });
}
