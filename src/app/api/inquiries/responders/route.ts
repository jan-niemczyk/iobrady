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

/** GET - konta odpowiadających (operator). */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const users = await prisma.user.findMany({ where: { role: "RESPONDER" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, email: true, firstName: true, lastName: true, functionTitle: true, active: true } });
  const counts = await prisma.inquiryAddressee.groupBy({ by: ["responderUserId"], where: { responderUserId: { in: users.map((u) => u.id) } }, _count: true });
  return NextResponse.json(users.map((u) => ({ ...u, cases: counts.find((c) => c.responderUserId === u.id)?._count ?? 0 })));
}

const schema = z.object({
  email: z.string().trim().max(254).email("Podaj poprawny adres e-mail.").toLowerCase(),
  firstName: z.string().trim().min(1, "Podaj imię.").max(100),
  lastName: z.string().trim().min(1, "Podaj nazwisko.").max(100),
  functionTitle: z.string().trim().max(120).nullable().optional(),
});

/**
 * POST - nowe konto odpowiadającego z hasłem startowym (zmiana przy pierwszym logowaniu).
 * Hasło zwracane jednorazowo w odpowiedzi - nie jest nigdzie zapisywane jawnie.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  return guarded("responder create", async () => {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;
    if (await prisma.user.findUnique({ where: { email: d.email } })) throw new HttpError(409, "Konto z tym adresem e-mail już istnieje.");
    const password = randomPassword();
    const u = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email: d.email, firstName: d.firstName, lastName: d.lastName, functionTitle: d.functionTitle || null, role: "RESPONDER", passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
      await audit({ action: "USER_CREATED", description: `Utworzono konto odpowiadającego ${u.firstName} ${u.lastName}`, userId: session.user.id, metadata: { targetUserId: u.id, role: "RESPONDER" } }, tx);
      return u;
    });
    return NextResponse.json({ ok: true, id: u.id, password });
  });
}
