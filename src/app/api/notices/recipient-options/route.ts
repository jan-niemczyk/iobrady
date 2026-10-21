import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Jeden słownik adresatów: uczestnicy (konta), goście, członkowie grup organizacyjnych i kontakty
 * bez konta. Konto ani adres e-mail nie są warunkiem - wystarcza nazwa. Tylko operator.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR") return new NextResponse("Unauthorized", { status: 401 });
  const meetingId = new URL(req.url).searchParams.get("meeting");
  const [users, guests, units, contacts, participants] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, select: { id: true, firstName: true, lastName: true, functionTitle: true, group: { select: { shortName: true } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.guest.findMany({ select: { id: true, firstName: true, lastName: true, role: true }, orderBy: { lastName: "asc" } }),
    prisma.orgUnit.findMany({ where: { active: true }, select: { id: true, name: true, members: { select: { userId: true, functionName: true, validTo: true } } }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    meetingId ? prisma.meetingParticipant.findMany({ where: { meetingId }, select: { userId: true } }) : Promise.resolve([]),
  ]);
  const now = Date.now();
  return NextResponse.json({
    users: users.map((u) => ({ key: `user:${u.id}`, source: "user", name: `${u.firstName} ${u.lastName}`, functionTitle: u.functionTitle ?? "", institution: "", address: "", salutation: "", club: u.group?.shortName ?? null })),
    guests: guests.map((g) => ({ key: `guest:${g.id}`, source: "guest", name: `${g.firstName} ${g.lastName}`, functionTitle: g.role ?? "", institution: "", address: "", salutation: "" })),
    contacts: contacts.map((c) => ({ key: `contact:${c.id}`, source: "contact", name: c.name, functionTitle: c.functionTitle ?? "", institution: c.institution ?? "", address: c.address ?? "", salutation: c.salutation ?? "" })),
    units: units.map((u) => ({ id: u.id, name: u.name, userIds: u.members.filter((m) => !m.validTo || m.validTo.getTime() >= now).map((m) => m.userId) })),
    participantIds: participants.map((p) => p.userId),
  });
}
