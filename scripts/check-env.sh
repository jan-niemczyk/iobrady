#!/bin/sh
# Kontrola pliku .env PRZED uruchomieniem/aktualizacją (na serwerze, w katalogu aplikacji).
# Nie wypisuje wartości sekretów. Kod wyjścia 1 = popraw .env (opis zmiennych: .env.example).
#
#   ./scripts/check-env.sh
set -u
cd "$(dirname "$0")/.."
ENV_FILE=.env
fail=0
err() { echo "BŁĄD: $*" >&2; fail=1; }
warn() { echo "UWAGA: $*" >&2; }

if [ ! -f "$ENV_FILE" ]; then
  echo "BŁĄD: brak pliku .env w $(pwd). Utwórz go: cp .env.example .env i uzupełnij (INSTALACJA.md, krok 4)." >&2
  exit 1
fi

# Wartość zmiennej z .env (ostatnie wystąpienie, bez cudzysłowów i komentarza końcowego).
val() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n 1 \
    | sed -e 's/[[:space:]]#.*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
need() { [ -n "$(val "$1")" ] || err "brak $1 w .env - $2"; }
placeholder() { echo "$1" | grep -Eq 'ZMIEN|zmien|CHANGE_ME|change_me|przyklad|example-secret'; }

need POSTGRES_PASSWORD "hasło bazy (wynik: openssl rand -hex 24)"
need NEXTAUTH_SECRET "sekret sesji (wynik: openssl rand -base64 32)"
need NEXTAUTH_URL "publiczny adres aplikacji, np. https://obrady.twoja-domena.pl"
need DOMAIN "domena dla HTTPS (Caddy), np. obrady.twoja-domena.pl"

for v in POSTGRES_PASSWORD NEXTAUTH_SECRET APP_ENCRYPTION_KEY SETUP_TOKEN NEXTAUTH_URL DOMAIN; do
  x=$(val "$v")
  [ -n "$x" ] && placeholder "$x" && err "$v ma wartość przykładową z .env.example - ustaw własną."
done
s=$(val NEXTAUTH_SECRET); [ -n "$s" ] && [ "${#s}" -lt 32 ] && err "NEXTAUTH_SECRET jest za krótki (min. 32 znaki)."
p=$(val POSTGRES_PASSWORD); [ -n "$p" ] && [ "${#p}" -lt 12 ] && warn "POSTGRES_PASSWORD jest krótkie (zalecane min. 16 znaków)."
if [ -n "$p" ] && ! echo "$p" | grep -Eq '^[A-Za-z0-9._~+=-]+$'; then
  err "POSTGRES_PASSWORD zawiera znaki niedozwolone w adresie bazy (/ @ : ? # % spacja itp.). Użyj np.: openssl rand -hex 24"
fi
[ -z "$(val APP_ENCRYPTION_KEY)" ] && warn "brak APP_ENCRYPTION_KEY (zalecane: openssl rand -base64 32; kopię trzymaj poza serwerem)."
# Te same reguły co scripts/check-env.mjs przy starcie kontenera - błąd wychodzi przed zatrzymaniem usług.
b64len() { printf '%s' "$1" | base64 -d 2>/dev/null | wc -c | tr -d ' '; }
k=$(val APP_ENCRYPTION_KEY)
if [ -n "$k" ] && [ "$(b64len "$k")" != 32 ]; then err "APP_ENCRYPTION_KEY musi mieć 32 bajty w base64 (openssl rand -base64 32)."; fi
for k in $(val APP_ENCRYPTION_KEYS_OLD | tr ',' ' '); do
  [ "$(b64len "$k")" != 32 ] && err "APP_ENCRYPTION_KEYS_OLD zawiera klucz o złej długości (wymagane 32 bajty w base64)."
done
t=$(val SETUP_TOKEN); [ -n "$t" ] && [ "${#t}" -lt 12 ] && err "SETUP_TOKEN jest za krótki (min. 12 znaków) - albo zostaw puste."
if [ "$(val INIT_SEED)" = "true" ]; then
  sp=$(val SEED_OPERATOR_PASSWORD); [ "${#sp}" -lt 8 ] && err "INIT_SEED=true wymaga SEED_OPERATOR_PASSWORD (min. 8 znaków). Zalecane: INIT_SEED=false i kreator /setup."
fi
case "$(val NEXTAUTH_URL)" in
  http://*|https://*) echo "$(val NEXTAUTH_URL)" | sed -E 's#^[a-z]+://##' | grep -q '/.' && err "NEXTAUTH_URL ma być samym adresem, bez ścieżki (np. https://obrady.twoja-domena.pl)." ;;
  "") ;;
  *) err "NEXTAUTH_URL musi zaczynać się od http:// lub https://" ;;
esac

url=$(val NEXTAUTH_URL); dom=$(val DOMAIN)
host=$(echo "$url" | sed -E 's#^[a-z]+://##; s#/.*$##; s#:.*$##')
domhost=$(echo "$dom" | sed -E 's#^[a-z]+://##; s#/.*$##; s#:.*$##')
if [ -n "$url" ] && [ -n "$dom" ] && [ "$host" != "$domhost" ]; then
  err "NEXTAUTH_URL ($host) i DOMAIN ($domhost) wskazują inne adresy - muszą być zgodne."
fi
case "$url" in
  http://localhost*|http://127.0.0.1*) case "$dom" in http://*) ;; *) err "Dla adresu http://localhost ustaw DOMAIN=http://localhost (bez certyfikatu HTTPS).";; esac ;;
  http://*) warn "NEXTAUTH_URL używa http:// - na produkcji użyj domeny i https://." ;;
esac

# Działająca baza: dane logowania w .env muszą być takie, z jakimi baza została utworzona.
if command -v docker > /dev/null 2>&1; then
  cid=$(docker compose ps -q db 2>/dev/null || true)
  if [ -n "$cid" ]; then
    for v in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
      have=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" | sed -n "s/^$v=//p")
      want=$(val "$v")
      if [ -z "$want" ]; then
        case "$v" in POSTGRES_USER|POSTGRES_DB) want=iobrady ;; esac
      fi
      [ -n "$have" ] && [ "$have" != "$want" ] && err "$v w .env różni się od wartości, z którą działa obecna baza (wartości nie są wypisywane)."
    done
  fi
fi

perm=$(stat -c %a "$ENV_FILE" 2>/dev/null || echo "")
[ -n "$perm" ] && [ "$perm" != "600" ] && warn ".env ma uprawnienia $perm - zalecane: chmod 600 .env"

if [ "$fail" -ne 0 ]; then
  echo "Popraw .env (opis zmiennych: .env.example) i uruchom ponownie." >&2
  exit 1
fi
echo "Konfiguracja .env: OK"
