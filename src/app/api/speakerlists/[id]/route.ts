import { auth } from "@/lib/auth";
import { canManageMeeting } from "@/lib/canManage";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { setListLimitEnabled } from "@/lib/speechLimit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  selfSignupEnabled: z.boolean().optional(),
  visibleToParticipants: z.boolean().optional(),
  defaultTimeLimitSec: z.number().int().min(0).nullable().optional(),
  allowRegular: z.boolean().optional(),
  allowAdVocem: z.boolean().optional(),
  allowFormalMotion: z.boolean().optional(),
  /** Przełącznik limitu całej listy (zapamiętywany na posiedzenie). */
  limitEnabled: z.boolean().optional(),
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

  const { limitEnabled, ...listData } = parsed.data;
  if (Object.keys(listData).length > 0) await prisma.speakerList.update({ where: { id }, data: listData });
  if (typeof limitEnabled === "boolean") await setListLimitEnabled(id, limitEnabled);
  publishToMeeting(list.meetingId, { type: "speakerlist.updated" });
  return NextResponse.json({ ok: true });
}
