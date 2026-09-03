import { prisma } from "@/lib/db";
import { GuestsManagerClient } from "@/components/operator/GuestsManagerClient";
import { comparePl } from "@/lib/sortPl";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const guests = await prisma.guest.findMany();
  guests.sort((a, b) => comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName));

  return (
    <GuestsManagerClient
      initialGuests={guests.map((g) => ({
        id: g.id,
        firstName: g.firstName,
        lastName: g.lastName,
        role: g.role,
        clubShort: g.clubShort,
      }))}
    />
  );
}
