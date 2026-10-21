import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";

/** Powiadomienia w aplikacji zalogowanej osoby (ostatnie 30 + liczba nowych). */
export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, kind: true, title: true, link: true, createdAt: true, readAt: true } }),
    prisma.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread });
}

const schema = z.object({ ids: z.array(z.string().max(64)).max(200).optional(), all: z.boolean().optional() });

/** POST - oznaczenie powiadomień jako przejrzanych (własnych). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null, ...(parsed.data.all ? {} : { id: { in: parsed.data.ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
