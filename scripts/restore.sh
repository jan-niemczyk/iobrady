#!/bin/sh
# Odtworzenie kopii z scripts/backup.sh. Sprawdza sumy SHA-256, odszyfrowuje i wgrywa.
#
# Użycie:  ./scripts/restore.sh <katalog_kopii> <STAMP>        (np. 2026-10-04-120000)
# Baza jest wgrywana do PUSTEJ bazy (najpierw: docker compose up -d db; dropdb/createdb lub nowy wolumen).
# Po odtworzeniu bazy uruchom aplikację (scripts/migrate.sh wykona się przy starcie).
# Hasło SMTP w bazie jest zaszyfrowane kluczem APP_ENCRYPTION_KEY - przywróć też ten klucz w .env.
# Zmienne do testów lokalnych: DB_RESTORE_CMD, FILES_UNTAR_CMD (polecenia czytające ze stdin).
set -eu
[ $# -eq 2 ] || { echo "Użycie: ./scripts/restore.sh <katalog_kopii> <STAMP>" >&2; exit 1; }
DIR=$(cd "$1" && pwd); STAMP="$2"
KEY="${BACKUP_KEY_FILE:-$HOME/iobrady-backup.key}"
KEY=$(cd "$(dirname "$KEY")" && pwd)/$(basename "$KEY")
cd "$(dirname "$0")/.."
# Nazwa użytkownika i bazy z .env (te same co w docker-compose.yml).
envval() { [ -f .env ] && sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
DB_USER="${POSTGRES_USER:-$(envval POSTGRES_USER)}"; DB_USER="${DB_USER:-iobrady}"
DB_NAME="${POSTGRES_DB:-$(envval POSTGRES_DB)}"; DB_NAME="${DB_NAME:-iobrady}"
DB_RESTORE_CMD="${DB_RESTORE_CMD:-docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U $DB_USER $DB_NAME}"
FILES_UNTAR_CMD="${FILES_UNTAR_CMD:-docker compose run --rm --no-deps -T app tar -C /app -xf -}"
dec() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY"; }

(cd "$DIR" && sha256sum -c "iobrady-$STAMP.sha256")
# Najpierw odszyfrowanie i sprawdzenie archiwów do plików tymczasowych - zły klucz lub uszkodzony
# plik zatrzymuje odtwarzanie, zanim cokolwiek trafi do bazy.
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"
dec < "$DIR/iobrady-db-$STAMP.sql.gz.enc" > "$TMP/db.sql.gz" || { echo "Odszyfrowanie bazy nieudane (zły klucz?)" >&2; exit 1; }
dec < "$DIR/iobrady-files-$STAMP.tar.gz.enc" > "$TMP/files.tar.gz" || { echo "Odszyfrowanie plików nieudane (zły klucz?)" >&2; exit 1; }
gzip -t "$TMP/db.sql.gz" && gzip -t "$TMP/files.tar.gz" || { echo "Archiwum uszkodzone" >&2; exit 1; }
gunzip -c "$TMP/db.sql.gz" | sh -c "$DB_RESTORE_CMD"
gunzip -c "$TMP/files.tar.gz" | sh -c "$FILES_UNTAR_CMD"
echo "Odtworzono kopię $STAMP."
