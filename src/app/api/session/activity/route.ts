import { auth } from "@/lib/auth";
import { touchActivity } from "@/lib/sessions";
import { NextResponse } from "next/server";

/**
 * POST /api/session/activity - zgłoszenie AKTYWNOŚCI UŻYTKOWNIKA (klawiatura, mysz, dotyk).
 * Wysyłane przez SessionKeeper wyłącznie po realnej interakcji (najwyżej raz na minutę).
 * To jedyne miejsce przedłużające limit bezczynności - SSE i odpytywanie serwera go nie przedłużają.
 */
export async function POST() {
  const session = await auth();
  if (!session?.sid) return NextResponse.json({ error: "Sesja wygasła." }, { status: 401 });
  await touchActivity(session.sid);
  return new NextResponse(null, { status: 204 });
}
