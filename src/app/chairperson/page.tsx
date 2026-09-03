import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

// Przewodniczący/operator po wejściu bez ID - kierujemy do właściwego aktywnego posiedzenia.
export default async function ChairpersonIndex() {
  const session = await auth();
  if (!session) redirect("/login");

  let activeId: string | null = null;
  if (session.user.role === "OPERATOR") {
    const active = await prisma.meeting.findFirst({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "PAUSED"] } },
      orderBy: { scheduledAt: "desc" }, select: { id: true },
    });
    activeId = active?.id ?? null;
  } else {
    // Uczestnik: posiedzenie, w którym jest przewodniczącym i które jest aktywne.
    const mp = await prisma.meetingParticipant.findFirst({
      where: {
        userId: session.user.id, isChairperson: true,
        meeting: { status: { in: ["OPEN", "IN_PROGRESS", "PAUSED"] } },
      },
      orderBy: { meeting: { scheduledAt: "desc" } }, select: { meetingId: true },
    });
    activeId = mp?.meetingId ?? null;
  }

  if (activeId) redirect(`/chairperson/${activeId}`);

  return (
    <div className="px-5 py-16 max-w-[600px] mx-auto text-center">
      <h1 style={{ fontSize: 24 }}>Widok przewodniczącego</h1>
      <p className="mt-3" style={{ color: "var(--color-ink-2)" }}>
        Obecnie nie trwa żadne posiedzenie, w którym prowadzisz obrady. Ta strona odświeży się, gdy operator otworzy obrady.
      </p>
    </div>
  );
}
