/**
 * Migracje danych wykonywane PO `prisma db push` (scripts/migrate.sh). Idempotentne.
 *  - SA-07: token ekranu dla posiedzeń sprzed migracji,
 *  - SA-11: szyfrowanie hasła SMTP zapisanego jawnie + usunięcie haseł SMTP z dawnych wpisów dziennika,
 *  - rotacja klucza (`--rotate`): ponowne zaszyfrowanie kluczem głównym APP_ENCRYPTION_KEY,
 *  - dawne szablony składu -> grupy organizacyjne (OrgUnit, mapowanie przez legacyTemplateId).
 * Nie wypisuje żadnych sekretów.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { encryptSecret, decryptSecret, needsReencrypt } from "../src/lib/secretBox";

const SMTP_CONTEXT = "settings.smtpPassword";
const prisma = new PrismaClient();

async function main() {
  const rotate = process.argv.includes("--rotate");

  // SA-07
  const noToken = await prisma.meeting.findMany({ where: { displayToken: null }, select: { id: true } });
  for (const m of noToken) {
    await prisma.meeting.updateMany({ where: { id: m.id, displayToken: null }, data: { displayToken: randomBytes(18).toString("base64url") } });
  }
  if (noToken.length) console.log(`[migrate] Token ekranu nadany posiedzeniom: ${noToken.length}`);

  // SA-11: hasło SMTP zaszyfrowane (także rotacja klucza)
  const s = await prisma.settings.findUnique({ where: { id: "singleton" }, select: { smtpPassword: true } });
  if (s?.smtpPassword && (needsReencrypt(s.smtpPassword) || rotate)) {
    try {
      const plain = decryptSecret(s.smtpPassword, SMTP_CONTEXT);
      await prisma.settings.update({ where: { id: "singleton" }, data: { smtpPassword: encryptSecret(plain, SMTP_CONTEXT) } });
      console.log("[migrate] Hasło SMTP zaszyfrowane kluczem głównym.");
    } catch (e) {
      // Nie blokujemy startu aplikacji - wysyłka e-maili nie zadziała do czasu podania właściwego
      // klucza (APP_ENCRYPTION_KEYS_OLD) albo ponownego wpisania hasła SMTP w Ustawieniach.
      console.warn(`[migrate] UWAGA: nie można odszyfrować hasła SMTP: ${e instanceof Error ? e.message : e}`);
      if (rotate) process.exitCode = 1;
    }
  }

  // SA-11: dawne wpisy dziennika z jawnym hasłem SMTP w metadanych
  const scrubbed = await prisma.$executeRaw`
    UPDATE "AuditLog"
    SET metadata = jsonb_set(metadata::jsonb, '{changes,smtpPassword}', '"[usunięto]"'::jsonb)
    WHERE action = 'SETTINGS_CHANGED'
      AND metadata IS NOT NULL
      AND jsonb_typeof(metadata::jsonb -> 'changes') = 'object'
      AND (metadata::jsonb -> 'changes') ? 'smtpPassword'
      AND (metadata::jsonb -> 'changes' ->> 'smtpPassword') IS NOT NULL
      AND (metadata::jsonb -> 'changes' ->> 'smtpPassword') <> '[usunięto]'`;
  if (scrubbed) console.log(`[migrate] Usunięto hasło SMTP z wpisów dziennika: ${scrubbed}`);

  // H-02: treści głosów tajnych nie przechowujemy wcale - czyszczenie pozostałości po wersji
  // z zerowaniem tajnego głosu (także w głosowaniach otwartych w chwili aktualizacji).
  const purged = await prisma.$executeRaw`
    UPDATE "SecretBallotMarker" SET "resetPayload" = NULL WHERE "resetPayload" IS NOT NULL`;
  if (purged) console.log(`[migrate] Usunięto zapisane treści głosów tajnych: ${purged}`);

  // Goście nie głosują i nie wliczają się do kworum - także ci, którym wcześniej zaznaczono prawo głosu.
  // Dotyczy wyłącznie posiedzeń jeszcze niezakończonych (historia zakończonych posiedzeń bez zmian).
  const guests = await prisma.$executeRaw`
    UPDATE "MeetingParticipant" mp SET "hasVotingRight" = false
    FROM "Meeting" m WHERE m.id = mp."meetingId" AND mp."isInvitedGuest" = true AND mp."hasVotingRight" = true
      AND m.status NOT IN ('CLOSED', 'ARCHIVED', 'CANCELLED')`;
  if (guests) console.log(`[migrate] Goście bez prawa głosu: ${guests}`);

  // Dawne szablony składu -> grupy organizacyjne. Nazwa, opis, osoby i domyślne prawo głosu bez zmian;
  // typ neutralny (UNCLASSIFIED) do klasyfikacji przez operatora, bez dat członkostwa (brak danych).
  // Mapowanie identyfikowalne: OrgUnit.legacyTemplateId = MeetingTemplate.id. Dawnych posiedzeń nie
  // przypisujemy do grup (brak zapisanego powiązania). Szablony zostają w bazie bez zmian.
  const templates = await prisma.meetingTemplate.findMany({ include: { members: true } });
  let movedUnits = 0, movedMembers = 0;
  for (const t of templates) {
    const exists = await prisma.orgUnit.findUnique({ where: { legacyTemplateId: t.id }, select: { id: true } });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      const unit = await tx.orgUnit.create({
        data: { name: t.name, description: t.description, kind: "UNCLASSIFIED", legacyTemplateId: t.id },
      });
      if (t.members.length) {
        await tx.orgUnitMember.createMany({
          data: t.members.map((m) => ({ orgUnitId: unit.id, userId: m.userId, defaultVotingRight: m.hasVotingRight })),
        });
      }
    });
    movedUnits++; movedMembers += t.members.length;
  }
  if (movedUnits) console.log(`[migrate] Szablony składu przeniesione do grup organizacyjnych: ${movedUnits} (osób: ${movedMembers})`);
}

main()
  .catch((e) => { console.error("[migrate] Błąd migracji danych:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
