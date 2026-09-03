import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";
import { VoteChoice, VoteStatus, VoteType } from "@prisma/client";

const schema = z.object({
  // dla STANDARD:
  choice: z.nativeEnum(VoteChoice).optional(),
  // dla LIST:
  selectedOptionIds: z.array(z.string()).optional(),
  // dla PACKAGE: głos na każdą pozycję { optionId, choice }
  packageChoices: z.array(z.object({ optionId: z.string(), choice: z.nativeEnum(VoteChoice) })).optional(),
  // tajne: głos nieważny (przycisk OBECNY) - liczy się do frekwencji, ale jako nieważny
  invalid: z.boolean().optional(),
  // OPERATOR może oddać głos w imieniu uczestnika (tylko głosowania JAWNE).
  onBehalfUserId: z.string().optional(),
  // OPERATOR może wyzerować (usunąć) głos uczestnika (tylko JAWNE).
  reset: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id: voteId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const vote = await prisma.vote.findUnique({
    where: { id: voteId },
    include: { options: true },
  });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (vote.status !== VoteStatus.OPEN)
    return new NextResponse("Głosowanie nie jest otwarte", { status: 400 });

  // Ustal użytkownika, w imieniu którego oddajemy głos.
  // Domyślnie - zalogowany. Operator może podać `onBehalfUserId`, ale TYLKO dla głosowań JAWNYCH.
  let targetUserId = session.user.id;
  if (parsed.data.onBehalfUserId && parsed.data.onBehalfUserId !== session.user.id) {
    if (session.user.role !== "OPERATOR") {
      return new NextResponse("Tylko operator może głosować w imieniu uczestnika", { status: 403 });
    }
    if (vote.visibility !== "OPEN") {
      return new NextResponse("Głosowanie w imieniu jest możliwe tylko dla głosowań jawnych", { status: 400 });
    }
    targetUserId = parsed.data.onBehalfUserId;
  }

  // C4: operator zeruje głos uczestnika (usuwa ballot i selekcje) - tylko jawne.
  if (parsed.data.reset) {
    if (session.user.role !== "OPERATOR") return new NextResponse("Tylko operator", { status: 403 });
    if (vote.visibility !== "OPEN") return new NextResponse("Zerowanie możliwe tylko dla głosowań jawnych", { status: 400 });
    const existing = await prisma.ballot.findUnique({ where: { voteId_userId: { voteId, userId: targetUserId } } });
    if (existing) {
      await prisma.$transaction([
        prisma.ballotSelection.deleteMany({ where: { ballotId: existing.id } }),
        prisma.ballot.delete({ where: { id: existing.id } }),
      ]);
    }
    publishToMeeting(vote.meetingId, { type: "vote.opened", voteId }); // odświeżenie liczników po wyzerowaniu głosu
    return NextResponse.json({ ok: true, reset: true });
  }

  // sprawdź uczestnictwo i prawo głosu DLA WYBRANEGO UŻYTKOWNIKA (operator lub on-behalf)
  const mp = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId: vote.meetingId, userId: targetUserId } },
    include: { attendance: true },
  });
  if (!mp) return new NextResponse("Uczestnik nie należy do tego posiedzenia", { status: 403 });
  if (mp.excludedFromMeeting) return new NextResponse("Uczestnik został wykluczony z posiedzenia", { status: 403 });
  if (!mp.hasVotingRight) return new NextResponse("Uczestnik nie ma prawa głosu", { status: 403 });
  if (mp.excludedFromVoteIds.includes(voteId))
    return new NextResponse("Uczestnik został wyłączony z tego głosowania", { status: 403 });
  // Dla QUORUM nie wymagamy "PRESENT" - głosowanie kworum SAMO ustala obecność.
  if (vote.type !== VoteType.QUORUM && mp.attendance?.status !== "PRESENT")
    return new NextResponse("Uczestnik musi być obecny, aby głosować", { status: 403 });

  // PIN: jeśli głosowanie wymaga PIN, użytkownik musi być wcześniej autoryzowany.
  // (operator głosujący w imieniu jest zwolniony z PIN-u).
  if (vote.pinRequired && vote.pinCode && !(session.user.role === "OPERATOR" && parsed.data.onBehalfUserId)) {
    const authd = await prisma.votePinAuth.findUnique({
      where: { voteId_userId: { voteId, userId: targetUserId } },
    });
    if (!authd) return new NextResponse("Najpierw wprowadź PIN, aby odblokować głosowanie.", { status: 403 });
  }

  // walidacja danych w zależności od typu
  if (vote.type === VoteType.LIST) {
    const selected = parsed.data.selectedOptionIds ?? [];
    const validIds = new Set(vote.options.map((o) => o.id));
    for (const s of selected) {
      if (!validIds.has(s)) return new NextResponse(`Nieznana opcja ${s}`, { status: 400 });
    }
    const min = vote.minSelections ?? 0;
    const max = vote.maxSelections ?? vote.options.length;
    // Głos nieważny (przycisk "Obecny" w tajnym) pomija wymóg minimum.
    const isInvalidVote = vote.visibility === "SECRET" && parsed.data.invalid;
    if (!isInvalidVote && selected.length < min)
      return new NextResponse(`Wybierz co najmniej ${min} opcji`, { status: 400 });
    if (selected.length > max)
      return new NextResponse(`Wybierz co najwyżej ${max} opcji`, { status: 400 });
  } else if (vote.type === VoteType.PACKAGE) {
    const choices = parsed.data.packageChoices ?? [];
    const validIds = new Set(vote.options.map((o) => o.id));
    for (const ch of choices) {
      if (!validIds.has(ch.optionId)) return new NextResponse(`Nieznana pozycja ${ch.optionId}`, { status: 400 });
    }
    // Wymóg oddania na wszystkie pozycje (chyba że tajny głos nieważny).
    const isInvalidVote = vote.visibility === "SECRET" && parsed.data.invalid;
    if (!isInvalidVote && vote.requireAllPositions && choices.length < vote.options.length)
      return new NextResponse("Oddaj głos na wszystkie pozycje pakietu.", { status: 400 });
  } else if (vote.type === VoteType.QUORUM) {
    // dla kworum zawsze zapisujemy YES (obecny)
    parsed.data.choice = "YES";
  } else {
    // STANDARD: wymagamy wyboru, chyba że to tajne z głosem nieważnym (invalid)
    if (!parsed.data.choice && !(vote.visibility === "SECRET" && parsed.data.invalid))
      return new NextResponse("Brak wyboru (za / przeciw / wstrzymuję się)", { status: 400 });
  }

  // "Pierwszy głos ostateczny" - gdy włączone (osobno jawne/tajne), po oddaniu głosu
  // nie można go zmienić. Operator głosujący w imieniu NIE podlega blokadzie (może korygować).
  if (session.user.role !== "OPERATOR" || !parsed.data.onBehalfUserId) {
    const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
    const isSecret = vote.visibility === "SECRET";
    // Ustawienie per głosowanie (firstVoteFinal) ma pierwszeństwo nad globalnym.
    const globalLock = isSecret ? settings?.firstVoteFinalSecret : settings?.firstVoteFinalOpen;
    const finalLock = vote.firstVoteFinal != null ? vote.firstVoteFinal : globalLock;
    if (finalLock && vote.type !== VoteType.QUORUM) {
      const alreadyVoted = isSecret
        ? await prisma.secretBallotMarker.findUnique({ where: { voteId_userId: { voteId, userId: targetUserId } } })
        : await prisma.ballot.findUnique({ where: { voteId_userId: { voteId, userId: targetUserId } } });
      if (alreadyVoted)
        return new NextResponse("Głos został już oddany i nie można go zmienić", { status: 409 });
    }
  }

  // ── GŁOSOWANIE TAJNE: zapis bez powiązania kto→co ──────────────────
  if (vote.visibility === "SECRET" && vote.type !== VoteType.QUORUM) {
    try {
      await prisma.$transaction(async (tx) => {
        const existingMarker = await tx.secretBallotMarker.findUnique({
          where: { voteId_userId: { voteId, userId: targetUserId } },
        });
        if (existingMarker) throw new Error("ALREADY_VOTED");
        await tx.secretBallotMarker.create({ data: { voteId, userId: targetUserId } });

        if (vote.type === VoteType.PACKAGE) {
          // Tajny pakiet: anonimowe liczniki per pozycja (bez wiązania kto→co).
          const choices = parsed.data.packageChoices ?? [];
          if (!parsed.data.invalid) {
            for (const pc of choices) {
              const data =
                pc.choice === "YES" ? { secretYes: { increment: 1 } }
                : pc.choice === "NO" ? { secretNo: { increment: 1 } }
                : { secretAbstain: { increment: 1 } };
              await tx.voteOption.update({ where: { id: pc.optionId }, data });
            }
          }
        } else if (vote.type === VoteType.LIST) {
          // Tajna lista: inkrementujemy anonimowy licznik per wybrana opcja.
          const selected = parsed.data.selectedOptionIds ?? [];
          // głos nieważny (przycisk Obecny) = brak wyboru, liczy się tylko frekwencja
          if (parsed.data.invalid || selected.length === 0) {
            // nic nie inkrementujemy - sam marker (frekwencja). To dozwolone dla listy.
          } else {
            await tx.voteOption.updateMany({
              where: { voteId, id: { in: selected } },
              data: { secretCount: { increment: 1 } },
            });
          }
        } else {
          // Tajne STANDARD: jeden z liczników zbiorczych.
          const field =
            parsed.data.invalid ? "secretInvalid"
            : parsed.data.choice === "YES" ? "secretYes"
            : parsed.data.choice === "NO" ? "secretNo"
            : parsed.data.choice === "ABSTAIN" ? "secretAbstain"
            : null;
          if (!field) throw new Error("NO_CHOICE");
          await tx.vote.update({
            where: { id: voteId },
            data: { [field]: { increment: 1 } },
          });
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "ALREADY_VOTED")
        return new NextResponse("W głosowaniu tajnym głos jest jednorazowy i anonimowy - nie można go zmienić ani cofnąć.", { status: 409 });
      if (msg === "NO_CHOICE")
        return new NextResponse("Brak wyboru", { status: 400 });
      return new NextResponse("Błąd zapisu głosu", { status: 500 });
    }
    publishToMeeting(vote.meetingId, { type: "vote.opened", voteId });
    return NextResponse.json({ ok: true, secret: true });
  }

  // ── GŁOSOWANIE JAWNE / KWORUM: zapis z powiązaniem (Ballot) ────────
  // upsert ballota - wraz z usunięciem starych selections (dla list-vote)
  await prisma.$transaction(async (tx) => {
    // Dla QUORUM: oznacz uczestnika jako obecnego (główny sens głosowania kworum).
    if (vote.type === VoteType.QUORUM) {
      await tx.attendance.upsert({
        where: { participantId: mp.id },
        update: { status: "PRESENT", confirmedAt: new Date() },
        create: {
          participantId: mp.id,
          status: "PRESENT",
          source: targetUserId === session.user.id ? "PARTICIPANT" : "OPERATOR",
          confirmedAt: new Date(),
        },
      });
    }

    const existing = await tx.ballot.findUnique({
      where: { voteId_userId: { voteId, userId: targetUserId } },
    });

    // Snapshot personaliów (imię, nazwisko, klub) w chwili oddania głosu - punkt 21.
    const voter = await tx.user.findUnique({
      where: { id: targetUserId },
      include: { group: true },
    });
    const snapshot = {
      voterFirstName: voter?.firstName ?? null,
      voterLastName: voter?.lastName ?? null,
      voterClubName: voter?.group?.name ?? null,
      voterClubShort: voter?.group?.shortName ?? null,
    };

    if (existing) {
      // wyczyść stare zaznaczenia
      await tx.ballotSelection.deleteMany({ where: { ballotId: existing.id } });
      await tx.ballot.update({
        where: { id: existing.id },
        data: {
          choice: (vote.type === VoteType.LIST || vote.type === VoteType.PACKAGE) ? null : parsed.data.choice,
          updatedAt: new Date(),
          ...snapshot,
          selections: vote.type === VoteType.LIST
            ? { create: (parsed.data.selectedOptionIds ?? []).map((optionId) => ({ optionId })) }
            : vote.type === VoteType.PACKAGE
            ? { create: (parsed.data.packageChoices ?? []).map((pc) => ({ optionId: pc.optionId, choice: pc.choice })) }
            : undefined,
        },
      });
    } else {
      await tx.ballot.create({
        data: {
          voteId,
          userId: targetUserId,
          choice: (vote.type === VoteType.LIST || vote.type === VoteType.PACKAGE) ? null : parsed.data.choice,
          ...snapshot,
          selections: vote.type === VoteType.LIST
            ? { create: (parsed.data.selectedOptionIds ?? []).map((optionId) => ({ optionId })) }
            : vote.type === VoteType.PACKAGE
            ? { create: (parsed.data.packageChoices ?? []).map((pc) => ({ optionId: pc.optionId, choice: pc.choice })) }
            : undefined,
        },
      });
    }
  });

  // świadomie NIE robimy audit dla każdego cast - to ginie w wolumenie.
  // sumę castów audytujemy na zamknięciu (VOTE_CLOSED).

  publishToMeeting(vote.meetingId, { type: "vote.opened", voteId }); // wystarczy by liczniki się odświeżyły
  return NextResponse.json({ ok: true });
}
