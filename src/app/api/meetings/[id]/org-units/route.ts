import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { applyOrgUnitsToMeeting, orgUnitDiff } from "@/lib/orgUnits";

/** Różnice między składem grup posiedzenia a jego uczestnikami (podgląd przed aktualizacją). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const diff = await orgUnitDiff(id);
  if (!diff) return new NextResponse("Nie znaleziono posiedzenia", { status: 404 });
  return NextResponse.json(diff);
}

const schema = z.object({
  /** link: przypisz grupę i wczytaj jej skład; unlink: usuń powiązanie (skład posiedzenia bez zmian);
      sync: dodaj brakujące osoby z przypisanych grup (świadoma aktualizacja). */
  action: z.enum(["link", "unlink", "sync"]),
  orgUnitIds: z.array(z.string().max(64)).max(50).optional().default([]),
});

const LOCKED = ["CLOSED", "ARCHIVED", "CANCELLED"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { status: true, scheduledAt: true, orgUnits: { select: { orgUnitId: true } } } });
  if (!meeting) return new NextResponse("Nie znaleziono posiedzenia", { status: 404 });
  const { action } = parsed.data;
  // Zakończone posiedzenia zachowują swój skład i prawa - zmiana grup ich nie przepisuje.
  if (action !== "unlink" && LOCKED.includes(meeting.status))
    return new NextResponse("Posiedzenie jest zakończone - jego skład nie jest aktualizowany ze składu grup.", { status: 409 });

  const result = await prisma.$transaction(async (tx) => {
    if (action === "unlink") {
      await tx.meetingOrgUnit.deleteMany({ where: { meetingId: id, orgUnitId: { in: parsed.data.orgUnitIds } } });
      await audit({ action: "ORG_UNIT_CHANGED", description: "Odłączono grupy od posiedzenia (skład posiedzenia bez zmian)", meetingId: id, userId: session.user.id, metadata: { orgUnitIds: parsed.data.orgUnitIds } }, tx);
      return { added: 0, skipped: 0, linked: 0 };
    }
    const ids = action === "sync" ? meeting.orgUnits.map((o) => o.orgUnitId) : parsed.data.orgUnitIds;
    const r = await applyOrgUnitsToMeeting(tx, id, ids, meeting.scheduledAt);
    await audit({
      action: "ORG_UNIT_CHANGED",
      description: action === "sync" ? `Uzupełniono skład posiedzenia ze składu grup: dodano ${r.added}` : `Przypisano grupy do posiedzenia: dodano ${r.added}, pominięto ${r.skipped} (już przypisani)`,
      meetingId: id, userId: session.user.id, metadata: { orgUnitIds: ids, ...r },
    }, tx);
    return r;
  });
  return NextResponse.json({ ok: true, ...result });
}
