import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";

const schema = z.object({
  kind: z.enum(["PERSON", "INSTITUTION"]).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  functionTitle: z.string().trim().max(200).optional().nullable(),
  institution: z.string().trim().max(300).optional().nullable(),
  address: z.string().trim().max(1000).optional().nullable(),
  email: z.string().trim().max(254).optional().nullable().refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Nieprawidłowy adres e-mail."),
  salutation: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional(),
});

/** Zmiana kontaktu. Dokumenty już utworzone zachowują dane z chwili utworzenia (migawka adresatów). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const cur = await prisma.contact.findUnique({ where: { id } });
  if (!cur) return new NextResponse("Nie znaleziono kontaktu", { status: 404 });
  const d = parsed.data;
  const clean = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "string" ? (v || (k === "name" ? v : null)) : v]));
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id }, data: clean });
    await audit({ action: "CONTACT_CHANGED", description: `Zmieniono kontakt: ${d.name ?? cur.name}`, userId: session.user.id, metadata: { contactId: id, fields: Object.keys(d) } }, tx);
  });
  return NextResponse.json({ ok: true });
}

/** Usunięcie kontaktu nie zmienia dokumentów, w których był adresatem (mają własną migawkę danych). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const cur = await prisma.contact.findUnique({ where: { id } });
  if (!cur) return new NextResponse("Nie znaleziono kontaktu", { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.contact.delete({ where: { id } });
    await audit({ action: "CONTACT_CHANGED", description: `Usunięto kontakt: ${cur.name}`, userId: session.user.id, metadata: { contactId: id } }, tx);
  });
  return NextResponse.json({ ok: true });
}
