import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Lista sprawdzeń obecności posiedzenia (historia migawek - podgląd „kto o której").
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const checks = await prisma.attendanceCheck.findMany({
    where: { meetingId: id },
    orderBy: { startedAt: "desc" },
    include: { entries: { orderBy: [{ lastName: "asc" }, { firstName: "asc" }] } },
  });

  return NextResponse.json({
    checks: checks.map((c) => ({
      id: c.id,
      kind: c.kind,
      status: c.status,
      startedAt: c.startedAt,
      closedAt: c.closedAt,
      presentCount: c.presentCount,
      eligibleCount: c.eligibleCount,
      quorumRequired: c.quorumRequired,
      quorumMet: c.quorumMet,
      entries: c.entries.map((e) => ({
        userId: e.userId, lastName: e.lastName, firstName: e.firstName,
        clubShort: e.clubShort, present: e.present, markedAt: e.markedAt,
      })),
    })),
  });
}
