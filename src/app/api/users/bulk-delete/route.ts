import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  userIds: z.array(z.string()).min(1),
});

/**
 * POST /api/users/bulk-delete
 * Hurtowe usuwanie kont. Chroni historię:
 *  - jeśli konto ma JAKIKOLWIEK ślad w głosowaniach/posiedzeniach (ballot, marker,
 *    udział, wpis na liście mówców) → konto jest DEZAKTYWOWANE (active=false),
 *    nie usuwane fizycznie. Dzięki temu żaden rejestr nie znika.
 *  - jeśli konto jest "czyste" (brak powiązań) → usuwane fizycznie.
 * Snapshoty (imię/nazwisko/klub) w ballotach i wpisach mówców i tak zostają,
 * więc nawet dezaktywacja nie jest konieczna dla integralności raportów -
 * ale zostawiamy konto, by nie gubić powiązań w widokach bieżących.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(`Bad: ${parsed.error.message}`, { status: 400 });

  // Nie pozwalamy usunąć samego siebie ani innych operatorów hurtowo (bezpieczeństwo).
  const targets = await prisma.user.findMany({
    where: { id: { in: parsed.data.userIds }, role: { not: "OPERATOR" } },
    select: { id: true, firstName: true, lastName: true },
  });

  let deleted = 0;
  let deactivated = 0;

  for (const u of targets) {
    const [ballotCount, markerCount, participationCount, speakerCount] = await Promise.all([
      prisma.ballot.count({ where: { userId: u.id } }),
      prisma.secretBallotMarker.count({ where: { userId: u.id } }),
      prisma.meetingParticipant.count({ where: { userId: u.id } }),
      prisma.speakerListEntry.count({ where: { userId: u.id } }),
    ]);
    const hasHistory = ballotCount + markerCount + participationCount + speakerCount > 0;

    if (hasHistory) {
      // Dezaktywujemy zamiast usuwać - chronimy rejestry.
      // Odpinamy też z szablonów (to nie jest historia, tylko konfiguracja).
      await prisma.$transaction([
        prisma.meetingTemplateMember.deleteMany({ where: { userId: u.id } }),
        prisma.user.update({ where: { id: u.id }, data: { active: false } }),
      ]);
      deactivated++;
    } else {
      await prisma.user.delete({ where: { id: u.id } });
      deleted++;
    }
  }

  await audit({
    action: "SETTINGS_CHANGED",
    description: `Hurtowe usuwanie kont: usunięto ${deleted}, dezaktywowano ${deactivated} (z historią)`,
    userId: session.user.id,
    metadata: { requested: parsed.data.userIds.length, deleted, deactivated },
  });

  return NextResponse.json({ ok: true, deleted, deactivated });
}
