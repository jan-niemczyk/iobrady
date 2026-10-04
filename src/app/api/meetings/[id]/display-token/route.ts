import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { newDisplayToken } from "@/lib/displayAccess";
import { invalidateDisplayCache } from "@/lib/displayCache";
import { NextResponse } from "next/server";

/**
 * POST /api/meetings/[id]/display-token - nowy token ekranu (SA-07). Dotychczasowe linki
 * prezentacji i nakładki OBS przestają działać (np. gdy link wyciekł).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const m = await prisma.meeting.findUnique({ where: { id }, select: { number: true } });
  if (!m) return new NextResponse("Not found", { status: 404 });
  const token = newDisplayToken();
  await prisma.meeting.update({ where: { id }, data: { displayToken: token } });
  invalidateDisplayCache(id);
  await audit({
    action: "MEETING_UPDATED",
    description: `Wygenerowano nowy link ekranu prezentacji/transmisji posiedzenia ${m.number}`,
    meetingId: id, userId: session.user.id,
  });
  return NextResponse.json({ ok: true, displayToken: token });
}
