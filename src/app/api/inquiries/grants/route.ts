import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";

/** GET - nadane prawa „Składanie interpelacji i zapytań” (operator; odczyt także przy wyłączonym module). */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const grants = await prisma.inquiryGrant.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, firstName: true, lastName: true, active: true } }, orgUnit: { select: { id: true, name: true } } },
  });
  const by = await prisma.user.findMany({ where: { id: { in: grants.map((g) => g.grantedById).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } });
  return NextResponse.json(grants.map((g) => ({
    id: g.id, userId: g.userId, name: `${g.user.lastName} ${g.user.firstName}`, active: g.user.active, orgUnit: g.orgUnit, createdAt: g.createdAt,
    grantedBy: (() => { const u = by.find((x) => x.id === g.grantedById); return u ? `${u.firstName} ${u.lastName}` : null; })(),
  })));
}

const schema = z.object({ userId: z.string().min(1).max(64), orgUnitId: z.string().max(64).nullable().optional() });

/**
 * POST - nadanie prawa (operator = osoba zarządzająca dostępem). Prawo nie wynika z roli ani
 * członkostwa - jest nadawane indywidualnie, opcjonalnie w zakresie grupy (organu).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  return guarded("inquiry grant POST", async () => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const { userId, orgUnitId } = parsed.data;
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, role: true, active: true } });
    if (!u || u.role !== "PARTICIPANT") throw new HttpError(400, "Prawo nadaje się kontom uczestników.");
    if (!u.active) throw new HttpError(400, "Konto jest nieaktywne.");
    const unit = orgUnitId ? await prisma.orgUnit.findUnique({ where: { id: orgUnitId }, select: { name: true } }) : null;
    if (orgUnitId && !unit) throw new HttpError(400, "Nie znaleziono grupy.");
    if (await prisma.inquiryGrant.findFirst({ where: { userId, orgUnitId: orgUnitId || null } })) throw new HttpError(409, "To prawo jest już nadane.");
    await prisma.$transaction(async (tx) => {
      await tx.inquiryGrant.create({ data: { userId, orgUnitId: orgUnitId || null, grantedById: session.user.id } });
      await audit({ action: "INQUIRY_RIGHT_GRANTED", description: `Nadano prawo składania interpelacji i zapytań: ${u.firstName} ${u.lastName}${unit ? ` (zakres: ${unit.name})` : ""}`, userId: session.user.id, metadata: { targetUserId: userId, orgUnitId: orgUnitId || null } }, tx);
    });
    return NextResponse.json({ ok: true });
  });
}
