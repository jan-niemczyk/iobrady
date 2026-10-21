import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";

const schema = z.object({
  kind: z.enum(["PERSON", "INSTITUTION"]).optional(),
  name: z.string().trim().min(1, "Podaj imię i nazwisko albo nazwę.").max(200),
  functionTitle: z.string().trim().max(200).optional().nullable(),
  institution: z.string().trim().max(300).optional().nullable(),
  address: z.string().trim().max(1000).optional().nullable(),
  email: z.string().trim().max(254).optional().nullable().refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Nieprawidłowy adres e-mail."),
  salutation: z.string().trim().max(120).optional().nullable(),
});

/** Słownik kontaktów bez konta (adresaci pism i informacji). Tylko operator. */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await prisma.contact.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  const c = await prisma.$transaction(async (tx) => {
    const c = await tx.contact.create({ data: { kind: d.kind ?? "PERSON", name: d.name, functionTitle: d.functionTitle || null, institution: d.institution || null, address: d.address || null, email: d.email || null, salutation: d.salutation || null } });
    await audit({ action: "CONTACT_CHANGED", description: `Dodano kontakt: ${c.name}`, userId: session.user.id, metadata: { contactId: c.id } }, tx);
    return c;
  });
  return NextResponse.json({ ok: true, id: c.id });
}
