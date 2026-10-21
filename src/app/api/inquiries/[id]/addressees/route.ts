import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled } from "@/lib/inquiryAccess";
import { refreshStatus } from "@/lib/inquiries";

const schema = z.object({ name: z.string().trim().min(1).max(300), institution: z.string().trim().max(300).optional().nullable() });

/** POST - dodanie adresata do złożonej sprawy (operator, np. przekazanie także innemu podmiotowi). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("inquiry addressee POST", async () => {
    await requireModuleEnabled();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const c = await prisma.inquiryCase.findUnique({ where: { id }, select: { title: true, status: true, enteredById: true, _count: { select: { addressees: true } } } });
    if (!c || (c.status === "DRAFT" && !c.enteredById)) throw new HttpError(404, "Nie znaleziono");
    await prisma.$transaction(async (tx) => {
      await tx.inquiryAddressee.create({ data: { caseId: id, name: parsed.data.name, institution: parsed.data.institution || null, order: c._count.addressees } });
      await refreshStatus(tx, id);
      await audit({ action: "INQUIRY_CHANGED", description: `Dodano adresata „${parsed.data.name}” w sprawie „${c.title}”`, userId: session.user.id, metadata: { caseId: id } }, tx);
    });
    return NextResponse.json({ ok: true });
  });
}
