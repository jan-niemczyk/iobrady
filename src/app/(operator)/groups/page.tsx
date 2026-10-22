import { prisma } from "@/lib/db";
import { OrgUnitsManagerClient } from "@/components/operator/OrgUnitsManagerClient";

export const dynamic = "force-dynamic";

export default async function OrgUnitsPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const { g } = await searchParams;
  const users = await prisma.user.findMany({
    where: { active: true, role: { not: "RESPONDER" } },
    select: { id: true, firstName: true, lastName: true, email: true, group: { select: { shortName: true, name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return (
    <OrgUnitsManagerClient
      initialSelectedId={g ?? null}
      users={users.map((u) => ({ id: u.id, name: `${u.lastName} ${u.firstName}`, email: u.email, club: u.group?.shortName ?? u.group?.name ?? null }))}
    />
  );
}
