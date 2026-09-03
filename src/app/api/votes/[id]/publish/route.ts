import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ published: z.boolean() });

/** POST /api/votes/[id]/publish - ręczne opublikowanie / ukrycie wyników głosowania. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const vote = await prisma.vote.findUnique({ where: { id } });
  if (!vote) return new NextResponse("Not found", { status: 404 });
  if (vote.status !== "CLOSED")
    return new NextResponse("Wyniki można publikować dopiero po zamknięciu głosowania", { status: 400 });

  await prisma.vote.update({
    where: { id },
    data: { resultPublishedAt: parsed.data.published ? new Date() : null },
  });

  await audit({
    action: parsed.data.published ? "VOTE_RESULT_PUBLISHED" : "VOTE_RESULT_HIDDEN",
    description: `${parsed.data.published ? "Opublikowano" : "Ukryto"} wyniki głosowania${vote.number != null ? ` nr ${vote.number}` : ""}: ${vote.title}`,
    meetingId: vote.meetingId,
    userId: session.user.id,
    metadata: { voteId: id },
  });

  publishToMeeting(vote.meetingId, { type: "vote.result_published", voteId: id });
  return NextResponse.json({ ok: true });
}
