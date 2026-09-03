import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  number: z.string().max(20).optional().default(""),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  presenter: z.string().max(200).optional().nullable(),
  committee: z.string().max(300).optional().nullable(),
  isSubItem: z.boolean().optional(),
  unnumbered: z.boolean().optional(),
  /** jeśli podane - wstaw za tym punktem; w przeciwnym razie dodaj na końcu */
  insertAfterOrder: z.number().int().optional().nullable(),
}).refine((d) => d.unnumbered || (d.number && d.number.trim().length > 0), {
  message: "Numer jest wymagany dla numerowanego punktu",
  path: ["number"],
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  const d = parsed.data;

  const last = await prisma.agendaItem.findFirst({
    where: { meetingId },
    orderBy: { order: "desc" },
  });
  const nextOrder = d.insertAfterOrder == null
    ? (last?.order ?? 0) + 1
    : d.insertAfterOrder + 1;

  await prisma.$transaction(async (tx) => {
    // jeśli wstawiamy w środku - przesuń pozostałe pozycje
    if (d.insertAfterOrder != null) {
      await tx.agendaItem.updateMany({
        where: { meetingId, order: { gte: nextOrder } },
        data: { order: { increment: 1 } },
      });
    }
    await tx.agendaItem.create({
      data: {
        meetingId,
        order: nextOrder,
        number: d.unnumbered ? "" : d.number,
        title: d.title,
        description: d.description ?? null,
        presenter: d.presenter ?? null,
        committee: d.committee ?? null,
        isSubItem: d.isSubItem ?? false,
        unnumbered: d.unnumbered ?? false,
      },
    });
  });

  await audit({
    action: "AGENDA_ITEM_STARTED",
    description: `Dodano punkt ${d.number}: ${d.title}`,
    meetingId, userId: session.user.id,
    metadata: { kind: "added" },
  });

  publishToMeeting(meetingId, { type: "agenda.changed" });
  return NextResponse.json({ ok: true });
}
