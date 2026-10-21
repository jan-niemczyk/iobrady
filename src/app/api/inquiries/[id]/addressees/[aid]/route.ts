import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled } from "@/lib/inquiryAccess";
import { dueFromRule, refreshStatus } from "@/lib/inquiries";

const date = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "Nieprawidłowa data.");
const schema = z.object({
  /** Jawny wpis przekazania dokonanego poza aplikacją (zapis w aplikacji nie potwierdza wysyłki). */
  forwardedAt: date.nullable().optional(),
  forwardNote: z.string().trim().max(1000).nullable().optional(),
  /** Termin ręczny; "rule" = z reguły jednostki (jeśli jest); null = nieustalony. */
  dueDate: z.union([date, z.literal("rule")]).nullable().optional(),
});

/** PATCH - przekazanie adresatowi i termin odpowiedzi (operator). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id, aid } = await ctx.params;
  return guarded("inquiry addressee PATCH", async () => {
    await requireModuleEnabled();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    const a = await prisma.inquiryAddressee.findFirst({ where: { id: aid, caseId: id }, include: { case: { select: { title: true, kind: true, receivedAt: true, registeredAt: true } } } });
    if (!a) throw new HttpError(404, "Nie znaleziono");
    if (d.forwardedAt && !a.case.registeredAt) throw new HttpError(409, "Przekazanie odnotowuje się po rejestracji sprawy.");
    const forwardedAt = d.forwardedAt !== undefined ? (d.forwardedAt ? new Date(d.forwardedAt) : null) : a.forwardedAt;
    let dueDate = a.dueDate;
    if (d.dueDate === "rule") dueDate = forwardedAt ? await dueFromRule(a.case.kind, forwardedAt, a.case.receivedAt) : null;
    else if (d.dueDate !== undefined) dueDate = d.dueDate ? new Date(d.dueDate) : null;
    await prisma.$transaction(async (tx) => {
      await tx.inquiryAddressee.update({ where: { id: aid }, data: { forwardedAt, dueDate, ...(d.forwardNote !== undefined ? { forwardNote: d.forwardNote || null } : {}) } });
      await refreshStatus(tx, id);
      await audit({ action: "INQUIRY_CHANGED", description: `${forwardedAt && !a.forwardedAt ? "Odnotowano przekazanie" : "Zmieniono przekazanie/termin"}: ${a.name} - sprawa „${a.case.title}”`, userId: session.user.id, metadata: { caseId: id, addresseeId: aid, forwardedAt, dueDate } }, tx);
    });
    return NextResponse.json({ ok: true, dueDate });
  });
}
