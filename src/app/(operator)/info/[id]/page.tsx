import { prisma } from "@/lib/db";
import { InfoEditorClient } from "@/components/operator/info/InfoEditorClient";

export const dynamic = "force-dynamic";

export default async function InfoEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [units, users] = await Promise.all([
    prisma.orgUnit.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { members: true } } } }),
    prisma.user.findMany({ where: { active: true, role: "PARTICIPANT" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, functionTitle: true } }),
  ]);
  return (
    <InfoEditorClient
      id={id === "nowa" ? null : id}
      units={units.map((u) => ({ id: u.id, name: u.name, members: u._count.members }))}
      users={users.map((u) => ({ id: u.id, name: `${u.lastName} ${u.firstName}`, functionTitle: u.functionTitle ?? "" }))}
    />
  );
}
