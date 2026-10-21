import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";

const KIND = z.enum(["UNCLASSIFIED", "BODY", "COMMITTEE", "TEAM", "OTHER"]);

const createSchema = z.object({
  name: z.string().trim().min(1, "Podaj nazwę grupy.").max(200),
  shortName: z.string().trim().max(40).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  kind: KIND.optional(),
  parentId: z.string().max(64).optional().nullable(),
  /** Powielenie składu istniejącej grupy (np. nowa komisja na bazie innej). */
  copyMembersFromId: z.string().max(64).optional().nullable(),
});

/** Lista grup organizacyjnych (operator: wszystkie; uczestnik: tylko nazwy aktywnych - do filtrów). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const all = new URL(req.url).searchParams.get("all") === "1";
  if (session.user.role !== "OPERATOR") {
    const units = await prisma.orgUnit.findMany({ where: { active: true }, select: { id: true, name: true, shortName: true, kind: true }, orderBy: { name: "asc" } });
    return NextResponse.json(units);
  }
  const units = await prisma.orgUnit.findMany({
    where: all ? {} : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { members: true, meetings: true } }, parent: { select: { id: true, name: true } } },
  });
  return NextResponse.json(units);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const { copyMembersFromId, ...data } = parsed.data;
  const unit = await prisma.$transaction(async (tx) => {
    const u = await tx.orgUnit.create({ data: { ...data, shortName: data.shortName || null, description: data.description || null, parentId: data.parentId || null } });
    if (copyMembersFromId) {
      const src = await tx.orgUnitMember.findMany({ where: { orgUnitId: copyMembersFromId } });
      if (src.length) await tx.orgUnitMember.createMany({ data: src.map((m) => ({ orgUnitId: u.id, userId: m.userId, functionName: m.functionName, defaultVotingRight: m.defaultVotingRight, validFrom: m.validFrom, validTo: m.validTo })) });
    }
    await audit({ action: "ORG_UNIT_CHANGED", description: `Utworzono grupę organizacyjną „${u.name}”`, userId: session.user.id, metadata: { orgUnitId: u.id, copyMembersFromId: copyMembersFromId ?? null } }, tx);
    return u;
  });
  return NextResponse.json({ ok: true, id: unit.id });
}
