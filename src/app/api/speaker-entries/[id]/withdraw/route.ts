import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const entry = await prisma.speakerListEntry.findUnique({
    where: { id }, include: { list: true },
  });
  if (!entry) return new NextResponse("Not found", { status: 404 });

  // uczestnik może wycofać tylko siebie i tylko gdy WAITING
  const isOperator = session.user.role === "OPERATOR";
  const isSelf = entry.userId === session.user.id;
  if (!isOperator && !isSelf) return new NextResponse("Forbidden", { status: 403 });
  if (entry.status === "SPEAKING")
    return new NextResponse("Wystąpienie trwa - zakończ je", { status: 400 });

  await prisma.speakerListEntry.update({
    where: { id },
    data: { status: "WITHDRAWN", endedAt: new Date() },
  });

  publishToMeeting(entry.list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}
