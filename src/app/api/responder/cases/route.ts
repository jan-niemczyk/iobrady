import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { guarded } from "@/lib/routeGuard";
import { requireResponder, responderCases } from "@/lib/responder";

/** GET - sprawy przekazane adresatom przypisanym do tego konta. */
export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  return guarded("responder cases", async () => {
    await requireResponder(session.user);
    return NextResponse.json(await responderCases(session.user.id));
  });
}
