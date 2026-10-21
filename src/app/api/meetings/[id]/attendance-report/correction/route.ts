import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/http";
import { audit } from "@/lib/audit";

const schema = z.object({
  userId: z.string().max(64),
  present: z.boolean(),
  at: z.string().max(40).refine((v) => !isNaN(new Date(v).getTime()), "Nieprawidłowa data i godzina."),
  reason: z.string().trim().min(3, "Podaj uzasadnienie korekty.").max(1000),
  /** Zdarzenie zastępowane korektą (zostaje w historii jako zastąpione). */
  supersedeEventId: z.string().max(64).optional().nullable(),
});

/**
 * Udokumentowana korekta obecności: nowe zdarzenie ze źródłem „korekta", uzasadnieniem, czasem
 * i operatorem. Oryginał nie jest usuwany (oznaczany jako zastąpiony). Migawki obecności
 * utrwalone przy zakończonych głosowaniach (VoteRoster) nie są zmieniane.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const d = parsed.data;
  const mp = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId: id, userId: d.userId } }, include: { user: { select: { firstName: true, lastName: true } } } });
  if (!mp) return new NextResponse("Osoba nie jest uczestnikiem posiedzenia", { status: 404 });
  const at = new Date(d.at);
  try {
  await prisma.$transaction(async (tx) => {
    let supersededId: string | null = null;
    if (d.supersedeEventId) {
      const old = await tx.attendanceEvent.findUnique({ where: { id: d.supersedeEventId } });
      if (!old || old.meetingId !== id || old.userId !== d.userId) throw new Error("BAD_EVENT");
      await tx.attendanceEvent.update({ where: { id: old.id }, data: { supersededAt: new Date() } });
      supersededId = old.id;
    }
    await tx.attendanceEvent.create({ data: { meetingId: id, userId: d.userId, present: d.present, at, source: "CORRECTION", recordedById: session.user.id, reason: d.reason, correctsId: supersededId } });
    // Bieżący stan obecności = ostatnie ważne zdarzenie.
    const last = await tx.attendanceEvent.findFirst({ where: { meetingId: id, userId: d.userId, supersededAt: null }, orderBy: [{ at: "desc" }, { createdAt: "desc" }] });
    if (last) {
      await tx.attendance.upsert({
        where: { participantId: mp.id },
        create: { participantId: mp.id, status: last.present ? "PRESENT" : "ABSENT", source: "OPERATOR", confirmedAt: last.at, confirmedByUserId: session.user.id },
        update: { status: last.present ? "PRESENT" : "ABSENT", confirmedAt: last.at, source: "OPERATOR", confirmedByUserId: session.user.id },
      });
    }
    await audit({
      action: "ATTENDANCE_CORRECTED",
      description: `Korekta obecności: ${mp.user.lastName} ${mp.user.firstName} - ${d.present ? "obecny" : "nieobecny"} od ${at.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}`,
      meetingId: id, userId: session.user.id,
      metadata: { userId: d.userId, present: d.present, at: at.toISOString(), reason: d.reason, supersededEventId: supersededId },
    }, tx);
  });
  } catch (e) {
    if (e instanceof Error && e.message === "BAD_EVENT") return new NextResponse("Wskazane zdarzenie nie dotyczy tej osoby w tym posiedzeniu.", { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
