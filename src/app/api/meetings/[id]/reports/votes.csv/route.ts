import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";
import { VOTE_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { formatMajority } from "@/lib/majority";
import { NextResponse } from "next/server";

const VOTE_TYPE_LABEL: Record<string, string> = {
  STANDARD: "Zwykłe", LIST: "Lista", PACKAGE: "Pakietowe", QUORUM: "Kworum",
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      votes: {
        include: { agendaItem: true, options: { orderBy: { order: "asc" } } },
        orderBy: { openedAt: "asc" },
      },
    },
  });
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  const rows: (string | number | null | undefined | boolean)[][] = [
    ["Posiedzenie", meeting.number, meeting.name],
    ["Termin", formatDateTime(meeting.scheduledAt)],
    [],
    ["Lp.", "Pkt", "Tytuł głosowania", "Typ", "Widoczność", "Większość", "Status",
      "Otwarte", "Zamknięte",
      "Uprawnieni", "Obecni", "Oddanych", "Za", "Przeciw", "Wstrzymało się",
      "Wynik", "Lista - kandydaci/wyniki"],
  ];

  meeting.votes.forEach((v, i) => {
    let listResults = "";
    if (v.type === "LIST") {
      listResults = v.options
        .map((o) => `${o.label}: ${o.resultCount ?? "-"}`)
        .join(" | ");
    }
    rows.push([
      i + 1,
      v.agendaItem?.number ?? "",
      v.title,
      VOTE_TYPE_LABEL[v.type] ?? v.type,
      v.visibility === "OPEN" ? "Jawne" : "Tajne",
      formatMajority(v.majorityKind, v.majorityBase),
      VOTE_STATUS_LABEL[v.status],
      v.openedAt ? formatDateTime(v.openedAt) : "",
      v.closedAt ? formatDateTime(v.closedAt) : "",
      v.resultEligibleCount,
      v.resultPresentCount,
      v.resultCastCount,
      v.resultYes,
      v.resultNo,
      v.resultAbstain,
      v.resultPassed === null ? "" : v.resultPassed ? "Przyjęto" : "Odrzucono",
      listResults,
    ]);
  });

  return csvResponse(`glosowania_${meeting.number.replace(/[/\\]/g, "-")}.csv`, toCsv(rows));
}
