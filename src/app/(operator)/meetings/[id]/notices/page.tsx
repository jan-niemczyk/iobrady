import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { NoticesListClient } from "@/components/operator/notices/NoticesListClient";

export const dynamic = "force-dynamic";

export default async function MeetingNoticesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [meeting, notices, templates] = await Promise.all([
    prisma.meeting.findUnique({ where: { id }, select: { id: true, number: true, name: true, orgUnits: { select: { orgUnitId: true } } } }),
    prisma.notice.findMany({ where: { meetingId: id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, templateName: true, templateVersion: true, updatedAt: true, lastGeneratedAt: true, agendaEdited: true } }),
    prisma.noticeTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, isDefault: true, orgUnitId: true, orgUnit: { select: { name: true } } } }),
  ]);
  if (!meeting) notFound();
  const unitIds = meeting.orgUnits.map((o) => o.orgUnitId);
  return (
    <NoticesListClient
      meeting={{ id: meeting.id, number: meeting.number, name: meeting.name }}
      notices={notices.map((n) => ({ ...n, updatedAt: n.updatedAt.toISOString(), lastGeneratedAt: n.lastGeneratedAt?.toISOString() ?? null }))}
      templates={templates.map((t) => ({ id: t.id, name: t.name, scope: t.orgUnit?.name ?? "jednostka", suggested: t.isDefault && (t.orgUnitId === null || unitIds.includes(t.orgUnitId)) }))}
    />
  );
}
