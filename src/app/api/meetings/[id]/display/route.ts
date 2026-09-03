import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * PATCH /api/meetings/[id]/display
 *
 * Operator steruje treścią widoku prezentacyjnego (ekran sali).
 *
 * displayMode = "AUTO"            - widok automatyczny (follow current state)
 *             = "DEFAULT"         - pokaż ekran domyślny (nazwa posiedzenia)
 *             = "PINNED_AGENDA"   - wyświetl konkretny punkt agendy (displayPinnedAgendaItemId)
 *             = "PINNED_VOTE"     - wyświetl wyniki konkretnego głosowania (displayPinnedVoteId)
 *             = "MESSAGE"         - wyświetl tekst (displayCustomMessage)
 *             = "BLANK"           - pusty ekran (np. przerwa)
 *             = "SPEAKER_LIST"    - wyświetl listę mówców aktualnego punktu
 */
const schema = z.object({
  displayMode: z.enum([
    "AUTO", "DEFAULT", "PINNED_AGENDA", "PINNED_VOTE", "MESSAGE", "BREAK", "BLANK", "SPEAKER_LIST", "FORMAL_MOTIONS", "ATTENDANCE", "AGENDA_LIST",
  ]).optional(),
  displayPinnedVoteId: z.string().nullable().optional(),
  displayPinnedAgendaItemId: z.string().nullable().optional(),
  displayCustomMessage: z.string().nullable().optional(),
  // Przerwa z licznikiem: ISO datetime wznowienia lub null
  breakUntil: z.string().datetime().nullable().optional(),
  displayMessageOnOverlay: z.boolean().optional(),
  displayMessageObsStyle: z.boolean().optional(),
  displayShowCastCount: z.boolean().optional(),
  displayShowByName: z.boolean().optional(),
  displayShowIndividualVotes: z.boolean().optional(),
  /** Sterowanie wynikami listy kandydatów na prezentacji */
  displayCandidatePage: z.number().int().min(0).optional(),
  displayCandidateSort: z.enum(["VOTES", "ALPHA"]).optional(),
  /** Tryb „pokaż PIN": id głosowania (lub null, by wyłączyć) */
  displayPinVoteId: z.string().nullable().optional(),
  /** Zdejmij konkretne głosowanie z widoku automatycznego */
  dismissLastVoteId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  const data: Record<string, unknown> = { displayUpdatedAt: new Date() };
  for (const k of ["displayMode", "displayPinnedVoteId", "displayPinnedAgendaItemId", "displayCustomMessage", "displayMessageOnOverlay", "displayMessageObsStyle", "displayShowCastCount", "displayShowByName", "displayShowIndividualVotes", "displayCandidatePage", "displayCandidateSort", "displayPinVoteId"] as const) {
    if (parsed.data[k] !== undefined) data[k] = parsed.data[k];
  }
  if (parsed.data.breakUntil !== undefined) {
    data.breakUntil = parsed.data.breakUntil ? new Date(parsed.data.breakUntil) : null;
  }
  if (parsed.data.dismissLastVoteId !== undefined) {
    // dodajemy ID do listy ukrytych (jeśli null - resetujemy listę)
    if (parsed.data.dismissLastVoteId === null) {
      data.displayDismissedVoteIds = [];
    } else {
      const current = await prisma.meeting.findUnique({
        where: { id }, select: { displayDismissedVoteIds: true },
      });
      const set = new Set(current?.displayDismissedVoteIds ?? []);
      set.add(parsed.data.dismissLastVoteId);
      data.displayDismissedVoteIds = Array.from(set);
    }
  }

  // Powrót do trybu AUTO: chowamy głosowanie, które właśnie było na ekranie - niezależnie od tego,
  // czy było przypięte ręcznie, czy pokazane automatycznie jako "ostatnie zamknięte".
  if (parsed.data.displayMode === "AUTO") {
    const current = await prisma.meeting.findUnique({
      where: { id },
      select: { displayDismissedVoteIds: true, displayPinnedVoteId: true },
    });
    const set = new Set(current?.displayDismissedVoteIds ?? []);
    // 1) ręcznie przypięte głosowanie
    if (current?.displayPinnedVoteId) set.add(current.displayPinnedVoteId);
    // 2) automatycznie pokazywane ostatnie zamknięte głosowanie (jeszcze nieukryte)
    const lastClosed = await prisma.vote.findFirst({
      where: { meetingId: id, status: "CLOSED", id: { notIn: Array.from(set) } },
      orderBy: { closedAt: "desc" },
      select: { id: true },
    });
    if (lastClosed) set.add(lastClosed.id);
    data.displayDismissedVoteIds = Array.from(set);
    data.displayPinnedVoteId = null;
    data.displayPinnedAgendaItemId = null;
  }

  const m = await prisma.meeting.update({
    where: { id },
    data,
    select: {
      displayMode: true, displayPinnedVoteId: true, displayPinnedAgendaItemId: true,
      displayCustomMessage: true, displayShowCastCount: true,
    },
  });

  publishToMeeting(id, { type: "display.changed" });
  return NextResponse.json({ ok: true, display: m });
}
