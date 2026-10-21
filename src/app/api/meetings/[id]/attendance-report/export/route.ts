import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { meetingAttendance } from "@/lib/attendanceReport";
import { meetingAttendanceDocx, meetingAttendancePdf, meetingAttendanceXlsx } from "@/lib/attendanceExport";
import { fileResponse, MIME } from "@/lib/serverPdf";
import { serverError } from "@/lib/http";

/** GET ?format=pdf|docx|xlsx[&uwagi=1] - eksport listy obecności posiedzenia (tylko operator). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") ?? "pdf";
  const withNotes = sp.get("uwagi") === "1";
  if (!["pdf", "docx", "xlsx"].includes(format)) return new NextResponse("Nieobsługiwany format", { status: 400 });
  const r = await meetingAttendance(id, { withNotes });
  if (!r) return new NextResponse("Nie znaleziono posiedzenia", { status: 404 });
  const org = (await prisma.settings.findUnique({ where: { id: "singleton" }, select: { organizationName: true } }))?.organizationName ?? "";
  const base = `lista-obecnosci-${r.meeting.number}`.replace(/[^\p{L}\p{N}_-]+/gu, "-");
  try {
    if (format === "pdf") return fileResponse(await meetingAttendancePdf(r, org, withNotes), `${base}.pdf`, MIME.pdf);
    if (format === "docx") return fileResponse(await meetingAttendanceDocx(r, org, withNotes), `${base}.docx`, MIME.docx);
    return fileResponse(await meetingAttendanceXlsx(r, org, withNotes), `${base}.xlsx`, MIME.xlsx);
  } catch (e) { return serverError("attendance-export", e); }
}
