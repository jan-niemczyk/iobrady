import { prisma } from "@/lib/db";
import { ParticipantsManagerClient } from "@/components/operator/ParticipantsManagerClient";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  const [users, groups] = await Promise.all([
    prisma.user.findMany({ include: { group: true }, orderBy: [{ role: "asc" }, { lastName: "asc" }] }),
    prisma.group.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <ParticipantsManagerClient
      initialUsers={users.map((u) => ({
        id: u.id, email: u.email,
        firstName: u.firstName, lastName: u.lastName,
        functionTitle: u.functionTitle,
        role: u.role, active: u.active,
        groupId: u.groupId,
        groupShort: u.group?.shortName ?? null,
        groupColor: u.group?.color ?? null,
      }))}
      initialGroups={groups.map((g) => ({
        id: g.id, name: g.name, shortName: g.shortName,
        color: g.color, userCount: g._count.users,
      }))}
    />
  );
}
