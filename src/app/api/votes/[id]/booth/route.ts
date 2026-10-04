import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { HttpError, boothIneligibility, loadBoothState, lockVoteRow } from "@/lib/booth";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Tryb kotarkowy - zarządzanie kabiną (tylko operator).
 *
 * GET  -> stan kabiny: kto ma udostępnioną kartę, kto już oddał głos (bez treści głosów).
 * POST { action: "grant" | "revoke", userId }
 *   grant  - udostępnij kartę osobie, która weszła za kotarkę (kabina musi być wolna),
 *   revoke - cofnij udostępnienie (tylko zanim głos zostanie przyjęty).
 *
 * Każda zmiana blokuje wiersz głosowania, więc równoczesne działania kilku operatorów oraz
 * konflikt "cofnięcie vs wysłanie głosu" rozstrzygają się jednoznacznie (kto pierwszy zajmie blokadę).
 */

async function requireOperator() {
  const session = await auth();
  if (!session) return { error: new NextResponse("Unauthorized", { status: 401 }) };
  if (session.user.role !== "OPERATOR") return { error: new NextResponse("Tylko operator może zarządzać kabiną.", { status: 403 }) };
  return { session };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireOperator();
  if (error) return error;
  const { id } = await ctx.params;
  const state = await loadBoothState(prisma, id);
  if (!state) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(state);
}

const schema = z.object({
  action: z.enum(["grant", "revoke"]),
  userId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireOperator();
  if (error) return error;
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const { action, userId } = parsed.data;

  let meetingId = "";
  let personName = "";
  let changed = false;
  try {
    await prisma.$transaction(async (tx) => {
      await lockVoteRow(tx, id);
      const vote = await tx.vote.findUnique({
        where: { id },
        select: { id: true, meetingId: true, status: true, boothMode: true, boothUserId: true },
      });
      if (!vote) throw new HttpError(404, "Nie znaleziono głosowania.");
      meetingId = vote.meetingId;
      if (!vote.boothMode) throw new HttpError(400, "To głosowanie nie jest prowadzone w trybie kotarkowym.");
      if (vote.status !== "OPEN") throw new HttpError(409, "Głosowanie nie trwa - udostępnianie karty jest niemożliwe.");

      const user = await tx.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
      personName = user ? `${user.firstName} ${user.lastName}` : userId;
      const voted = await tx.secretBallotMarker.findUnique({ where: { voteId_userId: { voteId: id, userId } } });

      if (action === "grant") {
        if (voted) throw new HttpError(409, `${personName} już oddał(a) głos w tym głosowaniu.`);
        if (vote.boothUserId === userId) return; // już udostępniono - ponowienie żądania bez skutków
        if (vote.boothUserId) {
          const holder = await tx.user.findUnique({ where: { id: vote.boothUserId }, select: { firstName: true, lastName: true } });
          throw new HttpError(409, `Karta jest już udostępniona: ${holder ? `${holder.firstName} ${holder.lastName}` : "inna osoba"}. Najpierw poczekaj na głos albo cofnij udostępnienie.`);
        }
        const why = await boothIneligibility(tx, vote, userId);
        if (why) throw new HttpError(409, why);
        await tx.vote.update({ where: { id }, data: { boothUserId: userId, boothGrantedAt: new Date() } });
        changed = true;
      } else {
        if (vote.boothUserId !== userId) {
          if (voted) throw new HttpError(409, `Głos osoby ${personName} został już przyjęty - nie można cofnąć udostępnienia.`);
          throw new HttpError(409, `Karta nie jest udostępniona osobie ${personName}.`);
        }
        await tx.vote.update({ where: { id }, data: { boothUserId: null, boothGrantedAt: null } });
        changed = true;
      }
    });
  } catch (e) {
    if (e instanceof HttpError) return new NextResponse(e.message, { status: e.status });
    throw e;
  }

  if (changed) {
    await audit({
      action: action === "grant" ? "VOTE_BOOTH_GRANTED" : "VOTE_BOOTH_REVOKED",
      description: action === "grant" ? `Tryb kotarkowy: udostępniono kartę - ${personName}` : `Tryb kotarkowy: cofnięto udostępnienie - ${personName}`,
      meetingId,
      userId: session!.user.id,
      metadata: { voteId: id, participantUserId: userId },
    });
    // Zdarzenie bez danych o osobie - telefony same pobierają swój stan.
    publishToMeeting(meetingId, { type: "vote.booth", voteId: id });
  }

  const state = await loadBoothState(prisma, id);
  return NextResponse.json(state);
}
