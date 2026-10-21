import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().trim().min(1, "Podaj nazwę grupy.").max(200).optional(),
  shortName: z.string().trim().max(40).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  kind: z.enum(["UNCLASSIFIED", "BODY", "COMMITTEE", "TEAM", "OTHER"]).optional(),
  parentId: z.string().max(64).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const unit = await prisma.orgUnit.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, active: true, group: { select: { shortName: true, name: true } } } } } },
      meetings: { include: { meeting: { select: { id: true, number: true, name: true, scheduledAt: true, status: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!unit) return new NextResponse("Nie znaleziono grupy", { status: 404 });
  return NextResponse.json(unit);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  if (d.parentId === id) return new NextResponse("Grupa nie może być swoim organem nadrzędnym.", { status: 400 });
  const cur = await prisma.orgUnit.findUnique({ where: { id } });
  if (!cur) return new NextResponse("Nie znaleziono grupy", { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.orgUnit.update({
      where: { id },
      data: {
        ...d,
        ...(d.shortName !== undefined ? { shortName: d.shortName || null } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.parentId !== undefined ? { parentId: d.parentId || null } : {}),
        ...(d.active !== undefined ? { archivedAt: d.active ? null : new Date() } : {}),
      },
    });
    const what = d.active === false ? "Zarchiwizowano" : d.active === true ? "Przywrócono" : "Zmieniono";
    await audit({ action: "ORG_UNIT_CHANGED", description: `${what} grupę organizacyjną „${d.name ?? cur.name}”`, userId: session.user.id, metadata: { orgUnitId: id, changes: d } }, tx);
  });
  return NextResponse.json({ ok: true });
}
