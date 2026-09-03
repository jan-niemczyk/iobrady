import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  /** opcjonalne - operator może zapisać innego uczestnika; bez tego = zapisuje siebie */
  userId: z.string().optional(),
  /** opcjonalne - operator może zapisać gościa z katalogu (bez konta) */
  guestId: z.string().optional(),
  /** indywidualny limit - jeśli pominięty, użyje defaultTimeLimitSec listy */
  timeLimitSec: z.number().int().min(0).nullable().optional(),
  /** typ zgłoszenia: REGULAR (default) / FORMAL_MOTION / AD_VOCEM */
  entryType: z.enum(["REGULAR", "FORMAL_MOTION", "AD_VOCEM"]).optional().default("REGULAR"),
  /** zgłoszenie z priorytetem - dozwolone tylko dla osób z prawem (hasPriorityRight) */
  priority: z.boolean().optional().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await handlePost(req, ctx);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Błąd serwera podczas zapisu do listy.";
    return new NextResponse(msg, { status: 500 });
  }
}

async function handlePost(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id: listId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const list = await prisma.speakerList.findUnique({ where: { id: listId } });
  if (!list) return new NextResponse("Not found", { status: 404 });

  // ── GOŚĆ (bez konta) - tylko operator ──────────────────────────────
  if (parsed.data.guestId) {
    if (session.user.role !== "OPERATOR")
      return new NextResponse("Tylko operator może dodać gościa", { status: 403 });
    const guest = await prisma.guest.findUnique({ where: { id: parsed.data.guestId } });
    if (!guest) return new NextResponse("Nie znaleziono gościa", { status: 404 });

    const typeOrderBase = parsed.data.entryType === "FORMAL_MOTION" ? -2000
      : parsed.data.entryType === "AD_VOCEM" ? -1000 : 0;
    const lastInType = await prisma.speakerListEntry.findFirst({
      where: { speakerListId: listId, entryType: parsed.data.entryType },
      orderBy: { order: "desc" },
    });
    const nextOrder = lastInType ? lastInType.order + 1 : typeOrderBase + 1;

    const entry = await prisma.speakerListEntry.create({
      data: {
        speakerListId: listId,
        guestId: guest.id,
        speakerName: `${guest.firstName} ${guest.lastName}`,
        speakerClubShort: guest.clubShort ?? null,
        speakerRole: guest.role ?? null,
        order: nextOrder,
        entryType: parsed.data.entryType,
        timeLimitSec: parsed.data.timeLimitSec ?? list.defaultTimeLimitSec ?? null,
        status: "WAITING",
      },
    });
    publishToMeeting(list.meetingId, { type: "speakerlist.updated" });
    return NextResponse.json({ ok: true, entryId: entry.id });
  }

  // ── UCZESTNIK Z KONTEM ─────────────────────────────────────────────
  let targetUserId: string;
  if (session.user.role === "OPERATOR") {
    targetUserId = parsed.data.userId ?? session.user.id;
  } else {
    if (!list.selfSignupEnabled)
      return new NextResponse("Samodzielne zapisy nie są włączone", { status: 403 });
    // Sprawdź, czy dany typ zgłoszenia jest w ogóle dozwolony
    const t = parsed.data.entryType;
    if (t === "REGULAR" && !list.allowRegular)
      return new NextResponse("Zgłoszenia do dyskusji są wyłączone", { status: 403 });
    if (t === "AD_VOCEM" && !list.allowAdVocem)
      return new NextResponse("Zgłoszenia ad vocem są wyłączone", { status: 403 });
    if (t === "FORMAL_MOTION" && !list.allowFormalMotion)
      return new NextResponse("Zgłoszenia wniosku formalnego są wyłączone", { status: 403 });
    targetUserId = session.user.id;
  }

  // sprawdź czy uczestnik posiedzenia
  const mp = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId: list.meetingId, userId: targetUserId } },
  });
  if (!mp) return new NextResponse("Nie jest uczestnikiem tego posiedzenia", { status: 400 });
  // Wykluczeni z posiedzenia nie mogą się zgłaszać (punkt 34)
  if (mp.excludedFromMeeting)
    return new NextResponse("Uczestnik został wykluczony z posiedzenia", { status: 403 });
  // Nieobecni tracą funkcje - radny sam nie zapisze się będąc nieobecnym (operator w imieniu może).
  if (session.user.role !== "OPERATOR") {
    const att = await prisma.attendance.findUnique({ where: { participantId: mp.id } });
    if (att?.status !== "PRESENT")
      return new NextResponse("Musisz być obecny, aby zapisać się do dyskusji", { status: 403 });
  }

  if (session.user.role !== "OPERATOR") {
    const existing = await prisma.speakerListEntry.findFirst({
      where: {
        speakerListId: listId,
        userId: targetUserId,
        entryType: parsed.data.entryType,
        status: { in: ["WAITING", "SPEAKING"] },
      },
    });
    if (existing) return new NextResponse("Już oczekujesz na zabranie głosu w tej kategorii", { status: 400 });
  }

  // Priorytet zgłoszeń: FORMAL_MOTION (najwyższy) > AD_VOCEM > REGULAR.
  const typeOrderBase = parsed.data.entryType === "FORMAL_MOTION" ? -2000
    : parsed.data.entryType === "AD_VOCEM" ? -1000 : 0;

  // Zgłoszenie z priorytetem: radny tylko gdy ma to prawo (globalnie lub w tym punkcie);
  // operator może nadać priorytet dowolnej osobie (jego decyzja porządkowa).
  const ids = (mp as { priorityAgendaItemIds?: string[] }).priorityAgendaItemIds ?? [];
  const scopeGlobal = ids.length === 0 && mp.priorityAgendaItemId == null;
  const scopeMatches = scopeGlobal
    || (mp.priorityAgendaItemId != null && mp.priorityAgendaItemId === list.agendaItemId)
    || (list.agendaItemId != null && ids.includes(list.agendaItemId));
  const priorityAppliesHere = mp.hasPriorityRight && scopeMatches;
  const wantsPriority = parsed.data.priority && (session.user.role === "OPERATOR" || priorityAppliesHere);
  let nextOrder: number;
  if (wantsPriority) {
    // Wstaw na koniec grupy priorytetowej (między wnioskami formalnymi a ad vocem).
    const lastPriority = await prisma.speakerListEntry.findFirst({
      where: { speakerListId: listId, priority: true, entryType: "REGULAR" },
      orderBy: { order: "desc" },
    });
    nextOrder = lastPriority ? lastPriority.order + 1 : -1500;
  } else {
    const lastInType = await prisma.speakerListEntry.findFirst({
      where: { speakerListId: listId, entryType: parsed.data.entryType, priority: false },
      orderBy: { order: "desc" },
    });
    nextOrder = lastInType ? lastInType.order + 1 : typeOrderBase + 1;
  }

  // Snapshot personaliów w chwili zgłoszenia (punkt 21 - klub zamrożony)
  const u = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { group: true },
  });

  // Domyślny limit wg typu wpisu z ustawień globalnych (można nadpisać per wpis / listę).
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const globalLimit = parsed.data.entryType === "FORMAL_MOTION" ? settings?.defaultFormalMotionLimitSec
    : parsed.data.entryType === "AD_VOCEM" ? settings?.defaultAdVocemLimitSec
    : settings?.defaultSpeechLimitSec;
  const effectiveLimit = parsed.data.timeLimitSec ?? list.defaultTimeLimitSec ?? globalLimit ?? null;

  const entry = await prisma.speakerListEntry.create({
    data: {
      speakerListId: listId,
      userId: targetUserId,
      speakerName: u ? `${u.firstName} ${u.lastName}` : null,
      speakerClubShort: u?.group?.shortName ?? null,
      speakerRole: u?.functionTitle ?? null,
      order: nextOrder,
      entryType: parsed.data.entryType,
      priority: wantsPriority,
      timeLimitSec: effectiveLimit,
      status: "WAITING",
    },
  }).catch((e: unknown) => {
    throw new Error(`Nie udało się zapisać do listy: ${e instanceof Error ? e.message : "błąd bazy"}`);
  });

  publishToMeeting(list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true, entryId: entry.id });
}

// Wypisanie się z listy: DELETE ?mine=1 usuwa oczekujący wpis bieżącego użytkownika.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id: listId } = await ctx.params;
  const list = await prisma.speakerList.findUnique({ where: { id: listId } });
  if (!list) return new NextResponse("Not found", { status: 404 });

  const entry = await prisma.speakerListEntry.findFirst({
    where: { speakerListId: listId, userId: session.user.id, status: "WAITING" },
  });
  if (!entry) return new NextResponse("Brak Twojego oczekującego wpisu.", { status: 404 });

  await prisma.speakerListEntry.delete({ where: { id: entry.id } });
  publishToMeeting(list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}
