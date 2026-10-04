import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { comparePl } from "@/lib/sortPl";

/**
 * Dane do wygenerowania listy obecności DO PODPISU (wszyscy uprawnieni, niewykluczeni).
 * Kolejność alfabetyczna. Klub tylko gdy grupy włączone.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const [meeting, settings] = await Promise.all([
    prisma.meeting.findUnique({
      where: { id },
      include: {
        participants: {
          where: { hasVotingRight: true, excludedFromMeeting: false },
          include: { user: { include: { group: true } } },
        },
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  const groupsEnabled = settings?.groupsEnabled === true;
  const people = meeting.participants
    .map((p) => ({
      lastName: p.user.lastName,
      firstName: p.user.firstName,
      groupShort: groupsEnabled ? (p.user.group?.shortName ?? null) : null,
    }))
    .sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  const dateText = new Date(meeting.scheduledAt).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

  return NextResponse.json({
    organization: settings?.organizationName ?? "",
    meetingName: meeting.name,
    meetingNumber: meeting.number,
    dateText,
    groupsEnabled,
    people,
  });
}
