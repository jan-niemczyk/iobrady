import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { openVoteNow } from "@/lib/openVote";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const r = await openVoteNow(id, session.user.id);
  if (!r.ok) return new NextResponse(r.message, { status: r.status });
  return NextResponse.json({ ok: true });
}
