import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { moduleEnabled } from "@/lib/inquiryAccess";

/** GET - stan modułu i prawa składania zalogowanej osoby (do interfejsu; API i tak sprawdza samo). */
export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const enabled = await moduleEnabled();
  const grants = session.user.role === "PARTICIPANT"
    ? await prisma.inquiryGrant.findMany({ where: { userId: session.user.id }, include: { orgUnit: { select: { id: true, name: true } } } })
    : [];
  return NextResponse.json({ enabled, canSubmit: enabled && grants.length > 0, scopes: grants.map((g) => g.orgUnit ?? { id: null, name: "Cała jednostka" }) });
}
