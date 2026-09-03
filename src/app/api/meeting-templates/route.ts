import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  // opcjonalnie od razu członkowie
  memberUserIds: z.array(z.string()).optional(),
});

// GET /api/meeting-templates - lista szablonów z liczbą członków
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const templates = await prisma.meetingTemplate.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        include: { user: { include: { group: true } } },
      },
    },
  });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      memberCount: t.members.length,
      members: t.members.map((m) => ({
        userId: m.userId,
        name: `${m.user.firstName} ${m.user.lastName}`,
        groupShort: m.user.group?.shortName ?? null,
        hasVotingRight: m.hasVotingRight,
      })),
    })),
  });
}

// POST /api/meeting-templates - utwórz szablon
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad: ${parsed.error.message}`, { status: 400 });

  const existing = await prisma.meetingTemplate.findUnique({ where: { name: parsed.data.name } });
  if (existing) return new NextResponse("Szablon o tej nazwie już istnieje", { status: 409 });

  const template = await prisma.meetingTemplate.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      members: parsed.data.memberUserIds?.length
        ? { create: parsed.data.memberUserIds.map((userId) => ({ userId })) }
        : undefined,
    },
  });

  return NextResponse.json({ ok: true, templateId: template.id });
}
