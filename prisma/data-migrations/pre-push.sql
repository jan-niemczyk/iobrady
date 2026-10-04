-- Migracje wykonywane PRZED `prisma db push` (scripts/migrate.sh).
--
-- Zasada (SA-13): `db push` uruchamiany jest BEZ --accept-data-loss - jeśli schemat wymagałby
-- utraty danych, start kontenera się zatrzymuje. Zmiany, które Prisma zgłasza jako "możliwą
-- utratę danych", choć po migracji danych żadnych danych nie usuwają, wykonujemy tutaj jawnie
-- i przejrzyście. Skrypt jest idempotentny i bezpieczny na pustej bazie (nowa instalacja).

DO $$
DECLARE
  ids text[];
  col record;
BEGIN
  -- ── SA-07: token ekranu (nowa kolumna opcjonalna + unikalny indeks) ─────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'Meeting') THEN
    ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "displayToken" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "Meeting_displayToken_key" ON "Meeting"("displayToken");
  END IF;

  -- ── Historyczne: typ głosowania FORMAL zastąpiony przez STANDARD (dawny migrate-remove-formal.sql).
  -- Dotyczy tylko bardzo starych instalacji; po zamianie wartość jest usuwana z enuma VoteType.
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'VoteType' AND e.enumlabel = 'FORMAL'
  ) THEN
    UPDATE "Vote" SET "type" = 'STANDARD' WHERE "type"::text = 'FORMAL';
    ALTER TYPE "VoteType" RENAME TO "VoteType_old";
    CREATE TYPE "VoteType" AS ENUM ('STANDARD', 'LIST', 'QUORUM', 'PACKAGE');
    FOR col IN
      SELECT c.table_name, c.column_name, c.column_default FROM information_schema.columns c
      WHERE c.table_schema = current_schema() AND c.udt_name = 'VoteType_old'
    LOOP
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', col.table_name, col.column_name);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE "VoteType" USING %I::text::"VoteType"', col.table_name, col.column_name, col.column_name);
      IF col.column_default IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %L::"VoteType"', col.table_name, col.column_name,
          regexp_replace(col.column_default, '^''([A-Z_]+)''.*$', '\1'));
      END IF;
    END LOOP;
    DROP TYPE "VoteType_old";
  END IF;

  -- ── BR-5: usunięcie globalnej roli konta CHAIRPERSON ────────────────────────────────
  -- Przewodniczący to funkcja w posiedzeniu (MeetingParticipant.isChairperson) - te przypisania
  -- pozostają bez zmian. Konta z rolą CHAIRPERSON stają się PARTICIPANT (wpis w dzienniku),
  -- następnie typ Role jest odtwarzany bez tej wartości (PostgreSQL nie usuwa wartości enuma).
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'Role' AND e.enumlabel = 'CHAIRPERSON'
  ) THEN
    SELECT array_agg(id ORDER BY id) INTO ids FROM "User" WHERE role::text = 'CHAIRPERSON';
    IF ids IS NOT NULL THEN
      UPDATE "User" SET role = 'PARTICIPANT' WHERE id = ANY(ids);
      INSERT INTO "AuditLog" (id, action, description, metadata, "createdAt")
      VALUES (
        'mig-br5-' || md5(array_to_string(ids, ',')),
        'SETTINGS_CHANGED',
        'Migracja BR-5: rola konta CHAIRPERSON zmieniona na PARTICIPANT (przewodniczący wskazywany w posiedzeniu)',
        jsonb_build_object('migration', 'BR-5', 'userIds', to_jsonb(ids)),
        now()
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Pozostałe kolumny typu Role (np. LoginEvent.role) - ta sama zamiana wartości.
    FOR col IN
      SELECT c.table_name, c.column_name FROM information_schema.columns c
      WHERE c.table_schema = current_schema() AND c.udt_name = 'Role'
    LOOP
      EXECUTE format('UPDATE %I SET %I = %L WHERE %I::text = %L', col.table_name, col.column_name, 'PARTICIPANT', col.column_name, 'CHAIRPERSON');
    END LOOP;

    ALTER TYPE "Role" RENAME TO "Role_old";
    CREATE TYPE "Role" AS ENUM ('OPERATOR', 'PARTICIPANT');
    FOR col IN
      SELECT c.table_name, c.column_name, c.column_default FROM information_schema.columns c
      WHERE c.table_schema = current_schema() AND c.udt_name = 'Role_old'
    LOOP
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', col.table_name, col.column_name);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE "Role" USING %I::text::"Role"', col.table_name, col.column_name, col.column_name);
      IF col.column_default IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %L::"Role"', col.table_name, col.column_name,
          regexp_replace(col.column_default, '^''([A-Z_]+)''.*$', '\1'));
      END IF;
    END LOOP;
    DROP TYPE "Role_old";
  END IF;
END $$;
