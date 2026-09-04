import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDateTime } from "@/lib/labels";
import { ROLE_LABEL } from "@/lib/labels";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const events = await prisma.loginEvent.findMany({
    include: { user: true },
    orderBy: { at: "asc" },
  });

  const rows: (string | number | null | undefined | boolean)[][] = [
    ["Data", "Imię i nazwisko", "E-mail", "Rola"],
  ];

  for (const e of events) {
    rows.push([
      formatDateTime(e.at),
      e.user ? `${e.user.firstName} ${e.user.lastName}` : "",
      e.user?.email ?? "",
      ROLE_LABEL[e.role],
    ]);
  }

  return csvResponse("logowania.csv", toCsv(rows));
}
