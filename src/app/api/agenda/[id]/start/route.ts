import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const item = await prisma.agendaItem.findUnique({ where: { id }, include: { meeting: true } });
  if (!item) return new NextResponse("Not found", { status: 404 });

  // Jeśli aktualny "current" istnieje i to nie jest ten sam punkt - ZAMYKAMY go (COMPLETED).
  // Operator może świadomie ZAWIESIĆ punkt osobnym przyciskiem (endpoint /pause).
  await prisma.$transaction(async (tx) => {
    if (item.meeting.currentAgendaItemId && item.meeting.currentAgendaItemId !== item.id) {
      await tx.agendaItem.update({
        where: { id: item.meeting.currentAgendaItemId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
    await tx.agendaItem.update({
      where: { id: item.id },
      data: {
        status: "CURRENT",
        startedAt: item.startedAt ?? new Date(),
        // Jeśli był COMPLETED, czyścimy completedAt (operator ponownie otwiera)
        completedAt: null,
      },
    });
    await tx.meeting.update({
      where: { id: item.meetingId },
      data: { currentAgendaItemId: item.id, status: "IN_PROGRESS" },
    });

    // Auto-otwieranie listy mówców dla tego punktu (gdy operator włączył opcję w ustawieniach posiedzenia).
    if (item.meeting.autoOpenSpeakerList) {
      const existing = await tx.speakerList.findUnique({ where: { agendaItemId: item.id } });
      if (existing) {
        await tx.speakerList.update({
          where: { id: existing.id },
          data: { selfSignupEnabled: true, visibleToParticipants: true },
        });
      } else {
        await tx.speakerList.create({
          data: {
            meetingId: item.meetingId,
            agendaItemId: item.id,
            selfSignupEnabled: true,
            visibleToParticipants: true,
            allowRegular: (item.meeting as { speakerDefaultRegular?: boolean }).speakerDefaultRegular ?? true,
            allowAdVocem: (item.meeting as { speakerDefaultAdVocem?: boolean }).speakerDefaultAdVocem ?? true,
            allowFormalMotion: (item.meeting as { speakerDefaultFormalMotion?: boolean }).speakerDefaultFormalMotion ?? true,
          },
        });
      }
    }
  });

  await audit({
    action: "AGENDA_ITEM_STARTED",
    description: `Rozpoczęto punkt ${item.number}: ${item.title}`,
    meetingId: item.meetingId,
    userId: session.user.id,
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
