#!/bin/sh
# Aktualizacja instalacji jedną komendą (na serwerze, w katalogu aplikacji):
#
#   ./scripts/update.sh
#
# Kolejno: kontrola .env -> szyfrowana kopia zapasowa -> git pull -> kontrola .env nowej wersji
# -> budowa i uruchomienie (migracja bazy przy starcie, bez akceptacji utraty danych)
# -> oczekiwanie, aż aplikacja zgłosi gotowość. Przy błędzie zatrzymuje się i pokazuje logi.
#
# Zmienne: SKIP_BACKUP=1 (bez kopii - NIE zalecane), BACKUP_KEY_FILE, BACKUP_DIR (patrz backup.sh).
# Opcja --no-pull: bez pobierania nowej wersji (np. po ręcznym `git checkout` albo pierwszym starcie).
set -eu
# git pull podmienia ten plik w trakcie działania - wykonujemy kopię z katalogu tymczasowego.
if [ -z "${IOBRADY_UPDATE_COPY:-}" ]; then
  tmp=$(mktemp)
  cp "$0" "$tmp"
  IOBRADY_UPDATE_COPY="$tmp" IOBRADY_APP_DIR=$(cd "$(dirname "$0")/.." && pwd) exec sh "$tmp" "$@"
fi
trap 'rm -f "$IOBRADY_UPDATE_COPY"' EXIT
cd "$IOBRADY_APP_DIR"
PULL=1
[ "${1:-}" = "--no-pull" ] && PULL=0
step() { printf '\n== %s\n' "$*"; }

step "1/6 Kontrola konfiguracji (.env)"
./scripts/check-env.sh

step "2/6 Kopia zapasowa"
if [ "${SKIP_BACKUP:-0}" = "1" ]; then
  echo "Pominięto (SKIP_BACKUP=1)."
elif [ -z "$(docker compose ps -q db 2>/dev/null)" ]; then
  echo "Baza nie działa - brak danych do skopiowania (pierwsze uruchomienie?). Pomijam."
else
  ./scripts/backup.sh
fi

step "3/6 Pobranie nowej wersji (git)"
before=$(git rev-parse --short HEAD)
if [ "$PULL" = "0" ]; then
  echo "Pominięto (--no-pull)."
elif [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "BŁĄD: w katalogu są lokalne zmiany plików aplikacji (git status). Aktualizacja przerwana," >&2
  echo "żeby ich nie nadpisać. Konfiguracja instalacji ma być tylko w .env." >&2
  git status --short --untracked-files=no >&2
  exit 1
else
  git pull --ff-only
fi
after=$(git rev-parse --short HEAD)
echo "Wersja: $before -> $after"

step "4/6 Kontrola konfiguracji nowej wersji"
./scripts/check-env.sh

step "5/6 Budowa i uruchomienie"
docker compose up -d --build

step "6/6 Oczekiwanie na gotowość aplikacji (do 10 min)"
cid=$(docker compose ps -q app)
i=0
while :; do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "brak")
  [ "$status" = "healthy" ] && break
  if [ "$status" = "unhealthy" ] || [ $i -ge 120 ]; then
    echo "BŁĄD: aplikacja nie zgłosiła gotowości (stan: $status). Ostatnie logi:" >&2
    docker compose logs app --tail=80 >&2
    echo "Dane nie zostały usunięte. Przy '[migrate] STOP' wróć do poprzedniej wersji: git checkout $before && docker compose up -d --build" >&2
    exit 1
  fi
  i=$((i + 1)); sleep 5
done
docker image prune -f > /dev/null 2>&1 || true
echo "Gotowe: aplikacja działa w wersji $after."
