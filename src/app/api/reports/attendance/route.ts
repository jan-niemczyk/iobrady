import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { attendanceSummary } from "@/lib/attendanceReport";
import { filtersFrom } from "@/lib/attendanceFilters";

/** Raport zbiorczy obecności za okres (operator). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await attendanceSummary(filtersFrom(new URL(req.url).searchParams)));
}
