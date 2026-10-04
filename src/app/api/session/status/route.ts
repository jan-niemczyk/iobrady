import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/** GET /api/session/status - czy sesja jest ważna (bez przedłużania limitu bezczynności). */
export async function GET() {
  const session = await auth();
  if (!session?.sid) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
