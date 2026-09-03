import { auth } from "@/lib/auth";
import { canManageMeeting } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { comparePl } from "@/lib/sortPl";

const schema = z.object({
  kind: z.enum(["CONFIRMATION", "QUORUM_VOTE", "INCREMENTAL"]).default("CONFIRMATION"),
});

/**
 * Rozpoczyna sprawdzenie obecności (migawkę). Zeruje bieżący stan obecności -
 * nowe potwierdzenia liczą się wyłącznie w ramach tej migawki. Poprzednie
 * zamknięte migawki pozostają w historii (podgląd „kto i o której").
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canManageMeeting(session, id)))
    return new NextResponse("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: { participants: { where: { hasVotingRight: true, excludedFromMeeting: false }, include: { user: { include: { group: true } }, attendance: true } } },
  });
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  // Jeśli trwa inne sprawdzenie - najpierw je przerwij (zostawia poprzedni stan).
  if (meeting.activeAttendanceCheckId) {
    await prisma.attendanceCheck.update({
      where: { id: meeting.activeAttendanceCheckId },
      data: { status: "INTERRUPTED", closedAt: new Date() },
    }).catch(() => {});
  }

  const sorted = [...meeting.participants].sort((a, b) =>
    comparePl(`${a.user.lastName} ${a.user.firstName}`, `${b.user.lastName} ${b.user.firstName}`));

  // Korekta bieżącego stanu: startujemy od aktualnej obecności (prefill), pozostałe - od zera.
  const isCorrection = parsed.data.kind === "INCREMENTAL";
  const currentPresent = new Map<string, boolean>();
  if (isCorrection) {
    for (const mp of meeting.participants) {
      currentPresent.set(mp.userId, mp.attendance?.status === "PRESENT");
    }
  }

  const check = await prisma.attendanceCheck.create({
    data: {
      meetingId: id,
      // Korekta rejestruje się jak zwykłe potwierdzenie obecności (nie jako osobny rodzaj "korekta").
      kind: isCorrection ? "CONFIRMATION" : parsed.data.kind,
      status: "OPEN",
      entries: {
        create: sorted.map((mp) => ({
          userId: mp.userId,
          lastName: mp.user.lastName,
          firstName: mp.user.firstName,
          clubShort: mp.user.group?.shortName ?? null,
          present: currentPresent.get(mp.userId) ?? false,
        })),
      },
    },
  });

  await prisma.meeting.update({
    where: { id },
    // Nie przełączamy trybu prezentacji - zostaje AUTO. Ekran sam pokazuje listę obecności,
    // gdy trwa zwykłe sprawdzenie (CONFIRMATION), i wraca automatycznie po jego zamknięciu.
    data: { activeAttendanceCheckId: check.id, attendanceOpen: true },
  });

  await audit({
    action: "ATTENDANCE_OPENED",
    description: parsed.data.kind === "QUORUM_VOTE" ? "Rozpoczęto głosowanie kworum" : "Rozpoczęto potwierdzenie obecności",
    meetingId: id, userId: session.user.id,
    metadata: { checkId: check.id, kind: isCorrection ? "CONFIRMATION" : parsed.data.kind },
  });

  publishToMeeting(id, { type: "attendance.updated" });
  if (!isCorrection) publishToMeeting(id, { type: "display.changed" });
  return NextResponse.json({ ok: true, checkId: check.id });
}
