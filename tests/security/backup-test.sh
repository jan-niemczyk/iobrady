#!/bin/sh
# Test skryptu kopii (IA-08): błąd dowolnego źródła = kod błędu i brak opublikowanej kopii;
# poprawne źródła = komplet plików, które dają się odszyfrować i rozpakować.
# Bez Dockera i bazy: źródła zastąpione poleceniami testowymi (DB_DUMP_CMD, FILES_TAR_CMD).
# Uruchomienie z katalogu repozytorium:  sh tests/security/backup-test.sh  (inna powłoka: BACKUP_SH=bash)
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
openssl rand -base64 48 > "$W/key"; chmod 600 "$W/key"
mkdir -p "$W/src/public/uploads"; echo "plik" > "$W/src/public/uploads/a.txt"
OK_DB='printf -- "--\n-- PostgreSQL database dump\n--\nSELECT 1;\n"'
OK_TAR="tar -C $W/src -cf - public"
pass=0; failn=0
check() { if [ "$2" = 1 ]; then pass=$((pass+1)); echo "[OK  ] $1"; else failn=$((failn+1)); echo "[BŁĄD] $1"; fi; }
run() { # $1 nazwa katalogu, $2 DB_DUMP_CMD, $3 FILES_TAR_CMD
  BACKUP_KEY_FILE="$W/key" DB_DUMP_CMD="$2" FILES_TAR_CMD="$3" ${BACKUP_SH:-sh} "$ROOT/scripts/backup.sh" "$W/$1" > "$W/$1.log" 2>&1
}
published() { ls "$W/$1"/iobrady-* 2>/dev/null | wc -l | tr -d ' '; }
leftovers() { ls -a "$W/$1" 2>/dev/null | grep -c niedokonczona; }

run both-fail "exit 7" "exit 8"; rc=$?
check "Oba źródła z błędem: kod błędu" "$([ $rc -ne 0 ] && echo 1)"
check "Oba źródła z błędem: brak opublikowanych plików" "$([ "$(published both-fail)" = 0 ] && echo 1)"
check "Oba źródła z błędem: brak komunikatu „Kopia:”" "$(grep -q '^Kopia:' "$W/both-fail.log" || echo 1)"

run db-fail "exit 7" "$OK_TAR"; rc=$?
check "Błąd zrzutu bazy: kod błędu, brak plików" "$([ $rc -ne 0 ] && [ "$(published db-fail)" = 0 ] && echo 1)"

run tar-fail "$OK_DB" "exit 8"; rc=$?
check "Błąd archiwum plików: kod błędu, brak plików" "$([ $rc -ne 0 ] && [ "$(published tar-fail)" = 0 ] && echo 1)"

run db-empty "true" "$OK_TAR"; rc=$?
check "Pusty zrzut bazy: kod błędu" "$([ $rc -ne 0 ] && [ "$(published db-empty)" = 0 ] && echo 1)"

run tar-garbage "$OK_DB" "echo nie-tar"; rc=$?
check "Uszkodzone archiwum plików: kod błędu" "$([ $rc -ne 0 ] && [ "$(published tar-garbage)" = 0 ] && echo 1)"

run ok "$OK_DB" "$OK_TAR"; rc=$?
check "Poprawne źródła: kod 0 i cztery pliki (2 kopie, .sha256, .mac)" "$([ $rc -eq 0 ] && [ "$(published ok)" = 4 ] && echo 1)"
DB=$(ls "$W/ok"/iobrady-db-*.enc)
check "Kopia bazy odszyfrowuje się do treści źródła" "$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$W/key" < "$DB" | gzip -dc | grep -q 'SELECT 1;' && echo 1)"
check "Suma kontrolna zgodna" "$(cd "$W/ok" && sha256sum -c iobrady-*.sha256 > /dev/null 2>&1 && echo 1)"
check "Podpis HMAC obok kopii" "$([ -f "$(ls "$W/ok"/iobrady-*.mac 2>/dev/null | head -n 1)" ] && echo 1)"
STAMP=$(basename "$DB" | sed 's/^iobrady-db-\(.*\)\.sql\.gz\.enc$/\1/')
restore() { # $1 katalog kopii; dalsze zmienne środowiska z wywołania
  BACKUP_KEY_FILE="${RKEY:-$W/key}" DB_RESTORE_CMD="cat > $W/restored.sql" FILES_UNTAR_CMD="tar -tf - > /dev/null" \
    ${BACKUP_SH:-sh} "$ROOT/scripts/restore.sh" "$1" "$STAMP" > "$W/restore.log" 2>&1
}
rm -f "$W/restored.sql"; restore "$W/ok"; rc=$?
check "Odtworzenie poprawnej kopii: kod 0 i treść bazy" "$([ $rc -eq 0 ] && grep -q 'SELECT 1;' "$W/restored.sql" && echo 1)"
# Podmiana pliku przez kogoś bez klucza: nowa (poprawna) suma SHA-256, ale podpis HMAC się nie zgadza.
cp -r "$W/ok" "$W/tamper"; openssl rand -base64 48 > "$W/key2"
printf -- "--\n-- PostgreSQL database dump\n--\nDROP TABLE x;\n" | gzip | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$W/key2" > "$(ls "$W/tamper"/iobrady-db-*.enc)"
(cd "$W/tamper" && sha256sum iobrady-db-*.enc iobrady-files-*.enc > "iobrady-$STAMP.sha256")
rm -f "$W/restored.sql"; restore "$W/tamper"; rc=$?
check "Podmieniona kopia (zgodna suma SHA-256): odrzucona przed wgraniem" "$([ $rc -ne 0 ] && [ ! -f "$W/restored.sql" ] && grep -q 'HMAC' "$W/restore.log" && echo 1)"
cp -r "$W/ok" "$W/unsigned"; rm -f "$W/unsigned"/*.mac
restore "$W/unsigned"; rc=$?
check "Kopia bez podpisu: odrzucona bez jawnej zgody" "$([ $rc -ne 0 ] && echo 1)"
rm -f "$W/restored.sql"; ALLOW_UNSIGNED_BACKUP=1 restore "$W/unsigned"; rc=$?
check "Kopia bez podpisu: odtworzona z ALLOW_UNSIGNED_BACKUP=1" "$([ $rc -eq 0 ] && [ -f "$W/restored.sql" ] && echo 1)"
rm -f "$W/restored.sql"; RKEY="$W/key2" restore "$W/ok"; rc=$?
check "Inny klucz: odtworzenie odrzucone" "$([ $rc -ne 0 ] && [ ! -f "$W/restored.sql" ] && echo 1)"
check "Brak katalogów tymczasowych po żadnym przebiegu" "$(n=0; for d in both-fail db-fail tar-fail db-empty tar-garbage ok; do n=$((n+$(leftovers $d))); done; [ $n = 0 ] && echo 1)"

echo "WYNIK $pass/$((pass+failn))"
[ "$failn" = 0 ]
