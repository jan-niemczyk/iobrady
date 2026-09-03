import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { comparePl } from "@/lib/sortPl";

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.string().max(200).nullable().optional(),
  clubShort: z.string().max(50).nullable().optional(),
});

// GET /api/guests?q=... - lista gości (opcjonalnie filtr po nazwisku)
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const guests = await prisma.guest.findMany();
  const filtered = q
    ? guests.filter((g) => `${g.firstName} ${g.lastName} ${g.role ?? ""}`.toLowerCase().includes(q))
    : guests;
  filtered.sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  return NextResponse.json({ guests: filtered });
}

// POST /api/guests - dodaj gościa do katalogu
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad: ${parsed.error.message}`, { status: 400 });

  const guest = await prisma.guest.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: parsed.data.role ?? null,
      clubShort: parsed.data.clubShort ?? null,
    },
  });

  return NextResponse.json({ ok: true, guest });
}
