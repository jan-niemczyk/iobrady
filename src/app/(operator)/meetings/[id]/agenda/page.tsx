import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AgendaEditorClient } from "@/components/operator/AgendaEditorClient";

export const dynamic = "force-dynamic";

export default async function AgendaEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: { agenda: { orderBy: { order: "asc" } } },
  });
  if (!meeting) notFound();

  return (
    <AgendaEditorClient
      meetingId={meeting.id}
      meetingName={meeting.name}
      meetingNumber={meeting.number}
      initialAgenda={meeting.agenda.map((a) => ({
        id: a.id,
        order: a.order,
        number: a.number,
        title: a.title,
        description: a.description,
        presenter: a.presenter,
        status: a.status,
        isSubItem: a.isSubItem,
        hiddenFromDisplay: a.hiddenFromDisplay,
      }))}
    />
  );
}
