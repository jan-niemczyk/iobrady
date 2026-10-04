import { auth } from "@/lib/auth";
import { canManageMeeting } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  entryId: z.string(),
  direction: z.enum(["up", "down", "top"]),
});

/** Operator przestawia wpis w kolejce wniosków formalnych (ręczna korekta FIFO). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id: meetingId } = await ctx.params;
  if (!(await canManageMeeting(session, meetingId)))
    return new NextResponse("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const queue = await prisma.speakerList.findFirst({ where: { meetingId, kind: "FORMAL_MOTIONS" } });
  if (!queue) return new NextResponse("Brak kolejki wniosków", { status: 404 });

  const waiting = await prisma.speakerListEntry.findMany({
    where: { speakerListId: queue.id, status: "WAITING" },
    orderBy: { order: "asc" },
  });
  const idx = waiting.findIndex((e) => e.id === parsed.data.entryId);
  if (idx < 0) return new NextResponse("Nie znaleziono wpisu", { status: 404 });

  let target = idx;
  if (parsed.data.direction === "up") target = Math.max(0, idx - 1);
  else if (parsed.data.direction === "down") target = Math.min(waiting.length - 1, idx + 1);
  else if (parsed.data.direction === "top") target = 0;
  if (target === idx) return NextResponse.json({ ok: true });

  // Przenieś element na docelową pozycję i przelicz order.
  const reordered = [...waiting];
  const [moved] = reordered.splice(idx, 1);
  reordered.splice(target, 0, moved);
  await prisma.$transaction(
    reordered.map((e, i) => prisma.speakerListEntry.update({ where: { id: e.id }, data: { order: i } })),
  );

  publishToMeeting(meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}
