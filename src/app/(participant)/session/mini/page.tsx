import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { MeetingStatus } from "@prisma/client";
import { MiniDisplayClient } from "@/components/participant/MiniDisplayClient";

export const dynamic = "force-dynamic";

// Widok "wyświetlacz" (mini) - wąskie okno nakładane na stream/prezentację.
// Dostęp tylko dla uczestników, którym operator włączył uprawnienie canUseMiniDisplay
// w aktualnie otwartym posiedzeniu.
export default async function MiniDisplayPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const sp = await searchParams;

  const participation = await prisma.meetingParticipant.findFirst({
    where: {
      userId: session.user.id,
      excludedFromMeeting: false,
      canUseMiniDisplay: true,
      ...(sp.m ? { meetingId: sp.m } : {}),
      meeting: { status: { in: [MeetingStatus.OPEN, MeetingStatus.IN_PROGRESS, MeetingStatus.PAUSED] } },
    },
    select: { id: true },
  });

  // Brak uprawnienia albo brak otwartego posiedzenia - wróć do zwykłego widoku sesji.
  if (!participation) redirect("/session");

  return <MiniDisplayClient />;
}
