# iOBRADY - instalacja krok po kroku

Instrukcja prowadzi od czystego serwera do działającej aplikacji pod własną domeną z HTTPS,
a potem przez aktualizacje, kopie zapasowe i rozwiązywanie problemów. Jest jedna główna ścieżka:
**serwer z Linuksem + Docker Compose + własna domena**. Na końcu części A opisano próbę lokalną
(bez domeny, na własnym komputerze) - różni się tylko dwoma wartościami w konfiguracji.

## Jak czytać tę instrukcję

- **Gdzie:** każdy krok mówi, gdzie wpisać polecenia: *na serwerze* (w terminalu po zalogowaniu przez SSH),
  *na swoim komputerze* albo *w przeglądarce*.
- **Wartości przykładowe** są oznaczone w tekście jako PRZYKŁAD - wpisz zamiast nich własne. Wszystko
  inne kopiuj bez zmian. Przykładowa domena w instrukcji: `obrady.twoja-domena.pl`.
- **Wynik** - co powinno się pojawić. **Sprawdzenie** - jak upewnić się, że krok się udał.
- **[USUWA DANE]** - tak oznaczone są polecenia, które bezpowrotnie kasują dane. W normalnej pracy
  nie są potrzebne; zestawienie na końcu instrukcji.
- Polecenia na serwerze zakładają konto `root`. Jeśli logujesz się jako zwykły użytkownik, najpierw
  wpisz `sudo -i`.

---

# Część A. Instalacja produkcyjna

## Krok 1. Serwer i domena

**Potrzebujesz:**

- serwera (VPS) z Ubuntu 22.04 lub 24.04: min. 2 GB RAM, 10 GB wolnego miejsca, publiczny adres IP,
- dostępu SSH do serwera,
- domeny lub subdomeny (PRZYKŁAD: `obrady.twoja-domena.pl`), w której panelu DNS możesz dodać rekord.

**Co zrobić (w panelu DNS domeny):** dodaj rekord typu `A` dla wybranej nazwy, wskazujący na adres IP
serwera. Jeśli serwer ma też adres IPv6, możesz dodać rekord `AAAA`.

**Sprawdzenie (na swoim komputerze):**

```bash
nslookup obrady.twoja-domena.pl
```

**Wynik:** w odpowiedzi jest adres IP Twojego serwera. Zmiana DNS może potrzebować kilku minut
(rzadko do kilku godzin). Nie przechodź do kroku 6, dopóki nazwa nie wskazuje na serwer - bez tego
nie powstanie certyfikat HTTPS.

## Krok 2. Docker, Git i zapora

**Gdzie:** na serwerze (zaloguj się: `ssh root@ADRES-IP-SERWERA`).

```bash
apt update && apt install -y git curl openssl
curl -fsSL https://get.docker.com | sh
```

Zapora - zostaw otwarte tylko SSH i porty WWW (80 jest potrzebny do uzyskania certyfikatu):

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

Jeśli dostawca serwera ma własną zaporę w panelu (np. „Firewall”), otwórz w niej te same porty: 22, 80, 443.

**Sprawdzenie:**

```bash
docker --version && docker compose version && git --version
```

**Wynik:** trzy numery wersji (Docker 24 lub nowszy, Docker Compose v2).

## Krok 3. Pobranie aplikacji

**Gdzie:** na serwerze.

```bash
git clone https://github.com/jan-niemczyk/iobrady.git /opt/iobrady
cd /opt/iobrady
```

Adres repozytorium to adres projektu na GitHubie (przycisk „Code”). Katalog `/opt/iobrady` możesz
zmienić - dalej w instrukcji wszystkie polecenia wykonujesz w katalogu aplikacji.

**Sprawdzenie:** `ls` pokazuje m.in. `docker-compose.yml`, `.env.example`, `scripts`.

> Nazwa katalogu (tu `iobrady`) jest nazwą projektu Docker Compose - od niej zależą nazwy wolumenów
> z danymi (`iobrady_esog_db` itd.). Nie zmieniaj jej po pierwszym uruchomieniu.

## Krok 4. Konfiguracja (.env)

**Gdzie:** na serwerze, w katalogu aplikacji (`cd /opt/iobrady`).

1. Utwórz plik konfiguracji z wzoru i zabezpiecz go:

   ```bash
   cp .env.example .env && chmod 600 .env
   ```

