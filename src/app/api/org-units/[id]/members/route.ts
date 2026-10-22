import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";

const dateish = z.string().max(40).optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Nieprawidłowa data.");
const schema = z.object({
  userIds: z.array(z.string().max(64)).min(1).max(2000),
  functionName: z.string().trim().max(120).optional().nullable(),
  defaultVotingRight: z.boolean().optional(),
  validFrom: dateish,
  validTo: dateish,
});

/** Dodaje osoby do składu grupy (osoba z otwartym członkostwem nie jest dodawana drugi raz). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const unit = await prisma.orgUnit.findUnique({ where: { id }, select: { name: true } });
  if (!unit) return new NextResponse("Nie znaleziono grupy", { status: 404 });
  const d = parsed.data;
  const open = new Set((await prisma.orgUnitMember.findMany({ where: { orgUnitId: id, userId: { in: d.userIds }, validTo: null }, select: { userId: true } })).map((m) => m.userId));
  const users = await prisma.user.findMany({ where: { id: { in: d.userIds }, role: { not: "RESPONDER" } }, select: { id: true } });
  const toAdd = users.map((u) => u.id).filter((uid) => !open.has(uid));
  await prisma.$transaction(async (tx) => {
    if (toAdd.length) {
      await tx.orgUnitMember.createMany({
        data: toAdd.map((userId) => ({
          orgUnitId: id, userId, functionName: d.functionName || null, defaultVotingRight: d.defaultVotingRight ?? true,
          validFrom: d.validFrom ? new Date(d.validFrom) : null, validTo: d.validTo ? new Date(d.validTo) : null,
        })),
      });
    }
    await audit({ action: "ORG_UNIT_CHANGED", description: `Dodano do składu „${unit.name}”: ${toAdd.length} os.`, userId: session.user.id, metadata: { orgUnitId: id, userIds: toAdd } }, tx);
  });
  return NextResponse.json({ ok: true, added: toAdd.length, skipped: d.userIds.length - toAdd.length });
}
