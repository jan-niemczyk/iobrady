import { prisma } from "@/lib/db";
import { ClubsManagerClient } from "@/components/operator/ClubsManagerClient";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const [groups, settings] = await Promise.all([
    prisma.group.findMany({ include: { users: { where: { active: true }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: "asc" }] } }, orderBy: { name: "asc" } }),
    prisma.settings.findUnique({ where: { id: "singleton" }, select: { groupsEnabled: true } }),
  ]);
  return (
    <ClubsManagerClient
      groupsEnabled={settings?.groupsEnabled === true}
      initial={groups.map((g) => ({ id: g.id, name: g.name, shortName: g.shortName, color: g.color, members: g.users.map((u) => `${u.lastName} ${u.firstName}`) }))}
    />
  );
}
