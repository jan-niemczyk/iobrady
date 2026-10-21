import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { visibleWhere } from "@/lib/info";

/** Liczba nieprzeczytanych (bieżąca wersja nieotwarta) komunikatów radnego. */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "PARTICIPANT") return NextResponse.json({ unread: 0 });
  const where = await visibleWhere(session.user.id);
  const posts = await prisma.infoPost.findMany({ where, select: { version: true, reads: { where: { userId: session.user.id }, select: { version: true } } } });
  return NextResponse.json({ unread: posts.filter((p) => !p.reads.some((r) => r.version === p.version)).length });
}
