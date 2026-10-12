#!/bin/sh
# Szyfrowana kopia zapasowa iOBRADY: baza (pg_dump) + pliki (logo/plansza, załączniki).
#
# Klucz: plik z hasłem szyfrującym (BACKUP_KEY_FILE, domyślnie ~/iobrady-backup.key,
# uprawnienia 600). Utworzenie:  openssl rand -base64 48 > ~/iobrady-backup.key && chmod 600 ~/iobrady-backup.key
# KOPIĘ KLUCZA trzymaj POZA serwerem (sejf / menedżer haseł) - bez niej kopii nie da się odtworzyć.
# Pliki kopii: AES-256-CBC + PBKDF2 (openssl enc), suma SHA-256 obok oraz podpis HMAC-SHA256
# (plik .mac, klucz wyprowadzony z klucza kopii) - restore.sh odrzuci kopię podmienioną lub
# zmienioną przez kogoś bez klucza (sama suma SHA-256 chroni tylko przed przypadkowym uszkodzeniem).
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
# Brak .env nie jest błędem (zmienne mogą przyjść ze środowiska) - funkcja zawsze kończy się kodem 0,
# inaczej przy set -e przypisanie z $(envval ...) przerwałoby skrypt.
envval() { [ -f .env ] || return 0; sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
DB_USER="${POSTGRES_USER:-$(envval POSTGRES_USER)}"; DB_USER="${DB_USER:-iobrady}"
DB_NAME="${POSTGRES_DB:-$(envval POSTGRES_DB)}"; DB_NAME="${DB_NAME:-iobrady}"
DB_DUMP_CMD="${DB_DUMP_CMD:-docker compose exec -T db pg_dump -U $DB_USER --no-owner $DB_NAME}"
FILES_TAR_CMD="${FILES_TAR_CMD:-docker compose exec -T app tar -C /app -cf - public/uploads storage/attachments}"
enc() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY"; }
dec() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY"; }
# Klucz HMAC wyprowadzony z klucza kopii (osobny cel niż szyfrowanie). Ta sama funkcja w restore.sh.
mac_key() { { printf 'iobrady-backup-mac-v1:'; cat "$KEY"; } | openssl dgst -sha256 -r | cut -d' ' -f1; }
mac_of() { openssl dgst -sha256 -mac HMAC -macopt "hexkey:$MK" -r "$1" | cut -d' ' -f1; }
MK=$(mac_key)

# Każdy etap ma własny kod wyjścia: /bin/sh (POSIX) nie ma pipefail, a kod potoku to kod ostatniego
# polecenia - błąd pg_dump/tar byłby przesłonięty sukcesem szyfrowania. Statusy etapów trafiają do
# plików, kopia powstaje w katalogu tymczasowym i jest publikowana dopiero po sprawdzeniu.
T=$(mktemp -d "$OUT/.niedokonczona-$STAMP.XXXXXX")
trap 'rm -rf "$T"' EXIT INT TERM
fail() { echo "BŁĄD KOPII: $*" >&2; exit 1; }

# $1 - polecenie źródłowe, $2 - plik wynikowy; tworzy zaszyfrowany plik albo kończy skrypt błędem.
backup_part() {
  # „a && echo 0 || echo $?” - kod etapu zapisany także przy set -e (polecenie w liście || nie przerywa).
  { sh -c "$1" && echo 0 > "$T/st.src" || echo $? > "$T/st.src"; } \
    | { gzip -9 && echo 0 > "$T/st.gz" || echo $? > "$T/st.gz"; } \
    | enc > "$2" && st_enc=0 || st_enc=$?
  st_src=$(cat "$T/st.src" 2>/dev/null || echo 99); st_gz=$(cat "$T/st.gz" 2>/dev/null || echo 99)
  [ "$st_src" = 0 ] || fail "źródło zakończyło się kodem $st_src: $1"
  [ "$st_gz" = 0 ] || fail "kompresja zakończyła się kodem $st_gz"
  [ "$st_enc" = 0 ] || fail "szyfrowanie zakończyło się kodem $st_enc"
  rm -f "$T/st.src" "$T/st.gz"
}

backup_part "$DB_DUMP_CMD" "$T/db.enc"
backup_part "$FILES_TAR_CMD" "$T/files.enc"

# Kontrola odczytu: odszyfrowanie i rozpakowanie bez zapisu treści na dysk.
db_bytes=$(dec < "$T/db.enc" | gzip -dc | wc -c | tr -d ' ')
[ "${db_bytes:-0}" -gt 0 ] || fail "zrzut bazy jest pusty albo nie daje się odczytać"
if [ "$DB_DUMP_CMD" = "docker compose exec -T db pg_dump -U $DB_USER --no-owner $DB_NAME" ]; then
  dec < "$T/db.enc" | gzip -dc | head -c 4096 | grep -q "PostgreSQL database dump" \
    || fail "zrzut bazy nie wygląda na wynik pg_dump"
fi
{ dec < "$T/files.enc" | gzip -dc | tar -tf - > /dev/null; } 2>/dev/null || fail "archiwum plików nie daje się odczytać"

# Publikacja kompletu dopiero po sukcesie wszystkich etapów.
mv "$T/db.enc" "$OUT/iobrady-db-$STAMP.sql.gz.enc"
mv "$T/files.enc" "$OUT/iobrady-files-$STAMP.tar.gz.enc"
(cd "$OUT" && sha256sum "iobrady-db-$STAMP.sql.gz.enc" "iobrady-files-$STAMP.tar.gz.enc" > "iobrady-$STAMP.sha256")
{ for f in "iobrady-db-$STAMP.sql.gz.enc" "iobrady-files-$STAMP.tar.gz.enc"; do
    echo "$(mac_of "$OUT/$f")  $f"
  done; } > "$T/mac" || fail "podpis HMAC nieudany"
mv "$T/mac" "$OUT/iobrady-$STAMP.mac"
chmod 600 "$OUT"/iobrady-*-"$STAMP".* "$OUT/iobrady-$STAMP.sha256" "$OUT/iobrady-$STAMP.mac"
echo "Kopia: $OUT/iobrady-db-$STAMP.sql.gz.enc, $OUT/iobrady-files-$STAMP.tar.gz.enc (+ .sha256, .mac)"
