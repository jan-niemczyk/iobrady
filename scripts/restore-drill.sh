#!/bin/sh
# Próba odtworzenia kopii (ćwiczenie odtworzeniowe): sprawdza podpis i sumy, odtwarza bazę do
# JEDNORAZOWEGO kontenera PostgreSQL (bez sieci, usuwany po próbie), liczy rekordy w kluczowych
# tabelach i sprawdza archiwum plików - bez dotykania działającej instalacji.
#
# Użycie na serwerze (katalog z docker-compose.yml):
#   ./scripts/restore-drill.sh [katalog_kopii] [STAMP]     (domyślnie najnowsza kopia)
# Zalecane cyklicznie (np. raz w miesiącu z crona) - kopia, której nie da się odtworzyć, nie jest kopią.
# Do testów bez Dockera: DRILL_DATABASE_URL=<pusta baza testowa> (zamiast kontenera).
set -eu
DIR="${1:-${BACKUP_DIR:-$HOME/iobrady-backups}}"
DIR=$(cd "$DIR" && pwd)
STAMP="${2:-$(ls "$DIR"/iobrady-db-*.sql.gz.enc 2>/dev/null | sed 's/.*iobrady-db-\(.*\)\.sql\.gz\.enc$/\1/' | sort | tail -n 1)}"
[ -n "$STAMP" ] || { echo "Brak kopii w $DIR" >&2; exit 1; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
echo "Próba odtworzenia kopii $STAMP z $DIR"

if [ -n "${DRILL_DATABASE_URL:-}" ]; then
  PSQL="psql -v ON_ERROR_STOP=1 -q $DRILL_DATABASE_URL"
  cleanup() { :; }
else
  C="iobrady-restore-drill-$$"
  PW=$(openssl rand -hex 16)
  docker run -d --rm --name "$C" --network none -e POSTGRES_USER=drill -e POSTGRES_PASSWORD="$PW" \
    -e POSTGRES_DB=drill postgres:16-alpine > /dev/null
  cleanup() { docker rm -f "$C" > /dev/null 2>&1 || true; }
  trap cleanup EXIT INT TERM
  i=0; until docker exec "$C" pg_isready -U drill -d drill > /dev/null 2>&1; do
    i=$((i+1)); [ $i -lt 60 ] || { echo "Kontener PostgreSQL nie wystartował" >&2; exit 1; }; sleep 1
  done
  sleep 2
  PSQL="docker exec -i $C psql -v ON_ERROR_STOP=1 -q -U drill drill"
fi

DB_RESTORE_CMD="$PSQL" FILES_UNTAR_CMD="tar -tf - > \"\${TMPDIR:-/tmp}/iobrady-drill-files-$$.txt\"" \
  sh "$ROOT/scripts/restore.sh" "$DIR" "$STAMP"

count() { echo "SELECT count(*) FROM \"$1\";" | $PSQL -t -A 2>/dev/null | tr -d ' \r'; }
fails=0
for t in User Meeting Vote AuditLog; do
  n=$(count "$t" || true)
  if [ -n "$n" ]; then echo "  $t: $n"; else echo "  $t: BRAK TABELI"; fails=1; fi
done
[ "$(count User)" -gt 0 ] 2>/dev/null || { echo "  Brak kont użytkowników w odtworzonej bazie"; fails=1; }
LIST="${TMPDIR:-/tmp}/iobrady-drill-files-$$.txt"
echo "  pliki w archiwum: $(grep -vc '/$' "$LIST" 2>/dev/null || echo 0)"
rm -f "$LIST"
if [ "$fails" = 0 ]; then echo "PRÓBA ODTWORZENIA: OK ($STAMP)"; else echo "PRÓBA ODTWORZENIA: BŁĄD ($STAMP)" >&2; fi
exit $fails
