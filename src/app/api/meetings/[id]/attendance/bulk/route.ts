import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["PRESENT", "ABSENT"]),
  /** filtry - przynajmniej jeden */
  groupId: z.string().nullable().optional(),  // null = "Niezrzeszeni"
  allEligible: z.boolean().optional(),
  participantIds: z.array(z.string()).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const d = parsed.data;

  // wyznacz docelowych uczestników wg podanego filtru
  let targets = await prisma.meetingParticipant.findMany({
    where: { meetingId },
    include: { user: true },
  });

  if (d.allEligible) {
    targets = targets.filter((p) => p.hasVotingRight);
  } else if (d.participantIds && d.participantIds.length > 0) {
    targets = targets.filter((p) => d.participantIds!.includes(p.id));
  } else if (d.groupId !== undefined) {
    targets = targets.filter((p) => p.user.groupId === d.groupId);
  } else {
    return new NextResponse("Podaj filtr (allEligible, groupId lub participantIds)", { status: 400 });
  }

  if (targets.length === 0) return NextResponse.json({ ok: true, affected: 0 });

  await prisma.$transaction(async (tx) => {
    for (const t of targets) {
      await tx.attendance.upsert({
        where: { participantId: t.id },
        create: {
          participantId: t.id,
          status: d.status,
          source: "OPERATOR",
          confirmedByUserId: session.user.id,
        },
        update: {
          status: d.status,
          confirmedAt: new Date(),
          source: "OPERATOR",
          confirmedByUserId: session.user.id,
        },
      });
    }
  });

  await audit({
    action: "ATTENDANCE_MARKED",
    description: `Hurtowo oznaczono ${targets.length} uczestników jako ${d.status === "PRESENT" ? "obecnych" : "nieobecnych"}`,
    meetingId, userId: session.user.id,
    metadata: { bulk: true, count: targets.length, status: d.status, filter: d },
  });

  publishToMeeting(meetingId, { type: "attendance.updated" });
  return NextResponse.json({ ok: true, affected: targets.length });
}
