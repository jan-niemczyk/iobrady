import { prisma } from "@/lib/db";
import { TemplatesManagerClient } from "@/components/operator/TemplatesManagerClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [templates, users] = await Promise.all([
    prisma.meetingTemplate.findMany({
      orderBy: { name: "asc" },
      include: { members: { include: { user: { include: { group: true } } } } },
    }),
    prisma.user.findMany({ where: { active: true }, include: { group: true }, orderBy: [{ lastName: "asc" }] }),
  ]);

  return (
    <TemplatesManagerClient
      initialTemplates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        members: t.members.map((m) => ({
          userId: m.userId,
          name: `${m.user.lastName} ${m.user.firstName}`,
          groupShort: m.user.group?.shortName ?? null,
          hasVotingRight: m.hasVotingRight,
        })),
      }))}
      allUsers={users.map((u) => ({
        id: u.id,
        name: `${u.lastName} ${u.firstName}`,
        groupShort: u.group?.shortName ?? null,
      }))}
    />
  );
}
