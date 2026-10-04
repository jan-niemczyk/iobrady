/**
 * Syntetyczne dane do sond bezpieczeństwa (tests/security/audit-probes.mjs) i CI.
 * Tworzy: konfigurację, operatora, 6 radnych (*@demo.local, 5 obecnych), posiedzenie testowe.
 * Odmawia działania poza lokalną bazą. Hasła ze zmiennych SEC_OP_PASS / SEC_PT_PASS.
 *   SEC_OP_PASS=... SEC_PT_PASS=... npx tsx tests/security/fixture.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1|postgres)(:\d+)?\//.test(url)) { console.error("STOP: tylko lokalna/testowa baza."); process.exit(2); }
const OP = process.env.SEC_OP_PASS, PT = process.env.SEC_PT_PASS;
if (!OP || !PT) { console.error("Ustaw SEC_OP_PASS i SEC_PT_PASS."); process.exit(2); }

const prisma = new PrismaClient();
const PEOPLE = [
  ["anna.kowalska", "Anna", "Kowalska", true], ["michalina.bosak", "Michalina", "Bosak", true],
  ["milosz.krol", "Miłosz", "Król", true], ["ewa.zielinska", "Ewa", "Zielińska", true],
  ["krzysztof.wisniewski-brzeczyszczykiewicz", "Krzysztof", "Wiśniewski-Brzęczyszczykiewicz", true],
  ["jan.nowak", "Jan", "Nowak", false],
] as const;

async function main() {
  await prisma.settings.upsert({ where: { id: "singleton" }, create: { id: "singleton", setupComplete: true, organizationName: "Rada Testowa" }, update: { setupComplete: true } });
  await prisma.user.upsert({
    where: { email: "operator@example.local" },
    create: { email: "operator@example.local", firstName: "Operator", lastName: "Testowy", role: "OPERATOR", passwordHash: await bcrypt.hash(OP!, 10) },
    update: {},
  });
  const ptHash = await bcrypt.hash(PT!, 10);
  const meeting = await prisma.meeting.upsert({
    where: { id: "testmeeting00000001" },
    create: { id: "testmeeting00000001", number: "XII/2026", name: "XII sesja Rady Miasta", scheduledAt: new Date(), status: "IN_PROGRESS", displayToken: "synthetic-display-token-0001" },
    update: {},
  });
  for (const [login, first, last, present] of PEOPLE) {
    const u = await prisma.user.upsert({
      where: { email: `${login}@demo.local` },
      create: { email: `${login}@demo.local`, firstName: first, lastName: last, role: "PARTICIPANT", passwordHash: ptHash },
      update: {},
    });
    const mp = await prisma.meetingParticipant.upsert({
      where: { meetingId_userId: { meetingId: meeting.id, userId: u.id } },
      create: { meetingId: meeting.id, userId: u.id, hasVotingRight: true },
      update: {},
    });
    await prisma.attendance.upsert({
      where: { participantId: mp.id },
      create: { participantId: mp.id, status: present ? "PRESENT" : "ABSENT", source: "OPERATOR" },
      update: {},
    });
  }
  console.log("Fixture gotowy.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
