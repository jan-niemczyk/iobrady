import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomPassword } from "@/lib/randomPassword";
import { sendMail } from "@/lib/mail";
import { passwordResetEmail } from "@/lib/mailTemplates";
import { appOrigin, validationError } from "@/lib/http";
import { revokeUserSessions } from "@/lib/sessions";

const schema = z.object({
  userIds: z.array(z.string()).min(1),
  sendEmails: z.boolean().optional().default(false),
});

/**
 * POST /api/users/reset-passwords
 * Nadaje NOWE hasła zaznaczonym kontom i zwraca je jednorazowo (do wydruku odcinków).
 * System przechowuje wyłącznie hash - starych haseł nie da się odczytać, dlatego przy
 * generowaniu odcinków dla istniejących kont trzeba hasła zresetować.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const users = await prisma.user.findMany({
    where: { id: { in: parsed.data.userIds } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const cards: { name: string; email: string; password: string }[] = [];
  const settings = parsed.data.sendEmails ? await prisma.settings.findUnique({ where: { id: "singleton" } }) : null;
  const loginUrl = `${appOrigin(req)}/login`;
  for (const u of users) {
    const password = randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash, mustChangePassword: true } });
    // Nowe hasło startowe kończy dotychczasowe sesje konta.
    await revokeUserSessions(u.id, "password_reset");
    cards.push({ name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, password });

    if (parsed.data.sendEmails) {
      const { subject, html } = passwordResetEmail({
        orgName: settings?.organizationName ?? "iOBRADY",
        firstName: u.firstName, lastName: u.lastName, email: u.email, password, loginUrl,
      });
      await sendMail({ to: u.email, subject, html, kind: "password_reset", sentByUserId: session.user.id }).catch(() => {});
    }
  }

  await audit({
    action: "USER_UPDATED",
    description: `Zresetowano hasła dla ${cards.length} kont (odcinki logowania)`,
    userId: session.user.id,
    metadata: { count: cards.length, userIds: users.map((u) => u.id), fields: ["password"] },
  });

  return NextResponse.json({ cards });
}
