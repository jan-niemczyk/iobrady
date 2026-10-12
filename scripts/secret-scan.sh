#!/bin/sh
# Skaner sekretów w plikach śledzonych przez git (H-07). Bez zewnętrznych narzędzi - działa w CI
# i lokalnie:  sh scripts/secret-scan.sh            (pliki bieżącej wersji)
#              sh scripts/secret-scan.sh --historia  (dodatkowo wszystkie zmiany w historii git)
# Szuka kluczy prywatnych, tokenów znanych usług i wypełnionych zmiennych z sekretami (.env).
# Wyjątki: .env.example (same placeholdery) i ten skrypt.
set -u
cd "$(dirname "$0")/.."
PATTERNS='-----BEGIN ([A-Z]+ )?PRIVATE KEY-----
gh[pousr]_[A-Za-z0-9]{36,}
github_pat_[A-Za-z0-9_]{60,}
AKIA[0-9A-Z]{16}
xox[baprs]-[A-Za-z0-9-]{10,}
sk-[A-Za-z0-9_-]{32,}
AIza[0-9A-Za-z_-]{35}
^[[:space:]]*(NEXTAUTH_SECRET|AUTH_SECRET|APP_ENCRYPTION_KEY|SETUP_TOKEN|POSTGRES_PASSWORD|SMTP_PASS|SMTP_PASSWORD)=[^[:space:]$"{]{12,}
postgres(ql)?://[^:/@[:space:]]+:[^@[:space:]$]{6,}@[^/[:space:]]*\.(pl|com|net|org|eu|io)'
# Wartości przykładowe (instrukcje, testy) nie są sekretami.
not_placeholder() { grep -viE '=[[:space:]]*["'"'"']?(zmien|change|example|przyklad|placeholder|your|twoj|x{6,}|<)' ; }
found=0
files=$(git ls-files | grep -v -e '^\.env\.example$' -e '^scripts/secret-scan\.sh$' -e '^package-lock\.json$' -e '^public/fonts/')
for f in $files; do
  [ -f "$f" ] || continue
  # pliki binarne pomijamy
  if ! grep -Iq . "$f" 2>/dev/null; then continue; fi
  hits=$(printf '%s\n' "$PATTERNS" | grep -nE -f - "$f" 2>/dev/null | not_placeholder | cut -c1-120)
  if [ -n "$hits" ]; then
    found=1
    printf '%s\n' "$hits" | while IFS= read -r h; do echo "Możliwy sekret: $f:${h%%:*}"; done
  fi
done
# Historia: każda dodana linia we wszystkich commitach osiągalnych z gałęzi i tagów.
if [ "${1:-}" = "--historia" ]; then
  PF=$(mktemp); trap 'rm -f "$PF"' EXIT; printf '%s\n' "$PATTERNS" > "$PF"
  hist=$(git log --all -p --no-color --format='commit %H' -- . ':(exclude).env.example' ':(exclude)scripts/secret-scan.sh' ':(exclude)package-lock.json' \
    | awk '/^commit /{c=substr($2,1,12)} /^\+\+\+ /{f=substr($2,3)} /^\+[^+]/{print substr($0,2)"\t"c" "f}' \
    | grep -E -f "$PF" | not_placeholder | awk -F'\t' '{print $NF}' | sort -u)
  if [ -n "$hist" ]; then found=1; printf '%s\n' "$hist" | sed 's/^/Możliwy sekret w historii: /'; fi
fi
# Plik .env i kopie nie mogą być śledzone.
if git ls-files | grep -qE '(^|/)\.env($|\.local$|\.production$)|\.enc$|\.sql\.gz$'; then
  echo "Śledzony plik konfiguracji lub kopii (.env / .enc / zrzut bazy)"; found=1
fi
if [ "$found" = 0 ]; then echo "Skan sekretów: czysto"; fi
exit $found