2. Wpisz swoją domenę - zmień tylko wartość `D` (PRZYKŁAD):

   ```bash
   D=obrady.twoja-domena.pl
   sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://$D|; s|^DOMAIN=.*|DOMAIN=$D|" .env
   ```

3. Wygeneruj sekrety (polecenie wpisuje losowe wartości do `.env`, nie wyświetlając ich):

   ```bash
   sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -base64 32)|; \
           s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=$(openssl rand -base64 32)|; \
           s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
   ```

Opis każdej zmiennej jest w samym pliku `.env` (`nano .env`). Pozostałe wartości mogą zostać domyślne.
Nie ma wspólnych ani domyślnych danych logowania - konto operatora zakładasz w kroku 6.

**Sprawdzenie:**

```bash
./scripts/check-env.sh
```

**Wynik:** `Konfiguracja .env: OK`. Przy błędzie skrypt pisze, której zmiennej dotyczy i jak ją poprawić
(wartości sekretów nie są wypisywane).

> **Zachowaj kopię `.env` poza serwerem** (menedżer haseł, sejf). `APP_ENCRYPTION_KEY` jest potrzebny
> do odczytania zaszyfrowanych danych (hasło SMTP) po odtworzeniu z kopii zapasowej.
> Pliku `.env` nie umieszczaj w repozytorium.

## Krok 5. Pierwsze uruchomienie

**Gdzie:** na serwerze, w katalogu aplikacji.

```bash
./scripts/update.sh --no-pull
```

Skrypt sprawdza konfigurację, buduje aplikację, tworzy strukturę bazy i czeka, aż aplikacja zgłosi
gotowość. Pierwsza budowa trwa zwykle 5-15 minut.

**Wynik:** na końcu `Gotowe: aplikacja działa w wersji ...`.

**Sprawdzenie:**

```bash
docker compose ps
curl -s https://obrady.twoja-domena.pl/api/health
```

