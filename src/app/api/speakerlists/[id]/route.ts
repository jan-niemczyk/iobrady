import { auth } from "@/lib/auth";
import { canManageMeeting } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  selfSignupEnabled: z.boolean().optional(),
  visibleToParticipants: z.boolean().optional(),
  defaultTimeLimitSec: z.number().int().min(0).nullable().optional(),
  allowRegular: z.boolean().optional(),
  allowAdVocem: z.boolean().optional(),
  allowFormalMotion: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });

  const list = await prisma.speakerList.findUnique({ where: { id } });
  if (!list) return new NextResponse("Not found", { status: 404 });
  if (!(await canManageMeeting(session, list.meetingId)))
    return new NextResponse("Forbidden", { status: 403 });

  await prisma.speakerList.update({ where: { id }, data: parsed.data });
  publishToMeeting(list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}
