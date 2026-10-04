#!/bin/sh
# Migracja bazy przy starcie kontenera (SA-13). Zatrzymuje start przy każdym błędzie.
#  1. migracje danych przed zmianą schematu (prisma/data-migrations/pre-push.sql),
#  2. prisma db push BEZ --accept-data-loss - zmiana wymagająca utraty danych przerywa start,
#  3. migracje danych po zmianie schematu (scripts/post-migrate.ts).
# Przed wdrożeniem zmiany schematu na produkcji: kopia zapasowa (scripts/backup.sh).
set -eu
# Praca nad kodem (npm run db:migrate): zmienne z .env. W kontenerze .env nie istnieje - ustawia je compose.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then set -a; . ./.env; set +a; fi
node scripts/check-env.mjs
echo "[migrate] 1/3 migracje danych przed zmianą schematu"
npx prisma db execute --file prisma/data-migrations/pre-push.sql --schema prisma/schema.prisma
echo "[migrate] 2/3 schemat (bez akceptacji utraty danych)"
if ! npx prisma db push --skip-generate; then
  echo "[migrate] STOP: zmiana schematu wymagałaby utraty danych albo się nie powiodła. Dane NIE zostały zmienione." >&2
  echo "[migrate] Przygotuj jawną migrację danych w prisma/data-migrations/pre-push.sql i wdróż ponownie." >&2
  exit 1
fi
echo "[migrate] 3/3 migracje danych po zmianie schematu"
npx tsx scripts/post-migrate.ts
echo "[migrate] gotowe"
