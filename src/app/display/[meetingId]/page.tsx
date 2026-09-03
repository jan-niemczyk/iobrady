import { DisplayClient } from "./DisplayClient";

export const dynamic = "force-dynamic";

export default async function DisplayPage({
  params, searchParams,
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ bare?: string }>;
}) {
  const { meetingId } = await params;
  const { bare } = await searchParams;
  return <DisplayClient meetingId={meetingId} bare={bare === "1"} />;
}
