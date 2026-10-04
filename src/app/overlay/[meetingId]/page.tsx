import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { OverlayClient } from "./OverlayClient";
import { canViewDisplay, displayCookieName } from "@/lib/displayAccess";

export const dynamic = "force-dynamic";

export default async function OverlayPage({
  params, searchParams,
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { meetingId } = await params;
  const { t } = await searchParams;
  // SA-07: jak ekran prezentacji - token ekranu albo sesja operatora/uczestnika.
  const token = t ?? (await cookies()).get(displayCookieName(meetingId))?.value ?? null;
  if (!(await canViewDisplay(meetingId, token))) notFound();
  return <OverlayClient meetingId={meetingId} />;
}
