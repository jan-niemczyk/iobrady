import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guarded } from "@/lib/routeGuard";
import { requireResponder, responderCase } from "@/lib/responder";
import { moduleEnabled } from "@/lib/inquiryAccess";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  return guarded("responder case", async () => {
    await requireResponder(session.user);
    return NextResponse.json({ ...(await responderCase(session.user.id, id)), enabled: await moduleEnabled() });
  });
}
