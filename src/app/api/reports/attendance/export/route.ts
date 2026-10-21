import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { attendanceSummary } from "@/lib/attendanceReport";
import { summaryDocx, summaryPdf, summaryXlsx } from "@/lib/attendanceExport";
import { fileResponse, MIME } from "@/lib/serverPdf";
import { serverError } from "@/lib/http";
import { filtersFrom } from "@/lib/attendanceFilters";

/** GET ?format=pdf|docx|xlsx + filtry jak w widoku - eksport raportu zbiorczego (operator). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") ?? "pdf";
  if (!["pdf", "docx", "xlsx"].includes(format)) return new NextResponse("Nieobsługiwany format", { status: 400 });
  const s = await attendanceSummary(filtersFrom(sp));
  const org = (await prisma.settings.findUnique({ where: { id: "singleton" }, select: { organizationName: true } }))?.organizationName ?? "";
  const base = `raport-obecnosci-${s.filters.from ?? "poczatek"}-${s.filters.to ?? "dzis"}`;
  try {
    if (format === "pdf") return fileResponse(await summaryPdf(s, org), `${base}.pdf`, MIME.pdf);
    if (format === "docx") return fileResponse(await summaryDocx(s, org), `${base}.docx`, MIME.docx);
    return fileResponse(await summaryXlsx(s, org), `${base}.xlsx`, MIME.xlsx);
  } catch (e) { return serverError("attendance-summary-export", e); }
}
