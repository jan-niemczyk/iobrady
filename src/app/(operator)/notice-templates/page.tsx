import { prisma } from "@/lib/db";
import { NoticeTemplatesClient } from "@/components/operator/notices/NoticeTemplatesClient";

export const dynamic = "force-dynamic";

export default async function NoticeTemplatesPage() {
  const [units, s] = await Promise.all([
    prisma.orgUnit.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.settings.findUnique({ where: { id: "singleton" }, select: { presentationLogoUrl: true } }),
  ]);
  return <NoticeTemplatesClient units={units} logoUrl={s?.presentationLogoUrl ?? null} />;
}
