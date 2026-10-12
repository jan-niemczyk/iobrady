import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDateTime } from "@/lib/labels";
import { NextResponse } from "next/server";

/**
 * GET /api/audit/csv?meeting=<id> - rejestr czynności posiedzenia (dziennik AuditLog) jako CSV.
 * Tylko operator. Bez metadanych technicznych (mogą zawierać identyfikatory i szczegóły wewnętrzne).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const meetingId = new URL(req.url).searchParams.get("meeting");
  if (!meetingId) return new NextResponse("Brak posiedzenia", { status: 400 });
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { number: true } });
  if (!meeting) return new NextResponse("Nie znaleziono posiedzenia", { status: 404 });

  const events = await prisma.auditLog.findMany({
    where: { meetingId },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
    take: 100_000, // H-03: twardy limit wielkości eksportu
  });

  const rows: (string | number | null | undefined | boolean)[][] = [["Data i godzina", "Osoba", "Czynność"]];
  for (const e of events) {
    rows.push([
      formatDateTime(e.createdAt),
      e.user ? `${e.user.firstName} ${e.user.lastName}` : "system",
      e.description,
    ]);
  }

  const name = `rejestr-czynnosci-${(meeting.number || meetingId).replace(/[^A-Za-z0-9_-]+/g, "-")}.csv`;
  return csvResponse(name, toCsv(rows));
}
