import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDateTime } from "@/lib/labels";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const meetingId = url.searchParams.get("meeting");

  const logs = await prisma.auditLog.findMany({
    where: meetingId ? { meetingId } : {},
    include: { user: true, meeting: true },
    orderBy: { createdAt: "asc" },
  });

  const rows: (string | number | null | undefined | boolean)[][] = [
    ["Data", "Akcja", "Opis", "Posiedzenie", "Użytkownik"],
  ];

  for (const l of logs) {
    rows.push([
      formatDateTime(l.createdAt),
      l.action,
      l.description,
      l.meeting ? `${l.meeting.number} - ${l.meeting.name}` : "",
      l.user ? `${l.user.firstName} ${l.user.lastName}` : "",
    ]);
  }

  const fname = meetingId ? `rejestr_${meetingId.slice(-8)}.csv` : "rejestr_pelny.csv";
  return csvResponse(fname, toCsv(rows));
}
