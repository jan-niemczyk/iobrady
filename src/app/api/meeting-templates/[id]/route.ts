import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  // hurtowe dodanie członków (np. cały klub naraz)
  addUserIds: z.array(z.string()).optional(),
  // usunięcie członków
  removeUserIds: z.array(z.string()).optional(),
  // zmiana prawa głosu konkretnego członka
  setVotingRight: z.object({ userId: z.string(), hasVotingRight: z.boolean() }).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad: ${parsed.error.message}`, { status: 400 });

  const d = parsed.data;

  if (d.name !== undefined || d.description !== undefined) {
    await prisma.meetingTemplate.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
      },
    });
  }

  // Hurtowe dodanie członków (pomija duplikaty)
  if (d.addUserIds?.length) {
    for (const userId of d.addUserIds) {
      await prisma.meetingTemplateMember.upsert({
        where: { templateId_userId: { templateId: id, userId } },
        update: {},
        create: { templateId: id, userId },
      });
    }
  }

  if (d.removeUserIds?.length) {
    await prisma.meetingTemplateMember.deleteMany({
      where: { templateId: id, userId: { in: d.removeUserIds } },
    });
  }

  if (d.setVotingRight) {
    await prisma.meetingTemplateMember.updateMany({
      where: { templateId: id, userId: d.setVotingRight.userId },
      data: { hasVotingRight: d.setVotingRight.hasVotingRight },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  await prisma.meetingTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
