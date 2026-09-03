import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { evaluateMajority } from "@/lib/majority";
import { z } from "zod";

const schema = z.object({
  majorityKind: z.enum(["SIMPLE", "ABSOLUTE", "QUALIFIED_TWO_THIRDS", "QUALIFIED_THREE_FIFTHS"]),
  majorityBase: z.enum(["OF_VOTERS", "OF_PRESENT", "OF_FULL_BODY"]).optional(),
});

/**
 * Ponowne przeliczenie wyniku głosowania po korekcie błędnie zadeklarowanej większości.
 * Zmienia majorityKind/Base i na nowo wyznacza resultPassed z zachowanych liczników.
 * Zgodne z pierwotną specyfikacją (możliwość korekty deklarowanej większości).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const vote = await prisma.vote.findUnique({ where: { id } });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (vote.status !== "CLOSED")
    return new NextResponse("Można przeliczyć tylko zamknięte głosowanie", { status: 400 });
  if (vote.type !== "STANDARD")
    return new NextResponse("Przeliczenie dotyczy głosowań standardowych", { status: 400 });

  const majorityKind = parsed.data.majorityKind;
  const majorityBase = parsed.data.majorityBase ?? vote.majorityBase;

  const eligible = vote.resultEligibleCount ?? 0;
  const present = vote.resultPresentCount ?? 0;
  const yes = vote.resultYes ?? 0;
  const no = vote.resultNo ?? 0;
  const abstain = vote.resultAbstain ?? 0;

  const m = evaluateMajority(majorityKind, majorityBase, {
    yes, no, abstain, presentCount: present, eligibleCount: eligible,
  });

  await prisma.vote.update({
    where: { id },
    data: { majorityKind, majorityBase, resultPassed: m.passed },
  });

  await audit({
    action: "VOTE_MAJORITY_RECOMPUTED",
    description: `Przeliczono większość głosowania (${majorityKind})`,
    meetingId: vote.meetingId, userId: session.user.id,
    metadata: { voteId: id, majorityKind, majorityBase, passed: m.passed },
  });

  publishToMeeting(vote.meetingId, { type: "meeting.updated" });
  return NextResponse.json({ ok: true, passed: m.passed });
}
