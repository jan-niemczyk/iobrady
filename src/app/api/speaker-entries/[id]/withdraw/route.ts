import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { canManageMeeting } from "@/lib/canManage";
import { audit } from "@/lib/audit";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const entry = await prisma.speakerListEntry.findUnique({
    where: { id }, include: { list: true },
  });
  if (!entry) return new NextResponse("Not found", { status: 404 });

  // IA-06: uczestnik wycofuje wyłącznie własne OCZEKUJĄCE zgłoszenie. Prowadzący może wycofać każde
  // poza trwającym; wycofanie zakończonego wystąpienia (zmiana historii) trafia do dziennika.
  const manager = await canManageMeeting(session, entry.list.meetingId);
  const isSelf = entry.userId === session.user.id;
  if (!manager && !isSelf) return new NextResponse("Forbidden", { status: 403 });
  if (entry.status === "SPEAKING")
    return new NextResponse("Wystąpienie trwa - zakończ je", { status: 400 });
  if (!manager && entry.status !== "WAITING")
    return new NextResponse("Można wycofać tylko oczekujące zgłoszenie.", { status: 409 });

  // Warunkowa zmiana: status sprawdzony w tym samym zapytaniu (równoległe udzielenie głosu).
  const r = await prisma.speakerListEntry.updateMany({
    where: { id, status: manager ? { not: "SPEAKING" } : "WAITING" },
    data: { status: "WITHDRAWN", endedAt: new Date() },
  });
  if (r.count === 0) return new NextResponse("Zgłoszenie zmieniło stan - odśwież listę.", { status: 409 });
  if (entry.status === "FINISHED") {
    await audit({
      action: "SPEAKER_ENTRY_REMOVED",
      description: `Wycofano zakończone wystąpienie: ${entry.speakerName ?? entry.userId ?? ""}`,
      meetingId: entry.list.meetingId, userId: session.user.id,
      metadata: { entryId: id, previousStatus: entry.status },
    });
  }

  publishToMeeting(entry.list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}
