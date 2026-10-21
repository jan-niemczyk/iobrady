import { prisma } from "@/lib/db";
import { NoticeEditorClient } from "@/components/operator/notices/NoticeEditorClient";

export const dynamic = "force-dynamic";

export default async function NoticeEditorPage({ params }: { params: Promise<{ id: string; noticeId: string }> }) {
  const { id, noticeId } = await params;
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { presentationLogoUrl: true } });
  return <NoticeEditorClient meetingId={id} noticeId={noticeId} logoUrl={s?.presentationLogoUrl ?? null} />;
}
