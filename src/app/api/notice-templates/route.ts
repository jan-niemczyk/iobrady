import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { EMPTY_CONTENT, normalizeContent } from "@/lib/noticeText";

const schema = z.object({
  name: z.string().trim().min(1, "Podaj nazwę szablonu.").max(200),
  description: z.string().max(1000).optional().nullable(),
  orgUnitId: z.string().max(64).optional().nullable(),
  content: z.record(z.unknown()).optional(),
});

/** Szablony tekstów zawiadomień (operator). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const all = new URL(req.url).searchParams.get("all") === "1";
  const list = await prisma.noticeTemplate.findMany({ where: all ? {} : { active: true }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { orgUnit: { select: { id: true, name: true } } } });
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  const t = await prisma.$transaction(async (tx) => {
    const t = await tx.noticeTemplate.create({ data: { name: d.name, description: d.description || null, orgUnitId: d.orgUnitId || null, content: normalizeContent(d.content ?? EMPTY_CONTENT) as never, createdById: session.user.id } });
    await audit({ action: "NOTICE_TEMPLATE_CHANGED", description: `Utworzono szablon zawiadomienia „${t.name}”`, userId: session.user.id, metadata: { templateId: t.id } }, tx);
    return t;
  });
  return NextResponse.json({ ok: true, id: t.id });
}
