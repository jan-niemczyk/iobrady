import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadParticipantMeeting } from "@/lib/participantMeeting";
import { MeetingPageClient } from "@/components/participant/MeetingPageClient";
import { configuredOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { meetingId } = await params;
  const m = await loadParticipantMeeting(session.user.id, meetingId);
  if (!m) notFound();
  return <MeetingPageClient m={m} publicOrigin={configuredOrigin()} />;
}
