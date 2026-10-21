import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { requireModuleEnabled } from "@/lib/inquiryAccess";

const schema = z.object({ published: z.boolean().optional(), publicTitle: z.string().trim().max(500).nullable().optional() });

/**
 * PATCH - publikacja sprawy w rejestrze publicznym (operator). Zapis roboczy ani złożenie nie
 * publikują niczego automatycznie; pisma publikuje się osobno, w wersji publicznej.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("inquiry publication", async () => {
    await requireModuleEnabled();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const c = await prisma.inquiryCase.findUnique({ where: { id }, select: { title: true, registeredAt: true, publishedAt: true } });
    if (!c) throw new HttpError(404, "Nie znaleziono");
    if (parsed.data.published && !c.registeredAt) throw new HttpError(409, "Publikuje się sprawy zarejestrowane.");
    await prisma.$transaction(async (tx) => {
      await tx.inquiryCase.update({ where: { id }, data: {
        ...(parsed.data.publicTitle !== undefined ? { publicTitle: parsed.data.publicTitle || null } : {}),
        ...(parsed.data.published !== undefined ? { published: parsed.data.published, ...(parsed.data.published && !c.publishedAt ? { publishedAt: new Date() } : {}) } : {}),
      } });
      await audit({ action: "INQUIRY_CHANGED", description: `${parsed.data.published === true ? "Opublikowano" : parsed.data.published === false ? "Wycofano z publikacji" : "Zmieniono tytuł publiczny"} sprawę „${c.title}”`, userId: session.user.id, metadata: { caseId: id } }, tx);
    });
    return NextResponse.json({ ok: true });
  });
}
