import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";

/** Powielenie szablonu (kopia treści, nowa nazwa, nie domyślny). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const t = await prisma.noticeTemplate.findUnique({ where: { id } });
  if (!t) return new NextResponse("Nie znaleziono szablonu", { status: 404 });
  const copy = await prisma.$transaction(async (tx) => {
    const c = await tx.noticeTemplate.create({ data: { name: `${t.name} (kopia)`.slice(0, 200), description: t.description, orgUnitId: t.orgUnitId, content: t.content as never, createdById: session.user.id } });
    await audit({ action: "NOTICE_TEMPLATE_CHANGED", description: `Powielono szablon „${t.name}”`, userId: session.user.id, metadata: { from: id, templateId: c.id } }, tx);
    return c;
  });
  return NextResponse.json({ ok: true, id: copy.id });
}
