import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) return new NextResponse("Not found", { status: 404 });
  if (item.status === "CURRENT")
    return new NextResponse("Nie można pominąć aktualnie rozpatrywanego punktu", { status: 400 });

  await prisma.agendaItem.update({
    where: { id },
    data: { status: "SKIPPED", completedAt: new Date() },
  });

  await audit({
    action: "AGENDA_ITEM_COMPLETED",
    description: `Pominięto punkt ${item.number}: ${item.title}`,
    meetingId: item.meetingId, userId: session.user.id,
    metadata: { kind: "skipped" },
  });

  publishToMeeting(item.meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
