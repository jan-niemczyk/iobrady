import { auth } from "@/lib/auth";
import { applyRetention } from "@/lib/retention";
import { NextResponse } from "next/server";

/** POST /api/settings/retention - ręczne zastosowanie retencji dzienników (operator). */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const r = await applyRetention(session.user.id);
  return NextResponse.json(r);
}
