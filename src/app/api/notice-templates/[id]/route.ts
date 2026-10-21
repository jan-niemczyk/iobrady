import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { normalizeContent } from "@/lib/noticeText";

const schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  orgUnitId: z.string().max(64).optional().nullable(),
  active: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  content: z.record(z.unknown()).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const t = await prisma.noticeTemplate.findUnique({ where: { id }, include: { orgUnit: { select: { id: true, name: true } } } });
  if (!t) return new NextResponse("Nie znaleziono szablonu", { status: 404 });
  return NextResponse.json(t);
}

/**
 * Zmiana szablonu. Zmiana treści podnosi numer wersji; zawiadomienia już utworzone mają własną
 * kopię treści i NIE są zmieniane. Ustawienie domyślnego wyłącza domyślność innych szablonów
 * w tym samym zakresie (jednostka albo ta sama grupa).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const cur = await prisma.noticeTemplate.findUnique({ where: { id } });
  if (!cur) return new NextResponse("Nie znaleziono szablonu", { status: 404 });
  const d = parsed.data;
  const scope = d.orgUnitId !== undefined ? (d.orgUnitId || null) : cur.orgUnitId;
  await prisma.$transaction(async (tx) => {
    if (d.isDefault === true) await tx.noticeTemplate.updateMany({ where: { orgUnitId: scope, NOT: { id } }, data: { isDefault: false } });
    await tx.noticeTemplate.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description || null } : {}),
        ...(d.orgUnitId !== undefined ? { orgUnitId: d.orgUnitId || null } : {}),
        ...(d.active !== undefined ? { active: d.active, ...(d.active ? {} : { isDefault: false }) } : {}),
        ...(d.isDefault !== undefined ? { isDefault: d.isDefault } : {}),
        ...(d.content ? { content: normalizeContent(d.content) as never, version: { increment: 1 } } : {}),
      },
    });
    const what = d.active === false ? "Zarchiwizowano" : d.active === true ? "Przywrócono" : "Zmieniono";
    await audit({ action: "NOTICE_TEMPLATE_CHANGED", description: `${what} szablon zawiadomienia „${d.name ?? cur.name}”${d.content ? ` (wersja ${cur.version + 1})` : ""}`, userId: session.user.id, metadata: { templateId: id, fields: Object.keys(d) } }, tx);
  });
  return NextResponse.json({ ok: true });
}
