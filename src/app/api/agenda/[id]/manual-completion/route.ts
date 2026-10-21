import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { HttpError } from "@/lib/booth";
import { lockMeetingRow } from "@/lib/meetingLock";

const schema = z.object({ action: z.enum(["mark", "unmark"]) });

/**
 * Ręczne oznaczenie punktu jako zakończonego - dla punktu bez zarejestrowanego przebiegu.
 * Zmienia wyłącznie status: startedAt i completedAt pozostają puste (bez fikcyjnych godzin).
 * Rzeczywisty moment czynności i operator trafiają do dziennika, nie są godziną rozpatrywania.
 * Nie uruchamia punktu, głosowania ani wypowiedzi i nie zmienia pozostałych punktów.
 *
 * Punkt prowadzony (bieżący), z rozpoczętym przebiegiem albo z trwającym głosowaniem lub listą
 * mówców: odmowa z informacją - właściwe jest zwykłe zakończenie, które kończy prowadzoną czynność.
 * „unmark" cofa wyłącznie oznaczenie ręczne (status wraca do „nieotwarty", godziny nadal puste).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const { action } = parsed.data;

  const pre = await prisma.agendaItem.findUnique({ where: { id }, select: { meetingId: true } });
  if (!pre) return new NextResponse("Nie znaleziono punktu", { status: 404 });

  try {
    const item = await prisma.$transaction(async (tx) => {
      await lockMeetingRow(tx, pre.meetingId);
      const item = await tx.agendaItem.findUnique({ where: { id }, include: { meeting: { select: { currentAgendaItemId: true } } } });
      if (!item) throw new HttpError(404, "Nie znaleziono punktu");

      if (action === "mark") {
        if (item.status === "COMPLETED") throw new HttpError(409, "Punkt jest już zakończony.");
        if (item.meeting.currentAgendaItemId === item.id || item.status === "CURRENT")
          throw new HttpError(409, "Punkt jest prowadzony - użyj „Zakończ punkt”, które kończy trwające wystąpienie i zapisuje godzinę zakończenia.");
        if (item.startedAt)
          throw new HttpError(409, "Punkt ma zarejestrowany przebieg (godzinę otwarcia) - użyj zwykłego zakończenia punktu.");
        const openVote = await tx.vote.findFirst({ where: { agendaItemId: id, status: "OPEN" }, select: { number: true } });
        if (openVote) throw new HttpError(409, "W punkcie trwa głosowanie - zamknij je albo anuluj przed zakończeniem punktu.");
        const speaking = await tx.speakerListEntry.findFirst({ where: { list: { agendaItemId: id }, status: "SPEAKING" }, select: { id: true } });
        if (speaking) throw new HttpError(409, "Na liście mówców punktu trwa wystąpienie - zakończ je najpierw.");
        await tx.agendaItem.update({ where: { id }, data: { status: "COMPLETED", manuallyCompleted: true } });
        // Zapisy do dyskusji przy zakończonym punkcie są zamykane (jak przy zwykłym zakończeniu).
        await tx.speakerList.updateMany({ where: { agendaItemId: id }, data: { selfSignupEnabled: false } });
        await audit({
          action: "AGENDA_ITEM_MARKED_COMPLETED",
          description: `Oznaczono ręcznie jako zakończony (bez godzin przebiegu) punkt ${item.unnumbered ? "" : `${item.number}: `}${item.title}`,
          meetingId: item.meetingId, userId: session.user.id,
          metadata: { agendaItemId: id, previousStatus: item.status },
        }, tx);
      } else {
        if (!item.manuallyCompleted || item.status !== "COMPLETED")
          throw new HttpError(409, "Punkt nie jest oznaczony ręcznie jako zakończony.");
        await tx.agendaItem.update({ where: { id }, data: { status: "PENDING", manuallyCompleted: false } });
        await audit({
          action: "AGENDA_ITEM_COMPLETION_REVERTED",
          description: `Cofnięto ręczne oznaczenie zakończenia punktu ${item.unnumbered ? "" : `${item.number}: `}${item.title}`,
          meetingId: item.meetingId, userId: session.user.id,
          metadata: { agendaItemId: id },
        }, tx);
      }
      return item;
    });
    publishToMeeting(item.meetingId, { type: "agenda.changed" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof HttpError) return new NextResponse(e.message, { status: e.status });
    throw e;
  }
}
