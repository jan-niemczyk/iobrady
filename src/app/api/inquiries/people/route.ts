import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { hasSubmitRight, moduleEnabled } from "@/lib/inquiryAccess";

/** GET - lista radnych do wskazania współautorów (osobom z prawem składania i operatorowi). */
export async function GET() {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (session.user.role !== "OPERATOR" && !((await moduleEnabled()) && (await hasSubmitRight(session.user.id))))
    return new NextResponse("Forbidden", { status: 403 });
  const users = await prisma.user.findMany({ where: { active: true, role: "PARTICIPANT" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } });
  return NextResponse.json(users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, sortName: `${u.lastName} ${u.firstName}` })));
}
