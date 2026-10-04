import { notFound } from "next/navigation";
import { MeetingParticipantsClient } from "@/components/operator/MeetingParticipantsClient";
import { loadMeetingParticipantsData } from "@/lib/meetingParticipantsData";

export const dynamic = "force-dynamic";

export default async function MeetingParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadMeetingParticipantsData(id);
  if (!data) notFound();
  return <MeetingParticipantsClient {...data} />;
}
