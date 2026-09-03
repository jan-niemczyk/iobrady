import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

const schema = z.object({
  userIds: z.array(z.string()).min(1),
});

// Alfabet bez znaków mylących (0/O, 1/l/I) - hasło łatwe do przepisania z odcinka.
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
function randomPassword(len = 8): string {
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}

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
  if (!parsed.success) return new NextResponse(`Bad: ${parsed.error.message}`, { status: 400 });

  const users = await prisma.user.findMany({
    where: { id: { in: parsed.data.userIds } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const cards: { name: string; email: string; password: string }[] = [];
  for (const u of users) {
    const password = randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash } });
    cards.push({ name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, password });
  }

  await audit({
    action: "SETTINGS_CHANGED",
    description: `Zresetowano hasła dla ${cards.length} kont (odcinki logowania)`,
    userId: session.user.id,
    metadata: { count: cards.length },
  });

  return NextResponse.json({ cards });
}
