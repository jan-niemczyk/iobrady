import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(100).default("Operator"),
  lastName: z.string().min(1).max(100).default("Systemu"),
  organizationName: z.string().min(1).max(200),
});

/**
 * POST /api/setup - kończy kreator pierwszego uruchomienia: zakłada pierwsze konto operatora
 * i zapisuje nazwę organizacji. Działa tylko dopóki Settings.setupComplete = false (nie wymaga
 * zalogowania - w tym momencie nie istnieje jeszcze żadne konto).
 */
export async function POST(req: Request) {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (settings?.setupComplete) return new NextResponse("Konfiguracja została już ukończona", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });
  const d = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) return new NextResponse("Konto z tym adresem e-mail już istnieje", { status: 400 });

  await prisma.$transaction([
    prisma.user.create({
      data: {
        email: d.email,
        passwordHash: await bcrypt.hash(d.password, 10),
        firstName: d.firstName,
        lastName: d.lastName,
        role: Role.OPERATOR,
      },
    }),
    prisma.settings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", organizationName: d.organizationName, setupComplete: true },
      update: { organizationName: d.organizationName, setupComplete: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
