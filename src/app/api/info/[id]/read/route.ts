import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { canViewPost } from "@/lib/info";

/**
 * POST - zapis otwarcia treści bieżącej wersji przez radnego (pierwsze i ostatnie otwarcie,
 * liczba otwarć). Wywoływane wyłącznie z widoku treści, nie z listy. To ewidencja otwarć
 * w aplikacji - nie dowód zapoznania się ani formalnego doręczenia.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "PARTICIPANT") return NextResponse.json({ ok: true, recorded: false });
  const { id } = await ctx.params;
  if (!(await canViewPost(session.user, id))) return new NextResponse("Nie znaleziono", { status: 404 });
  const p = await prisma.infoPost.findUnique({ where: { id }, select: { version: true } });
  if (!p) return new NextResponse("Nie znaleziono", { status: 404 });
  const now = new Date();
  await prisma.infoRead.upsert({
    where: { postId_userId_version: { postId: id, userId: session.user.id, version: p.version } },
    create: { postId: id, userId: session.user.id, version: p.version, firstOpenedAt: now, lastOpenedAt: now },
    update: { lastOpenedAt: now, openCount: { increment: 1 } },
  });
  // Powiadomienia o tym komunikacie przestają być nowe.
  await prisma.notification.updateMany({ where: { userId: session.user.id, readAt: null, link: `/session/informacje/${id}` }, data: { readAt: now } });
  return NextResponse.json({ ok: true, recorded: true, version: p.version });
}
