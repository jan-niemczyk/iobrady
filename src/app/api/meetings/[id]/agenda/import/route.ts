import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishToMeeting } from "@/lib/events";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * POST /api/meetings/[id]/agenda/import
 * Body: { text: string, mode?: "append" | "replace" }
 *
 * Każda niepusta linia tekstu staje się osobnym punktem agendy.
 * Numery nadawane automatycznie wg kolejności od 1.
 *
 * mode = "append" (default) dodaje na koniec istniejących punktów.
 * mode = "replace" usuwa wszystkie istniejące punkty (tylko gdy nie ma jeszcze rozpoczętych głosowań).
 */

const schema = z.object({
  text: z.string().min(1),
  mode: z.enum(["append", "replace"]).optional().default("append"),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad request: ${parsed.error.message}`, { status: 400 });

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  // Parsuj linie. Podpunkt = linia z wcięciem (tab lub 2+ spacje) LUB z prefiksem -, *, -, ›.
  const rawLines = parsed.data.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const parsedLines = rawLines.map((raw) => {
    const indented = /^(\t| {2,})/.test(raw);
    let text = raw.trim();
    let bulleted = false;
    const m = text.match(/^[-*-›]\s+(.*)$/);
    if (m) { text = m[1].trim(); bulleted = true; }
    return { title: text, isSubItem: indented || bulleted };
  }).filter((l) => l.title.length > 0);

  if (parsedLines.length === 0) {
    return new NextResponse("Brak punktów do zaimportowania (pusta zawartość)", { status: 400 });
  }
  const lines = parsedLines; // zachowanie nazwy dla dalszego kodu

  await prisma.$transaction(async (tx) => {
    if (parsed.data.mode === "replace") {
      // sprawdź czy nie ma rozpoczętych głosowań w istniejących punktach
      const conflictingVote = await tx.vote.findFirst({
        where: { meetingId: id, status: { in: ["OPEN", "CLOSED"] } },
      });
      if (conflictingVote) {
        throw new Error("Nie można zastąpić agendy - są już otwarte lub zamknięte głosowania");
      }
      await tx.agendaItem.deleteMany({ where: { meetingId: id } });
    }

    // znajdź najwyższy istniejący order oraz ostatni zwykły numer (dla numeracji podpunktów)
    const existing = await tx.agendaItem.findMany({
      where: { meetingId: id },
      orderBy: { order: "asc" },
    });
    const startOrder = (existing[existing.length - 1]?.order ?? 0) + 1;
    // ostatni zwykły numer całkowity spośród istniejących (żeby append kontynuował numerację)
    let mainNumber = 0;
    for (const e of existing) {
      const n = parseInt(e.number, 10);
      if (!e.isSubItem && !isNaN(n)) mainNumber = Math.max(mainNumber, n);
    }
    let subNumber = 0;

    // utwórz nowe punkty z numeracją: zwykłe kolejno, podpunkty jako 1.1, 1.2 pod ostatnim zwykłym
    await tx.agendaItem.createMany({
      data: lines.map((line, i) => {
        let number: string;
        if (line.isSubItem && mainNumber > 0) {
          subNumber++;
          number = `${mainNumber}.${subNumber}`;
        } else {
          mainNumber++;
          subNumber = 0;
          number = String(mainNumber);
        }
        return {
          meetingId: id,
          order: startOrder + i,
          number,
          title: line.title,
          isSubItem: line.isSubItem,
          status: "PENDING" as const,
        };
      }),
    });
  }).catch((e) => {
    throw e;
  });

  await audit({
    action: "AGENDA_ITEM_STARTED",
    description: `Zaimportowano ${lines.length} punktów porządku obrad (${parsed.data.mode})`,
    meetingId: id,
    userId: session.user.id,
    metadata: { count: lines.length, mode: parsed.data.mode },
  });

  publishToMeeting(id, { type: "agenda.changed" });
  return NextResponse.json({ ok: true, count: lines.length });
}
