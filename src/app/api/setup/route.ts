import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { validationError } from "@/lib/http";
import { checkSetupToken } from "@/lib/setupToken";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(100).default("Operator"),
  lastName: z.string().min(1).max(100).default("Systemu"),
  organizationName: z.string().min(1).max(200),
  setupToken: z.string().max(200).optional(),
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
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  // SA-09: kod instalacyjny (log serwera / SETUP_TOKEN) - bez niego obcy nie przejmie świeżej instalacji.
  if (!checkSetupToken(d.setupToken))
    return new NextResponse("Nieprawidłowy kod instalacyjny (znajdziesz go w logu serwera lub w SETUP_TOKEN).", { status: 403 });

  const passwordHash = await bcrypt.hash(d.password, 10);
  // Atomowo: blokada transakcyjna + ponowne sprawdzenie pod blokadą - dwa równoległe żądania
  // nie utworzą dwóch operatorów.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7342019)`;
    const cur = await tx.settings.findUnique({ where: { id: "singleton" } });
    if (cur?.setupComplete) return "done" as const;
    const existing = await tx.user.findUnique({ where: { email: d.email } });
    if (existing) return "exists" as const;
    await tx.user.create({
      data: { email: d.email, passwordHash, firstName: d.firstName, lastName: d.lastName, role: Role.OPERATOR },
    });
    await tx.settings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", organizationName: d.organizationName, setupComplete: true },
      update: { organizationName: d.organizationName, setupComplete: true },
    });
    return "ok" as const;
  });
  if (result === "done") return new NextResponse("Konfiguracja została już ukończona", { status: 403 });
  if (result === "exists") return new NextResponse("Konto z tym adresem e-mail już istnieje", { status: 400 });

  return NextResponse.json({ ok: true });
}
