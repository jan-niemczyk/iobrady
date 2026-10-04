import { auth } from "@/lib/auth";
import { markOnlineGlobal } from "@/lib/events";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/presence/ping - heartbeat obecności online (od zalogowania, niezależny od posiedzenia).
// Klient (dowolny zalogowany) woła cyklicznie; operator widzi kto jest online.
export async function POST() {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  markOnlineGlobal(session.user.id);
  return NextResponse.json({ ok: true });
}
