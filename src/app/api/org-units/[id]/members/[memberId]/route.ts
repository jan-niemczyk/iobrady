import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";

const dateish = z.string().max(40).optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Nieprawidłowa data.");
const schema = z.object({
  functionName: z.string().trim().max(120).optional().nullable(),
  defaultVotingRight: z.boolean().optional(),
  validFrom: dateish,
  validTo: dateish,
});

async function load(id: string, memberId: string) {
  const m = await prisma.orgUnitMember.findUnique({ where: { id: memberId }, include: { orgUnit: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } } });
  return m && m.orgUnitId === id ? m : null;
}

/** Zmiana funkcji, domyślnego prawa głosu albo okresu członkostwa (zakończenie = data „do"). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id, memberId } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const m = await load(id, memberId);
  if (!m) return new NextResponse("Nie znaleziono członkostwa", { status: 404 });
  const d = parsed.data;
  const validFrom = d.validFrom === undefined ? m.validFrom : d.validFrom ? new Date(d.validFrom) : null;
  const validTo = d.validTo === undefined ? m.validTo : d.validTo ? new Date(d.validTo) : null;
  if (validFrom && validTo && validTo < validFrom) return new NextResponse("Data końca członkostwa jest wcześniejsza niż początku.", { status: 400 });
  await prisma.$transaction(async (tx) => {
    await tx.orgUnitMember.update({
      where: { id: memberId },
      data: {
        ...(d.functionName !== undefined ? { functionName: d.functionName || null } : {}),
        ...(d.defaultVotingRight !== undefined ? { defaultVotingRight: d.defaultVotingRight } : {}),
        validFrom, validTo,
      },
    });
    await audit({ action: "ORG_UNIT_CHANGED", description: `Zmieniono członkostwo: ${m.user.lastName} ${m.user.firstName} w „${m.orgUnit.name}”`, userId: session.user.id, metadata: { orgUnitId: id, memberId, changes: d } }, tx);
  });
  return NextResponse.json({ ok: true });
}

/**
 * Usunięcie wpisu członkostwa (np. pomyłka). Zakończenie członkostwa z zachowaniem historii to
 * PATCH z datą „do". Zapisane posiedzenia i wyniki nie są zmieniane.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id, memberId } = await ctx.params;
  const m = await load(id, memberId);
  if (!m) return new NextResponse("Nie znaleziono członkostwa", { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.orgUnitMember.delete({ where: { id: memberId } });
    await audit({ action: "ORG_UNIT_CHANGED", description: `Usunięto wpis członkostwa: ${m.user.lastName} ${m.user.firstName} w „${m.orgUnit.name}”`, userId: session.user.id, metadata: { orgUnitId: id, memberId } }, tx);
  });
  return NextResponse.json({ ok: true });
}
