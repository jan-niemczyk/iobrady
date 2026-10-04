#!/bin/sh
# Szyfrowana kopia zapasowa iOBRADY: baza (pg_dump) + pliki (logo/plansza, załączniki).
#
# Klucz: plik z hasłem szyfrującym (BACKUP_KEY_FILE, domyślnie ~/iobrady-backup.key,
# uprawnienia 600). Utworzenie:  openssl rand -base64 48 > ~/iobrady-backup.key && chmod 600 ~/iobrady-backup.key
# KOPIĘ KLUCZA trzymaj POZA serwerem (sejf / menedżer haseł) - bez niej kopii nie da się odtworzyć.
# Pliki kopii: AES-256-CBC + PBKDF2 (openssl enc), suma SHA-256 obok.
#
# Użycie na serwerze (katalog z docker-compose.yml):   ./scripts/backup.sh [katalog_docelowy]
# Zmienne do testów lokalnych: DB_DUMP_CMD, FILES_TAR_CMD (polecenia zapisujące na stdout).
set -eu
OUT="${1:-${BACKUP_DIR:-$HOME/iobrady-backups}}"
KEY="${BACKUP_KEY_FILE:-$HOME/iobrady-backup.key}"
[ -r "$KEY" ] || { echo "Brak pliku klucza kopii: $KEY (utwórz: openssl rand -base64 48 > $KEY && chmod 600 $KEY)" >&2; exit 1; }
mkdir -p "$OUT"; chmod 700 "$OUT"
OUT=$(cd "$OUT" && pwd); KEY=$(cd "$(dirname "$KEY")" && pwd)/$(basename "$KEY")
STAMP=$(date +%F-%H%M%S)
cd "$(dirname "$0")/.."
# Nazwa użytkownika i bazy z .env (te same co w docker-compose.yml).
envval() { [ -f .env ] && sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
DB_USER="${POSTGRES_USER:-$(envval POSTGRES_USER)}"; DB_USER="${DB_USER:-iobrady}"
DB_NAME="${POSTGRES_DB:-$(envval POSTGRES_DB)}"; DB_NAME="${DB_NAME:-iobrady}"
DB_DUMP_CMD="${DB_DUMP_CMD:-docker compose exec -T db pg_dump -U $DB_USER --no-owner $DB_NAME}"
FILES_TAR_CMD="${FILES_TAR_CMD:-docker compose exec -T app tar -C /app -cf - public/uploads storage/attachments}"
enc() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY"; }

sh -c "$DB_DUMP_CMD" | gzip -9 | enc > "$OUT/iobrady-db-$STAMP.sql.gz.enc"
sh -c "$FILES_TAR_CMD" | gzip -9 | enc > "$OUT/iobrady-files-$STAMP.tar.gz.enc"
(cd "$OUT" && sha256sum "iobrady-db-$STAMP.sql.gz.enc" "iobrady-files-$STAMP.tar.gz.enc" > "iobrady-$STAMP.sha256")
chmod 600 "$OUT"/iobrady-*-"$STAMP".* "$OUT/iobrady-$STAMP.sha256"
echo "Kopia: $OUT/iobrady-db-$STAMP.sql.gz.enc, $OUT/iobrady-files-$STAMP.tar.gz.enc (+ .sha256)"
