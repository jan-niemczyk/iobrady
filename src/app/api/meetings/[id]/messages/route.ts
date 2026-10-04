import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  content: z.string().min(1).max(2000),
  visibleToAll: z.boolean().optional().default(true),
  visibleGroupIds: z.array(z.string()).optional().default([]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const message = await prisma.message.create({
    data: {
      meetingId,
      content: parsed.data.content,
      visibleToAll: parsed.data.visibleToAll ?? true,
      visibleGroupIds: parsed.data.visibleGroupIds ?? [],
    },
  });

  await audit({
    action: "MESSAGE_PUBLISHED",
    description: `Opublikowano komunikat: ${parsed.data.content.slice(0, 100)}`,
    meetingId, userId: session.user.id,
    metadata: { messageId: message.id },
  });

  publishToMeeting(meetingId, { type: "message.published", messageId: message.id });
  return NextResponse.json({ ok: true, messageId: message.id });
}
