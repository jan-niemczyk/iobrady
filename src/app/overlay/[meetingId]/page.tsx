import { OverlayClient } from "./OverlayClient";

export const dynamic = "force-dynamic";

export default async function OverlayPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  return <OverlayClient meetingId={meetingId} />;
}
