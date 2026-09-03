import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { MeetingStatus } from "@prisma/client";

// Wszystkie otwarte głosowania radnego ze WSZYSTKICH jego otwartych posiedzeń.
// Pozwala głosować niezależnie od tego, które posiedzenie jest wybrane na panelu,
// oraz obsłużyć sytuację dwóch (lub więcej) głosowań otwartych naraz.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ votes: [] });
  const userId = session.user.id;

  const parts = await prisma.meetingParticipant.findMany({
    where: {
      userId,
      hasVotingRight: true,
      excludedFromMeeting: false,
      meeting: { status: { in: [MeetingStatus.OPEN, MeetingStatus.IN_PROGRESS, MeetingStatus.PAUSED] } },
    },
    include: {
      attendance: true,
      meeting: {
        include: {
          votes: { where: { status: "OPEN" }, include: { options: { orderBy: { order: "asc" } } } },
        },
      },
    },
  });

  const appSettings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const out: Record<string, unknown>[] = [];

  for (const p of parts) {
    for (const open of p.meeting.votes) {
      // Kworum dostępne też niepotwierdzonym; pozostałe tylko obecnym.
      const isPresent = p.attendance?.status === "PRESENT";
      if (open.type !== "QUORUM" && !isPresent) continue;

      let alreadyVoted = false;
      let myChoice: "YES" | "NO" | "ABSTAIN" | null = null;
      let mySelectedOptionIds: string[] = [];
      let myPackageChoices: { optionId: string; choice: "YES" | "NO" | "ABSTAIN" }[] = [];
      let pinAuthorized = false;

      if (open.pinRequired) {
        const pa = await prisma.votePinAuth.findUnique({ where: { voteId_userId: { voteId: open.id, userId } } });
        pinAuthorized = !!pa;
      }
      if (open.visibility === "SECRET") {
        const marker = await prisma.secretBallotMarker.findUnique({ where: { voteId_userId: { voteId: open.id, userId } } });
        if (marker) alreadyVoted = true;
      } else {
        const ballot = await prisma.ballot.findUnique({ where: { voteId_userId: { voteId: open.id, userId } }, include: { selections: true } });
        if (ballot) {
          alreadyVoted = true;
          myChoice = ballot.choice ?? null;
          mySelectedOptionIds = ballot.selections.map((s) => s.optionId);
          myPackageChoices = ballot.selections.filter((s) => s.choice != null).map((s) => ({ optionId: s.optionId, choice: s.choice as "YES" | "NO" | "ABSTAIN" }));
        }
      }

      out.push({
        meetingId: p.meetingId,
        meetingName: p.meeting.name,
        meetingNumber: p.meeting.number,
        vote: {
          id: open.id, title: open.title, description: open.description, type: open.type, visibility: open.visibility,
          majority: open.majority, majorityKind: open.majorityKind, majorityBase: open.majorityBase,
          minSelections: open.minSelections, maxSelections: open.maxSelections,
          options: open.options.map((o) => ({ id: o.id, order: o.order, label: o.label, positionNumber: o.positionNumber, description: o.description })),
          alreadyVoted, myChoice, mySelectedOptionIds, myPackageChoices,
          pinRequired: open.pinRequired, pinAuthorized, requireAllPositions: open.requireAllPositions,
          voteIsFinal: open.visibility === "SECRET" ? (open.firstVoteFinal ?? true) : (open.firstVoteFinal ?? !!appSettings?.firstVoteFinalOpen),
        },
      });
    }
  }

  return NextResponse.json({ votes: out });
}
