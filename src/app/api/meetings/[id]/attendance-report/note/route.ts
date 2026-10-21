import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";

const schema = z.object({ userId: z.string().max(64), excused: z.boolean(), note: z.string().max(2000).optional().nullable() });

/** Usprawiedliwienie i uwagi do obecności - poza publiczną listą, tylko operator. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  const mp = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: id, userId: d.userId } }, select: { id: true } });
  if (!mp) return new NextResponse("Osoba nie jest uczestnikiem posiedzenia", { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.attendanceNote.upsert({
      where: { meetingId_userId: { meetingId: id, userId: d.userId } },
      create: { meetingId: id, userId: d.userId, excused: d.excused, note: d.note?.trim() || null, updatedById: session.user.id },
      update: { excused: d.excused, note: d.note?.trim() || null, updatedById: session.user.id },
    });
    await audit({ action: "ATTENDANCE_CORRECTED", description: `Zmieniono usprawiedliwienie/uwagi do obecności`, meetingId: id, userId: session.user.id, metadata: { userId: d.userId, excused: d.excused } }, tx);
  });
  return NextResponse.json({ ok: true });
}
