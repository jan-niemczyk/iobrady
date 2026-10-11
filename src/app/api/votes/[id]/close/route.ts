import { auth } from "@/lib/auth";
import { canManageByVote } from "@/lib/canManage";
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/booth";
import { closeVoteNow } from "@/lib/closeVote";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!(await canManageByVote(session, id)))
    return new NextResponse("Forbidden", { status: 403 });

  try {
    const { passed } = await closeVoteNow(id, session.user.id);
    return NextResponse.json({ ok: true, passed });
  } catch (e) {
    if (e instanceof HttpError) return new NextResponse(e.message, { status: e.status });
    throw e;
  }
}
