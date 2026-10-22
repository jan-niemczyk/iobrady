import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { guarded } from "@/lib/routeGuard";
import { HttpError } from "@/lib/booth";
import { randomPassword } from "@/lib/randomPassword";
import { revokeUserSessions } from "@/lib/sessions";

const schema = z.object({ active: z.boolean().optional(), resetPassword: z.boolean().optional(), functionTitle: z.string().trim().max(120).nullable().optional() });

/** PATCH - aktywacja/dezaktywacja (z natychmiastowym wylogowaniem) albo nowe hasło startowe. */
export async function PATCH(req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { uid } = await ctx.params;
  return guarded("responder patch", async () => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u || u.role !== "RESPONDER") throw new HttpError(404, "Nie znaleziono");
    const d = parsed.data;
    const password = d.resetPassword ? randomPassword() : null;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: uid }, data: {
        ...(d.active !== undefined ? { active: d.active } : {}),
        ...(d.functionTitle !== undefined ? { functionTitle: d.functionTitle || null } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } : {}),
      } });
      await audit({ action: "USER_UPDATED", description: `${d.active === false ? "Dezaktywowano" : d.active === true ? "Aktywowano" : password ? "Nowe hasło startowe" : "Zmieniono"}: konto odpowiadającego ${u.firstName} ${u.lastName}`, userId: session.user.id, metadata: { targetUserId: uid } }, tx);
    });
    if (d.active === false || password) await revokeUserSessions(uid, d.active === false ? "deactivated" : "password-reset");
    return NextResponse.json({ ok: true, password });
  });
}
