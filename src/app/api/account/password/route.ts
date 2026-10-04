import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { refreshUserSessionsCache, revokeUserSessions } from "@/lib/sessions";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nowe hasło musi mieć co najmniej 8 znaków." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return new NextResponse("Not found", { status: 404 });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Obecne hasło jest nieprawidłowe." }, { status: 400 });
  }

  const sameAsOld = await bcrypt.compare(parsed.data.newPassword, user.passwordHash);
  if (sameAsOld) {
    return NextResponse.json({ error: "Nowe hasło musi różnić się od obecnego." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
  // Zmiana hasła kończy pozostałe sesje tego konta (np. po wycieku hasła); bieżąca zostaje.
  const revoked = await revokeUserSessions(user.id, "password_changed", session.sid);
  await refreshUserSessionsCache(user.id);
  await audit({
    action: "PASSWORD_CHANGED",
    description: `Zmiana własnego hasła${user.mustChangePassword ? " (hasło startowe)" : ""}`,
    userId: user.id,
    metadata: { otherSessionsRevoked: revoked, forced: user.mustChangePassword },
  });

  return NextResponse.json({ ok: true });
}
