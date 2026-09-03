import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  userIds: z.array(z.string()).min(1),
  groupId: z.string().nullable(), // null = usuń przynależność (niezrzeszeni)
});

/**
 * POST /api/users/bulk-group
 * Hurtowo przypisuje zaznaczone konta do wskazanej grupy/klubu (lub usuwa przynależność).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad: ${parsed.error.message}`, { status: 400 });

  const { userIds, groupId } = parsed.data;

  // Walidacja grupy (gdy podana).
  if (groupId) {
    const g = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!g) return new NextResponse("Nie znaleziono grupy", { status: 404 });
  }

  const res = await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { groupId: groupId },
  });

  await audit({
    action: "SETTINGS_CHANGED",
    description: `Hurtowo zmieniono przynależność klubową dla ${res.count} kont${groupId ? "" : " (usunięto przynależność)"}`,
    userId: session.user.id,
    metadata: { count: res.count, groupId },
  });

  return NextResponse.json({ updated: res.count });
}
