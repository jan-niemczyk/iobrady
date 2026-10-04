import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

// Rozpoczęcie obrad - odrębny krok od "Otwórz posiedzenie" (patrz POPRAWKI.md).
// Otwarcie (OPEN) udostępnia pełny panel (edycja porządku, planowanie głosowań,
// zarządzanie uczestnikami); rozpoczęcie (IN_PROGRESS) to moment faktycznego
// wejścia na żywo - dopiero wtedy uczestnicy widzą posiedzenie jako aktywne.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return new NextResponse("Not found", { status: 404 });
  if (meeting.status !== "OPEN")
    return new NextResponse("Rozpocząć można tylko otwarte posiedzenie", { status: 400 });

  await prisma.meeting.update({
    where: { id },
    data: { status: "IN_PROGRESS" },
  });

  await audit({
    action: "MEETING_STARTED",
    description: `Rozpoczęto obrady posiedzenia ${meeting.number} - ${meeting.name}`,
    meetingId: id,
    userId: session.user.id,
  });

  publishToMeeting(id, { type: "meeting.updated" });
  return NextResponse.json({ ok: true });
}
