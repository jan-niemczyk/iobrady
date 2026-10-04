import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomPassword } from "@/lib/randomPassword";
import { sendMail } from "@/lib/mail";
import { welcomeEmail } from "@/lib/mailTemplates";
import { appOrigin, validationError } from "@/lib/http";

/**
 * POST /api/users/import
 * Body: { rows: [{ firstName, lastName, email, role?, groupName?, groupShort? }] }
 *
 * Tworzy użytkowników z losowymi hasłami. Zwraca tabelę z hasłami (jednorazowo!)
 * - operator ma je przekazać użytkownikom.
 *
 * Pola obowiązkowe: firstName, lastName, email.
 * Opcjonalne: role (default PARTICIPANT), groupName + groupShort (klub).
 */

const rowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  // Rola konta: OPERATOR / PARTICIPANT. Przewodniczący to funkcja w posiedzeniu (BR-5) - nie rola konta.
  role: z.string().optional(),
  groupName: z.string().optional(),
  groupShort: z.string().optional(),
});

const schema = z.object({
  rows: z.array(rowSchema).min(1),
  sendEmails: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const results: { email: string; name: string; password: string | null; status: "created" | "skipped" | "error"; error?: string }[] = [];
  const settings = parsed.data.sendEmails ? await prisma.settings.findUnique({ where: { id: "singleton" } }) : null;
  const loginUrl = `${appOrigin(req)}/login`;

  for (const row of parsed.data.rows) {
    const role = (row.role ?? "PARTICIPANT").trim().toUpperCase();
    if (role !== "OPERATOR" && role !== "PARTICIPANT") {
      results.push({
        email: row.email, name: `${row.firstName} ${row.lastName}`, password: null, status: "error",
        error: role === "CHAIRPERSON"
          ? "Rola CHAIRPERSON nie istnieje - przewodniczącego wskazuje się w posiedzeniu"
          : "Nieznana rola (dozwolone: OPERATOR, PARTICIPANT)",
      });
      continue;
    }
    try {
      const existing = await prisma.user.findUnique({ where: { email: row.email } });
      if (existing) {
        results.push({
          email: row.email,
          name: `${row.firstName} ${row.lastName}`,
          password: null,
          status: "skipped",
          error: "Email już istnieje",
        });
        continue;
      }

      // Obsługa grupy (klub) - utwórz jeśli podano
      let groupId: string | null = null;
      if (row.groupName) {
        const group = await prisma.group.upsert({
          where: { name: row.groupName },
          update: { shortName: row.groupShort ?? row.groupName.slice(0, 5).toUpperCase() },
          create: { name: row.groupName, shortName: row.groupShort ?? row.groupName.slice(0, 5).toUpperCase(), color: null },
        });
        groupId = group.id;
      }

      const password = randomPassword();
      const passwordHash = await bcrypt.hash(password, 10);

      await prisma.user.create({
        data: {
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          passwordHash,
          role,
          groupId,
          active: true,
          mustChangePassword: true, // hasło startowe - zmiana przy pierwszym logowaniu
        },
      });

      results.push({
        email: row.email,
        name: `${row.firstName} ${row.lastName}`,
        password,
        status: "created",
      });

      if (parsed.data.sendEmails) {
        const { subject, html } = welcomeEmail({
          orgName: settings?.organizationName ?? "iOBRADY",
          firstName: row.firstName, lastName: row.lastName, email: row.email, password, loginUrl,
        });
        await sendMail({ to: row.email, subject, html, kind: "welcome", sentByUserId: session.user.id }).catch(() => {});
      }
    } catch (e) {
      console.error("[users/import]", e);
      results.push({
        email: row.email,
        name: `${row.firstName} ${row.lastName}`,
        password: null,
        status: "error",
        error: "Nie udało się utworzyć konta",
      });
    }
  }

  const createdCount = results.filter((r) => r.status === "created").length;
  await audit({
    action: "USER_CREATED",
    description: `Import użytkowników: utworzono ${createdCount} z ${parsed.data.rows.length}`,
    userId: session.user.id,
    metadata: { totalRows: parsed.data.rows.length, createdCount },
  });

  return NextResponse.json({ results });
}
