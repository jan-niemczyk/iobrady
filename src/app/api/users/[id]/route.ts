import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

const patchSchema = z.object({
  email: z.string().email().toLowerCase().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  functionTitle: z.string().max(120).nullable().optional(),
  role: z.nativeEnum(Role).optional(),
  groupId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.firstName !== undefined) data.firstName = parsed.data.firstName;
  if (parsed.data.lastName !== undefined) data.lastName = parsed.data.lastName;
  if (parsed.data.functionTitle !== undefined) data.functionTitle = parsed.data.functionTitle;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.groupId !== undefined) data.groupId = parsed.data.groupId;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  if (id === session.user.id)
    return new NextResponse("Nie możesz usunąć siebie", { status: 400 });

  // Soft-delete: deaktywacja zamiast usuwania (zachowanie integralności audytu i historii głosowań)
  await prisma.user.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true, message: "Użytkownik dezaktywowany" });
}
