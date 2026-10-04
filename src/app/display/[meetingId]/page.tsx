import { ScreenGuard } from "@/components/presentation/ScreenGuard";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { DisplayClient } from "./DisplayClient";
import { canViewDisplay, displayCookieName } from "@/lib/displayAccess";

export const dynamic = "force-dynamic";

export default async function DisplayPage({
  params, searchParams,
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ bare?: string; t?: string }>;
}) {
  const { meetingId } = await params;
  const { bare, t } = await searchParams;
  // SA-07: token ekranu (link lub ciasteczko ustawione przez middleware) albo sesja operatora/uczestnika.
  const token = t ?? (await cookies()).get(displayCookieName(meetingId))?.value ?? null;
  if (!(await canViewDisplay(meetingId, token))) notFound();
  return <ScreenGuard><DisplayClient meetingId={meetingId} bare={bare === "1"} /></ScreenGuard>;
}
