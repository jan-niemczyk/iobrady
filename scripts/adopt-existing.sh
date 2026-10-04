#!/bin/sh
# Przejście ISTNIEJĄCEJ instalacji (wgranej z paczki, bez git) na wersję z repozytorium git,
# z zachowaniem danych. Uruchamiać z katalogu NOWEGO klonu repozytorium:
#
#   ./scripts/adopt-existing.sh /root/esog
#
# Co robi:
#  1. kopia bazy z działającej instalacji (pg_dump, plik chmod 600 w katalogu domowym),
#  2. kopiuje .env (cp, nie mv) i uzupełnia brakujące wartości: POSTGRES_* z działającej bazy,
#     APP_ENCRYPTION_KEY (losowy), COMPOSE_PROJECT_NAME (żeby użyć TYCH SAMYCH wolumenów z danymi),
#  3. buduje obraz nowej wersji, gdy stara jeszcze działa (błąd budowy = stara działa dalej),
#  4. tworzy klucz kopii zapasowych (jeśli brak),
#  5. zatrzymuje starą instalację, przenosi jej katalog do <stary>-przed-git-<data> (nic nie kasuje),
#     przenosi nowy klon na miejsce starego i uruchamia go (./scripts/update.sh bez git pull).
# Wycofanie: patrz komunikat na końcu / INSTALACJA.md.
set -eu
OLD="${1:?Podaj katalog istniejącej instalacji, np. ./scripts/adopt-existing.sh /root/esog}"
NEW=$(cd "$(dirname "$0")/.." && pwd)
OLD=$(cd "$OLD" && pwd)
[ "$OLD" != "$NEW" ] || { echo "Uruchom z katalogu nowego klonu, nie ze starej instalacji." >&2; exit 1; }
[ -f "$OLD/.env" ] && [ -f "$OLD/docker-compose.yml" ] || { echo "W $OLD brak .env lub docker-compose.yml." >&2; exit 1; }
STAMP=$(date +%F-%H%M%S)
oldc() { docker compose --project-directory "$OLD" -f "$OLD/docker-compose.yml" "$@"; }
envval() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$2" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
setenv() { # dopisz zmienną do nowego .env, jeśli jej brak (bez wypisywania wartości)
  if [ -z "$(envval "$1" "$NEW/.env")" ]; then printf '\n%s=%s\n' "$1" "$2" >> "$NEW/.env"; echo "  uzupełniono $1"; fi
}

echo "== 1/6 Kopia bazy istniejącej instalacji"
dbcid=$(oldc ps -q db)
[ -n "$dbcid" ] || { echo "Baza starej instalacji nie działa - uruchom ją (docker compose up -d) i powtórz." >&2; exit 1; }
dbenv() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$dbcid" | sed -n "s/^$1=//p"; }
PGU=$(dbenv POSTGRES_USER); PGD=$(dbenv POSTGRES_DB); PGP=$(dbenv POSTGRES_PASSWORD)
DUMP="$HOME/iobrady-przed-git-$STAMP.sql.gz"
oldc exec -T db pg_dump -U "${PGU:-postgres}" "${PGD:-postgres}" | gzip > "$DUMP"
chmod 600 "$DUMP"
echo "  zapisano $DUMP ($(du -h "$DUMP" | cut -f1))"

echo "== 2/6 Konfiguracja (.env)"
cp "$OLD/.env" "$NEW/.env"; chmod 600 "$NEW/.env"
setenv POSTGRES_USER "$PGU"
setenv POSTGRES_DB "$PGD"
setenv POSTGRES_PASSWORD "$PGP"
setenv COMPOSE_PROJECT_NAME "$(basename "$OLD")"
setenv APP_ENCRYPTION_KEY "$(openssl rand -base64 32)"
sec=$(envval NEXTAUTH_SECRET "$NEW/.env")
if [ "${#sec}" -lt 32 ]; then # za krótki sekret sesji -> nowy (użytkownicy i tak logują się ponownie)
  NEWSEC=$(openssl rand -base64 32) awk '/^[[:space:]]*NEXTAUTH_SECRET[[:space:]]*=/ { next } { print } END { print "NEXTAUTH_SECRET=" ENVIRON["NEWSEC"] }' "$NEW/.env" > "$NEW/.env.tmp"
  mv "$NEW/.env.tmp" "$NEW/.env"; chmod 600 "$NEW/.env"; echo "  NEXTAUTH_SECRET był krótszy niż 32 znaki - ustawiono nowy"
fi
if [ -z "$(envval DOMAIN "$NEW/.env")" ]; then
  h=$(envval NEXTAUTH_URL "$NEW/.env" | sed -E 's#^[a-z]+://##; s#/.*$##; s#:.*$##')
  [ -n "$h" ] && setenv DOMAIN "$h"
fi
"$NEW/scripts/check-env.sh"

echo "== 3/6 Budowa nowej wersji (stara instalacja działa dalej)"
(cd "$NEW" && docker compose build)

echo "== 4/6 Klucz kopii zapasowych"
KEY="${BACKUP_KEY_FILE:-$HOME/iobrady-backup.key}"
if [ ! -f "$KEY" ]; then (umask 077; openssl rand -base64 48 > "$KEY"); echo "  utworzono $KEY - SKOPIUJ go poza serwer."; else echo "  istnieje: $KEY"; fi

echo "== 5/6 Zamiana katalogów (stara instalacja zostaje jako kopia)"
oldc down
mv "$OLD" "$OLD-przed-git-$STAMP"
mv "$NEW" "$OLD"
cd "$OLD"

echo "== 6/6 Uruchomienie nowej wersji"
if SKIP_BACKUP=1 ./scripts/update.sh --no-pull; then
  echo
  echo "Gotowe. Instalacja w $OLD korzysta teraz z git; kolejne aktualizacje: cd $OLD && ./scripts/update.sh"
  echo "Poprzednie pliki: $OLD-przed-git-$STAMP (można usunąć po kilku dniach). Kopia bazy: $DUMP"
else
  echo >&2
  echo "Uruchomienie nie powiodło się. Wycofanie do poprzedniej wersji:" >&2
  echo "  cd $OLD && docker compose down && cd .. && mv $OLD $OLD-git-nieudane-$STAMP && mv $OLD-przed-git-$STAMP $OLD && cd $OLD && docker compose up -d" >&2
  exit 1
fi
