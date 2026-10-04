import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { audit } from "@/lib/audit";
import { revokeUserSessions } from "@/lib/sessions";
import { validationError } from "@/lib/http";

const patchSchema = z.object({
  email: z.string().email().toLowerCase().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  functionTitle: z.string().max(120).nullable().optional(),
  role: z.nativeEnum(Role).optional(),
  groupId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) return new NextResponse("Not found", { status: 404 });
  // Ochrona przed odcięciem się: operator nie odbiera sobie roli ani nie dezaktywuje własnego konta.
  if (id === session.user.id && ((parsed.data.role && parsed.data.role !== "OPERATOR") || parsed.data.active === false))
    return new NextResponse("Nie możesz odebrać sobie roli operatora ani dezaktywować własnego konta.", { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.firstName !== undefined) data.firstName = parsed.data.firstName;
  if (parsed.data.lastName !== undefined) data.lastName = parsed.data.lastName;
  if (parsed.data.functionTitle !== undefined) data.functionTitle = parsed.data.functionTitle;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.groupId !== undefined) data.groupId = parsed.data.groupId;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
    // Hasło nadane przez operatora innej osobie = hasło startowe (zmiana przy logowaniu).
    data.mustChangePassword = id !== session.user.id;
  }

  await prisma.user.update({ where: { id }, data });

  // Zmiana roli, dezaktywacja lub nowe hasło: natychmiastowe unieważnienie sesji konta (SA-04).
  const roleChanged = parsed.data.role !== undefined && parsed.data.role !== before.role;
  const deactivated = parsed.data.active === false && before.active;
  let revoked = 0;
  if (roleChanged || deactivated || parsed.data.password) {
    revoked = await revokeUserSessions(id, roleChanged ? "role_changed" : deactivated ? "deactivated" : "password_reset",
      id === session.user.id ? session.sid : null);
  }

  const changed = Object.keys(data).filter((k) => k !== "passwordHash" && k !== "mustChangePassword");
  if (parsed.data.password) changed.push("password");
  await audit({
    action: deactivated ? "USER_DEACTIVATED" : "USER_UPDATED",
    description: `Zmieniono konto ${before.firstName} ${before.lastName}: ${changed.join(", ") || "bez zmian"}`,
    userId: session.user.id,
    metadata: {
      targetUserId: id, fields: changed, sessionsRevoked: revoked,
      ...(roleChanged ? { roleFrom: before.role, roleTo: parsed.data.role } : {}),
      ...(parsed.data.active !== undefined ? { activeFrom: before.active, activeTo: parsed.data.active } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  if (id === session.user.id)
    return new NextResponse("Nie możesz usunąć siebie", { status: 400 });

  const before = await prisma.user.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
  if (!before) return new NextResponse("Not found", { status: 404 });
  // Soft-delete: deaktywacja zamiast usuwania (zachowanie integralności audytu i historii głosowań)
  await prisma.user.update({ where: { id }, data: { active: false } });
  const revoked = await revokeUserSessions(id, "deactivated");
  await audit({
    action: "USER_DEACTIVATED",
    description: `Dezaktywowano konto ${before.firstName} ${before.lastName}`,
    userId: session.user.id,
    metadata: { targetUserId: id, sessionsRevoked: revoked },
  });
  return NextResponse.json({ ok: true, message: "Użytkownik dezaktywowany" });
}
