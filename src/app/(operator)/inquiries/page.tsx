import { prisma } from "@/lib/db";
import { InquiriesRegistryClient } from "@/components/operator/inquiries/InquiriesRegistryClient";

export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  const [s, units, users] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "singleton" }, select: { inquiriesEnabled: true, inquiriesPublicArchive: true } }),
    prisma.orgUnit.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true, role: "PARTICIPANT" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
  ]);
  return (
    <InquiriesRegistryClient
      enabled={s?.inquiriesEnabled === true} publicArchive={s?.inquiriesPublicArchive === true}
      units={units} users={users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, sortName: `${u.lastName} ${u.firstName}` }))}
    />
  );
}
