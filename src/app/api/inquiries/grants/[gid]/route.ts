import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";

/** DELETE - odebranie prawa. Działa natychmiast także przy istniejącej sesji (sprawdzane per żądanie). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ gid: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { gid } = await ctx.params;
  const g = await prisma.inquiryGrant.findUnique({ where: { id: gid }, include: { user: { select: { firstName: true, lastName: true } }, orgUnit: { select: { name: true } } } });
  if (!g) return new NextResponse("Nie znaleziono", { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.inquiryGrant.delete({ where: { id: gid } });
    await audit({ action: "INQUIRY_RIGHT_REVOKED", description: `Odebrano prawo składania interpelacji i zapytań: ${g.user.firstName} ${g.user.lastName}${g.orgUnit ? ` (zakres: ${g.orgUnit.name})` : ""}`, userId: session.user.id, metadata: { targetUserId: g.userId, orgUnitId: g.orgUnitId } }, tx);
  });
  return NextResponse.json({ ok: true });
}