**Wynik:** trzy usługi (`db`, `app`, `caddy`) w stanie `Up`, przy `db` i `app` dopisek `(healthy)`;
`curl` zwraca `{"ok":true}`. Jeśli `curl` zgłasza błąd certyfikatu, odczekaj minutę (Caddy pobiera
certyfikat Let's Encrypt) i sprawdź `docker compose logs caddy --tail=50`.

## Krok 6. Kreator i pierwsze logowanie

1. **Na serwerze** - odczytaj kod instalacyjny (chroni świeżą instalację przed przejęciem):

   ```bash
   docker compose logs app | grep "kod instalacyjny"
   ```

   **Wynik:** linia `[setup] Kreator /setup czeka na konfigurację - kod instalacyjny: ...`.
   Kod zmienia się przy każdym restarcie aplikacji, dopóki kreator nie zostanie ukończony
   (stały kod można ustawić w `.env` jako `SETUP_TOKEN`).

2. **W przeglądarce** otwórz `https://obrady.twoja-domena.pl`. Aplikacja sama przejdzie do kreatora.
   Wpisz: kod instalacyjny, nazwę organizacji (PRZYKŁAD: „Rada Miejska w ...”), opcjonalnie logo,
   oraz dane pierwszego operatora: imię, nazwisko, e-mail (będzie loginem) i hasło (min. 8 znaków).
   Kliknij **Zakończ konfigurację**.

3. Zaloguj się e-mailem i hasłem operatora.

**Wynik:** strona **Pulpit operatora**. W pasku adresu kłódka (HTTPS).

**Sprawdzenie:** ponowne wejście na `https://obrady.twoja-domena.pl/setup` przekierowuje do logowania
lub pulpitu - kreatora nie da się uruchomić drugi raz.

## Krok 7. Kopie zapasowe

**Gdzie:** na serwerze, w katalogu aplikacji.

1. Utwórz klucz szyfrujący kopie (jednorazowo):

   ```bash
   (umask 077; openssl rand -base64 48 > ~/iobrady-backup.key)
   ```

2. Wykonaj pierwszą kopię:

   ```bash
   ./scripts/backup.sh
   ```

   **Wynik:** `Kopia: /root/iobrady-backups/iobrady-db-DATA.sql.gz.enc, ... (+ .sha256)`.

3. Kopia automatyczna każdej nocy o 2:15 (dopisanie do harmonogramu cron):

   ```bash
   (crontab -l 2>/dev/null; echo "15 2 * * * cd $(pwd) && ./scripts/backup.sh >> \$HOME/iobrady-backup.log 2>&1") | crontab -
   ```

   **Sprawdzenie:** `crontab -l` pokazuje dodaną linię.

4. **Na swoim komputerze** - skopiuj klucz poza serwer (bez klucza kopii nie da się odtworzyć):

   ```bash
   scp root@ADRES-IP-SERWERA:/root/iobrady-backup.key .
   ```

Kopie leżą na tym samym serwerze. Aby chroniły przed awarią serwera, regularnie kopiuj katalog
`~/iobrady-backups` w inne miejsce (np. `scp -r` lub `rsync` na inny komputer).

Skrypt aktualizacji (część B) wykonuje kopię automatycznie przed każdą aktualizacją.

## Krok 8. Dalsza konfiguracja w aplikacji

**W przeglądarce**, jako operator:

- **Ustawienia** - nazwa organu, logo, kolory i czcionki ekranu sali, opcjonalnie serwer SMTP
  (wysyłka danych logowania). Przycisk testu poczty sprawdza połączenie.
- **Uczestnicy** - konta radnych (hasło startowe; przy pierwszym logowaniu każdy ustawia własne).
  Odcinki z danymi logowania (PDF z kodem QR) można wydrukować z listy uczestników.
- **Posiedzenia** - utworzenie posiedzenia, skład, porządek obrad.
- Ekran sali i nakładka transmisji: w panelu posiedzenia menu **Raporty** - „Widok publiczny (ekran
  świetlny)” i „Nakładka na transmisję (OBS)”. Linki zawierają token ekranu; gdy link wycieknie,
  użyj „Nowy link ekranu (unieważnij stary)” w tym samym menu.

Opis pracy operatora: [docs/OPERATOR.md](docs/OPERATOR.md).

## Próba lokalna (bez domeny)

Do obejrzenia aplikacji na własnym komputerze z Dockerem (Linux, macOS lub Windows z Docker Desktop).
**Nie do pracy produkcyjnej** - bez HTTPS ciasteczka sesji nie są szyfrowane w transmisji.

Kroki 3-6 jak wyżej, z dwiema różnicami w kroku 4 (zamiast punktu 2):

```bash
sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=http://localhost|; s|^DOMAIN=.*|DOMAIN=http://localhost|" .env
```

(Na macOS: `sed -i ''` zamiast `sed -i`, albo zmień te dwie linie w edytorze.)
Port 80 komputera musi być wolny. Adres w przeglądarce: `http://localhost`.
`check-env.sh` pokaże ostrzeżenie o adresie `http://` - przy próbie lokalnej jest ono oczekiwane.

Usunięcie próby lokalnej wraz z danymi **[USUWA DANE]**: `docker compose down -v` w katalogu aplikacji.

## Serwer z inną aplikacją (porty 80/443 zajęte)

Gdy na serwerze działa już inna aplikacja z własnym serwerem WWW (np. Caddy w Dockerze) na portach 80
i 443, iOBRADY uruchamia się **bez własnego Caddy**. Aplikacja nasłuchuje wtedy tylko na adresie
wewnętrznym Dockera `172.17.0.1:3100` (niedostępnym z internetu), a istniejący serwer WWW dostaje jeden
blok dla domeny iOBRADY. Druga aplikacja działa bez zmian.

**Sprawdzenie, czy to Twój przypadek (na serwerze):** `sudo ss -ltnp | grep -E ':(80|443) '` pokazuje
zajęte porty, a `docker ps` - kontener innego serwera WWW (np. `...-caddy-1`).

Kroki 1-4 jak wyżej, a na końcu kroku 4 dopisz do `.env`:

```bash
echo "COMPOSE_FILE=docker-compose.yml:docker-compose.external-proxy.yml" >> .env
```

Krok 5 bez zmian (`./scripts/update.sh --no-pull`). **Wynik:** `docker compose ps` pokazuje tylko `db`
i `app`, przy `app` port `172.17.0.1:3100->3000/tcp`.

Następnie, zamiast certyfikatu z własnego Caddy, dopisz blok do Caddyfile istniejącej aplikacji
(PRZYKŁAD nazwy kontenera: `inna-caddy-1`; nazwę pokaże `docker ps`):

1. Gdzie leży jej Caddyfile:

   ```bash
   docker inspect inna-caddy-1 --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
   ```

   Szukaj linii kończącej się na `/etc/caddy/Caddyfile` - po lewej jest plik na serwerze.

2. Czy ten Caddy dosięga iOBRADY:

   ```bash
   docker exec inna-caddy-1 wget -qO- http://172.17.0.1:3100/api/health
   ```

   **Wynik:** `{"ok":true}`. Jeśli polecenie wisi, zapora blokuje ruch z Dockera:
   `sudo ufw allow from 172.16.0.0/12 to 172.17.0.1 port 3100 proto tcp` i powtórz.

3. Kopia zapasowa i dopisanie bloku (zamień ścieżkę i domenę - PRZYKŁAD):

   ```bash
   F=/ścieżka/do/Caddyfile
   sudo cp "$F" "$F.przed-iobrady"
   sudo tee -a "$F" > /dev/null <<'BLOK'

   # iOBRADY
   obrady.twoja-domena.pl {
   	reverse_proxy 172.17.0.1:3100 {
   		header_up X-Forwarded-For {remote_host}
   		flush_interval -1
   	}
   	header {
   		Strict-Transport-Security "max-age=31536000; includeSubDomains"
   		X-Content-Type-Options "nosniff"
   		X-Frame-Options "SAMEORIGIN"
   		Referrer-Policy "strict-origin-when-cross-origin"
   		-Server
   	}
   	encode gzip zstd
   }
   BLOK
   ```

4. Sprawdzenie i przeładowanie (bez przerwy w działaniu drugiej aplikacji):

   ```bash
   docker exec inna-caddy-1 caddy validate --config /etc/caddy/Caddyfile
   docker exec inna-caddy-1 caddy reload --config /etc/caddy/Caddyfile
   ```

   **Wynik:** `Valid configuration`, a po chwili `https://obrady.twoja-domena.pl/api/health` zwraca
   `{"ok":true}`. Przy błędzie walidacji przywróć kopię: `sudo cp "$F.przed-iobrady" "$F"`.

Uwaga: jeśli druga aplikacja przy swojej aktualizacji nadpisuje Caddyfile, blok iOBRADY trzeba dopisać
ponownie. Aktualizacje iOBRADY (`./scripts/update.sh`) działają bez zmian i nie dotykają drugiej aplikacji.

---

# Część B. Utrzymanie

## Aktualizacja (jedno polecenie)

**Gdzie:** na serwerze, w katalogu aplikacji.

```bash
./scripts/update.sh
```

Kolejno: kontrola `.env` -> szyfrowana kopia zapasowa -> pobranie nowej wersji (`git pull`) -> kontrola
`.env` nowej wersji -> budowa i uruchomienie -> oczekiwanie na gotowość.

**Wynik:** `Wersja: abc1234 -> def5678` oraz `Gotowe: aplikacja działa w wersji def5678`.

Zasady bezpieczeństwa danych:

- Struktura bazy jest dopasowywana przy starcie **bez akceptacji utraty danych**. Jeśli nowa wersja
  wymagałaby usunięcia danych, start zatrzyma się komunikatem `[migrate] STOP`; dane zostają nietknięte.
- Skrypt przerywa pracę, jeśli w katalogu aplikacji zmieniono pliki śledzone przez git
  (`git status` je pokaże). Konfiguracja instalacji ma być wyłącznie w `.env`.
- Gdy aplikacja nie zgłosi gotowości, skrypt pokaże logi i polecenie powrotu do poprzedniej wersji:
  `git checkout POPRZEDNIA-WERSJA && docker compose up -d --build`.
  Po naprawie wróć na gałąź: `git checkout main && ./scripts/update.sh`.

**Sprawdzenie:** `curl -s https://obrady.twoja-domena.pl/api/health` zwraca `{"ok":true}`.

## Kopia zapasowa i odtworzenie

Kopia na żądanie: `./scripts/backup.sh` (zawartość: baza oraz pliki - logo, plansza, załączniki;
szyfrowanie AES-256 kluczem `~/iobrady-backup.key`, sumy SHA-256 obok). Inny katalog docelowy:
`./scripts/backup.sh /ścieżka/katalogu`.

### Odtworzenie kopii **[USUWA DANE]**

Zastępuje **całą** bieżącą bazę i pliki stanem z kopii. Wszystko, co zapisano po wykonaniu kopii,
przepada. Przed rozpoczęciem wykonaj kopię bieżącego stanu (`./scripts/backup.sh`), jeśli baza działa.

**Gdzie:** na serwerze, w katalogu aplikacji. `STAMP` to data z nazwy pliku kopii (PRZYKŁAD:
`2026-10-04-021500` z `iobrady-db-2026-10-04-021500.sql.gz.enc`).

```bash
ls ~/iobrady-backups                       # wybierz STAMP
docker compose down
docker volume ls | grep _esog_db           # nazwa wolumenu bazy, np. iobrady_esog_db
docker volume rm iobrady_esog_db           # [USUWA DANE] usuwa bieżącą bazę
docker compose up -d db
./scripts/restore.sh ~/iobrady-backups STAMP
docker compose up -d
```

Skrypt najpierw sprawdza sumy kontrolne i odszyfrowuje archiwa - zły klucz lub uszkodzony plik
zatrzymuje odtwarzanie, zanim cokolwiek trafi do bazy. Pliki (logo, załączniki) są dopisywane
do wolumenów aplikacji.

**Wynik:** `Odtworzono kopię STAMP.`; po `docker compose up -d` aplikacja działa ze stanem z kopii.

**Sprawdzenie:** zaloguj się i sprawdź listę posiedzeń oraz załącznik.

Odtwarzanie na nowym serwerze: kroki 1-4 (z `.env` skopiowanym z kopii poza serwerem, w tym
`APP_ENCRYPTION_KEY` i `POSTGRES_PASSWORD`), klucz kopii do `~/iobrady-backup.key`, pliki kopii do
`~/iobrady-backups`, potem `docker compose build` i powyższe polecenia od `docker compose up -d db`.

Procedurę odtworzenia warto raz na jakiś czas przećwiczyć na serwerze testowym.

## Logi i stan

```bash
docker compose ps                          # stan usług
docker compose logs app --tail=200 -f      # logi aplikacji (Ctrl+C kończy podgląd)
docker compose logs caddy --tail=100       # serwer WWW i certyfikaty HTTPS
docker compose logs db --tail=100          # baza danych
docker compose restart app                 # restart aplikacji bez przebudowy
```

Zdarzenia w aplikacji (logowania, czynności operatorów) są w panelu operatora: zakładka **Logowania**
oraz dziennik czynności posiedzenia.

## Klucze i sekrety

- **`NEXTAUTH_SECRET`** - zmiana wylogowuje wszystkich. Nowa wartość: zmień w `.env`, potem
  `docker compose up -d`.
- **`APP_ENCRYPTION_KEY`** - rotacja: nowy klucz wpisz jako `APP_ENCRYPTION_KEY`, poprzedni jako
  `APP_ENCRYPTION_KEYS_OLD`, wykonaj `docker compose up -d`, potem
  `docker compose exec app npx tsx scripts/post-migrate.ts --rotate` i usuń `APP_ENCRYPTION_KEYS_OLD`.
- **`POSTGRES_PASSWORD`** - jest zapisywane w bazie przy pierwszym uruchomieniu; sama zmiana w `.env`
  nie zmienia hasła bazy (`check-env.sh` wykryje niezgodność). Zmiana hasła bazy:
  `docker compose exec db psql -U iobrady -c "ALTER USER iobrady PASSWORD 'NOWE-HASLO'"`,
  potem ta sama wartość w `.env` i `docker compose up -d`.
- **Klucz kopii** `~/iobrady-backup.key` - utrata klucza = brak możliwości odtworzenia kopii.

## Przejście istniejącej instalacji (z paczki, bez git) na aktualizacje z git

Dla instalacji wgranej wcześniej jako archiwum (katalog bez `.git`). Dane zostają w tych samych wolumenach.

**Gdzie:** na serwerze. PRZYKŁAD: stara instalacja w `/root/esog`.

```bash
git clone https://github.com/jan-niemczyk/iobrady.git /root/iobrady-git
cd /root/iobrady-git && ./scripts/adopt-existing.sh /root/esog
```

Skrypt: robi kopię bazy (`~/iobrady-przed-git-DATA.sql.gz`), kopiuje `.env` i uzupełnia brakujące
wartości (nie wypisując ich), buduje nową wersję, gdy stara jeszcze działa (przerwa w pracy trwa
ok. minuty), tworzy klucz kopii, zatrzymuje starą instalację, przenosi jej katalog do
`/root/esog-przed-git-DATA` (niczego nie kasuje), ustawia nowy klon na jej miejscu i uruchamia go.
Przy niepowodzeniu wypisuje polecenie powrotu. Później aktualizacje: `cd /root/esog && ./scripts/update.sh`.
Użytkownicy muszą zalogować się ponownie. Nowy `.env` i `~/iobrady-backup.key` skopiuj poza serwer.

---

# Część C. Rozwiązywanie problemów

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| `check-env.sh`: „ma wartość przykładową z .env.example” | Nie uzupełniono kroku 4 - wygeneruj wartości poleceniami z kroku 4. |
| `check-env.sh`: „NEXTAUTH_URL (...) i DOMAIN (...) wskazują inne adresy” | Oba muszą zawierać ten sam host (`NEXTAUTH_URL=https://HOST`, `DOMAIN=HOST`). |
| `check-env.sh`: „POSTGRES_PASSWORD w .env różni się od wartości, z którą działa obecna baza” | Zmieniono hasło w `.env` po pierwszym starcie. Przywróć poprzednią wartość albo zmień hasło w bazie (Klucze i sekrety). |
| Kreator prosi o kod instalacyjny | `docker compose logs app \| grep "kod instalacyjny"` (lub wartość `SETUP_TOKEN` z `.env`). |
| Zamiast kreatora jest ekran logowania | Konfiguracja została już ukończona - zaloguj się kontem operatora. |
| Brak HTTPS, błąd certyfikatu | Sprawdź DNS (krok 1) i porty 80/443 (krok 2, także zapora u dostawcy). Szczegóły: `docker compose logs caddy --tail=100`. Let's Encrypt ogranicza liczbę prób - po wielu nieudanych odczekaj godzinę. |
| Wylogowanie zaraz po zalogowaniu, „pętla” logowania | `NEXTAUTH_URL` musi być dokładnie adresem z paska przeglądarki (protokół i host, bez ukośnika na końcu). |
| `update.sh`: „lokalne zmiany plików aplikacji” | Ktoś zmienił pliki w katalogu aplikacji. `git status` pokaże które; `git diff` - co. Przenieś ustawienia do `.env`, potem `git checkout -- PLIK`. |
| `[migrate] STOP` w logach | Nowa wersja wymagałaby usunięcia danych - dane są nietknięte. Wróć do poprzedniej wersji (polecenie z komunikatu `update.sh`) i zgłoś problem (CONTRIBUTING.md). |
| `update.sh`: „Brak pliku klucza kopii” | Wykonaj krok 7 (klucz kopii). |
| Budowa przerwana błędem lub brakiem pamięci | Przy 1 GB RAM dodaj plik wymiany (swap) lub zwiększ pamięć serwera. Treść błędu: wynik `update.sh`. |
| Ekran sali: strona „404” | Link bez tokenu albo token unieważniony - skopiuj link ponownie z menu **Raporty** posiedzenia. |
| Ekran sali ma inną czcionkę niż wybrana | Komputer ekranu nie ma dostępu do `fonts.googleapis.com` - używana jest czcionka zastępcza. |
| Wyniki nie odświeżają się na żywo | Aktualizacje idą przez połączenie strumieniowe (SSE). Jeśli przed serwerem jest dodatkowy serwer proxy, musi przepuszczać `/api/meetings/*/stream` bez buforowania i bez krótkiego limitu czasu. |
| Przekroczony limit miejsca na dysku | `docker system df`; usunięcie nieużywanych obrazów: `docker image prune -f`. Stare kopie w `~/iobrady-backups` przenieś poza serwer. |

---

# Zestawienie operacji usuwających dane

Żadne z poniższych poleceń nie jest potrzebne przy instalacji ani aktualizacji.

| Polecenie | Co usuwa |
|---|---|
| `docker compose down -v` | **wszystkie** wolumeny instalacji: bazę, pliki, certyfikaty |
| `docker volume rm NAZWA` | wskazany wolumen (np. `iobrady_esog_db` - bazę) |
| `./scripts/restore.sh ...` | zastępuje bieżące dane stanem z kopii |
| `rm -rf` katalogu aplikacji | `.env` z kluczami (dane w wolumenach zostają, ale bez `APP_ENCRYPTION_KEY` nie odczytasz zaszyfrowanych ustawień) |
| `docker system prune --volumes` | nieużywane wolumeny - także dane zatrzymanej instalacji |

`docker compose down` (bez `-v`) tylko zatrzymuje usługi - dane zostają.
