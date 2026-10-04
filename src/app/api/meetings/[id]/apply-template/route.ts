import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ templateId: z.string() });

/**
 * Dodaje uczestników z szablonu składu do posiedzenia.
 * Deduplikacja: osoby już przypisane do posiedzenia są pomijane (nie nadpisujemy praw).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const template = await prisma.meetingTemplate.findUnique({
    where: { id: parsed.data.templateId },
    include: { members: true },
  });
  if (!template) return new NextResponse("Nie znaleziono szablonu", { status: 404 });

  const existing = await prisma.meetingParticipant.findMany({
    where: { meetingId },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((e) => e.userId));

  const toAdd = template.members.filter((m) => !existingIds.has(m.userId));
  if (toAdd.length > 0) {
    await prisma.meetingParticipant.createMany({
      data: toAdd.map((m) => ({
        meetingId,
        userId: m.userId,
        hasVotingRight: m.hasVotingRight,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ ok: true, added: toAdd.length, skipped: template.members.length - toAdd.length });
}
