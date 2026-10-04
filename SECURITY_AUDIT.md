# Audyt bezpieczeństwa iOBRADY - raport i stan po poprawkach

- Audyt: 2026-10-04 (wersja sprzed poprawek bezpieczeństwa).
- Wdrożenie poprawek: 2026-10-04, w repozytorium projektu.
- Testy: wyłącznie lokalnie, na danych syntetycznych; produkcja nie była dotykana ani wdrażana.

Plik leży w katalogu głównym repozytorium, poza `public/`, i nie jest serwowany użytkownikom.

Statusy używane w raporcie:
- **NAPRAWIONE** - podatność usunięta i potwierdzona testem;
- **ZAAKCEPTOWANE RYZYKO** - zachowanie pozostawione świadomie decyzją właściciela (podatność nadal istnieje);
- **REGUŁA BIZNESOWA** - zachowanie potwierdzone jako zamierzone (nie jest podatnością);
- **NIEWYKONANE** - z podaniem konkretnej przyczyny.

---

## 1. Krótka ocena ryzyka (stan po poprawkach)

Najpoważniejsze ryzyko z audytu - **złamanie tajności głosowania tajnego** przez liczniki widoczne
w trakcie - zostało usunięte po stronie serwera: w każdym głosowaniu tajnym (zwykłym i kotarkowym)
rozkład głosów jest niedostępny do zamknięcia dla wszystkich ról, także operatora. Informacja, kto
oddał, a kto nie oddał głosu, oraz łączna liczba oddanych głosów pozostały.

Naprawiono także: nieodwoływalne sesje, brak limitów logowania i enumerację kont, otwarte
przekierowanie, publiczny dostęp do danych prezentacji, wyciek kolejki wniosków formalnych,
przejęcie świeżej instalacji, wycieki szczegółów technicznych, jawne hasło SMTP, luki w dzienniku
oraz automatyczną akceptację utraty danych przy migracji.

**Pozostające ryzyka (świadome decyzje):**
- SA-02: operator może bez śladu w dzienniku oddać, zmienić i wyzerować głos radnego w głosowaniu
  jawnym, także wbrew zasadzie „pierwszy głos ostateczny”. Ochroną jest wyłącznie zaufanie do operatora.
- SA-03: PIN głosowania (4 cyfry) da się odgadnąć bez limitu prób; PIN jest też w danych ekranu
  prezentacji dla każdego, kto ma link ekranu z tokenem.
- Nowa funkcja zerowania głosu tajnego: na czas trwania głosowania serwer przechowuje zaszyfrowane
  powiązanie osoby z treścią jej głosu (usuwane przy zakończeniu). Osoba z dostępem do bazy i klucza
  serwera mogłaby w tym oknie odczytać treść głosu.

| ID | Tytuł | Ważność (audyt) | Status |
|---|---|---|---|
| SA-01 | Deanonimizacja głosowania tajnego przez liczniki na żywo | Wysoka | **NAPRAWIONE** (S3, S3b, S3c, S3d) |
| SA-02 | Głos i zerowanie w imieniu radnego (jawne) bez audytu, z pominięciem „pierwszy głos ostateczny” | Wysoka | **ZAAKCEPTOWANE RYZYKO** (decyzja SA-02/BR-4; S5 potwierdza zachowanie funkcji) |
| SA-03 | PIN: w danych prezentacji i bez limitu prób | Średnia | **ZAAKCEPTOWANE RYZYKO** (S1, S2 potwierdzają zachowanie mechanizmu); publiczny dostęp bez tokenu usunięty w ramach SA-07 |
| SA-04 | Sesje nieodwoływalne | Średnia | **NAPRAWIONE** (S7, S7b, S7c, S16, S18) |
| SA-05 | Brak limitów logowania, enumeracja kont | Średnia | **NAPRAWIONE** (S8, S8b, S8c, S19, S19b) |
| SA-06 | Otwarte przekierowanie po logowaniu | Średnia | **NAPRAWIONE** (S12) |
| SA-07 | Dane prezentacji każdego posiedzenia bez uwierzytelnienia | Niska | **NAPRAWIONE** (S1b, S4, S4b, S4c, S26) |
| SA-08 | `formal-motions`: dostęp do cudzego posiedzenia i zapis w GET | Niska | **NAPRAWIONE** (S6) |
| SA-09 | Kreator `/setup`: wyścig, „kto pierwszy”, logo bez weryfikacji treści | Niska | **NAPRAWIONE** (S25, test instalacji od zera) |
| SA-10 | Szczegóły techniczne w odpowiedziach błędów | Niska | **NAPRAWIONE** (S11) |
| SA-11 | Hasło SMTP w przeglądarce i jawne w bazie | Niska | **NAPRAWIONE** (S23, test migracji i odtworzenia) |
| SA-12 | Luki w dzienniku audytu | Niska | **NAPRAWIONE** z wyłączeniem SA-02 (S8b, S13, kod) |
| SA-13 | `prisma db push --accept-data-loss` przy starcie | Niska | **NAPRAWIONE** (test migracji, test blokady utraty danych) |
| BR-1 | Wstrzymanie publikacji wyników nie ograniczało dostępu | - | **USUNIĘTE** decyzją: funkcja wycofana, wyniki dostępne od razu po zamknięciu (S10) |
| BR-2 | Imienne głosy jawne widoczne w trakcie | - | **REGUŁA BIZNESOWA** (S9) |
| BR-3 | Otwieranie głosowań: wyścig i cykl życia | - | **NAPRAWIONE** (S14, S15b, S17); udział w wielu posiedzeniach - **REGUŁA BIZNESOWA** (S15, S16) |
| BR-4 | Uprawnienia operatora wobec głosu jawnego | - | **REGUŁA BIZNESOWA** (bez zmian, S5) |
| BR-5 | Globalna rola CHAIRPERSON | - | **NAPRAWIONE** (rola usunięta, migracja kont; S20) |

---

## 2. Zakres, model zagrożeń i ograniczenia

### 2.1 Zakres

Audyt objął wszystkie trasy API (106 w chwili audytu), middleware, konfigurację NextAuth, strony
serwerowe radnego, przewodniczącego, publiczne i prezentacji, biblioteki w `src/lib`, `Dockerfile`,
`docker-compose.yml`, `Caddyfile`, `next.config.ts`, zależności i historię gita. Faza poprawek
objęła ustalenia SA-01, SA-04 - SA-13, BR-1, BR-3, BR-5 oraz rekomendacje z rozdz. 5, zgodnie
z decyzjami właściciela.

### 2.2 Środowisko testów i izolacja

- PostgreSQL lokalny (`localhost:5432`), osobne bazy testowe: `iobrady` (stan sprzed zmian
  odtwarzany ze zrzutu), `iobrady_fresh` (instalacja od zera), `iobrady_ci` (seed syntetyczny),
  `iobrady_restore` (odtwarzanie kopii).
- Aplikacja: lokalny build produkcyjny (`npm run build`, `next start`), bez Caddy.
- Poczta: tylko lokalny „pochłaniacz” SMTP na `127.0.0.1:2525` (skrypt testowy) - żadna wiadomość
  nie opuściła maszyny.
- Dane: konta `*@demo.local` i `operator@example.local`, posiedzenia testowe. Brak danych osobowych.
- Zewnętrzne usługi: jedynie `npm audit` i `npm install` (rejestr npm; wysłana wyłącznie lista
  zależności, zgodnie ze zgodą właściciela). Żadnego kodu ani danych aplikacji.

### 2.3 Model zagrożeń

| Aktor | Co ma | Czego może chcieć |
|---|---|---|
| A1. Anonim w internecie | Adres aplikacji | Odczyt danych, przejęcie konta, wpływ na wynik, poznanie tajnych głosów, phishing |
| A2. Posiadacz linku ekranu / widz ekranu sali | Link `/display` lub `/overlay` z tokenem ekranu | Dane na żywo, PIN, liczniki |
| A3. Zalogowany radny | Konto PARTICIPANT, członkostwo w posiedzeniu | Głos za innych, poza oknem, zmiana głosu wbrew regułom, cudze głosy tajne, obejście PIN |
| A4. Radny innego posiedzenia | Konto bez członkostwa | Odczyt lub wpływ na cudze posiedzenie |
| A5. Przewodniczący (flaga w posiedzeniu) | Prowadzenie obrad | Nadużycie uprawnień, poznanie głosów tajnych |
| A6. Operator (zaufany) | Pełny panel | Ciche zmiany głosów i ustawień |
| A7. Skradziona lub przeterminowana sesja | Ciasteczko, konto po dezaktywacji | Działanie po odebraniu uprawnień |

### 2.4 Ograniczenia

- Nie badano serwera produkcyjnego (TLS, rzeczywiste nagłówki Caddy, firewall, kopie, SSH).
- **Obraz Dockera nie został zbudowany** - w środowisku testowym nie ma demona Dockera
  (`/var/run/docker.sock` nie istnieje). Zmiany w `Dockerfile` i `docker-compose.yml` sprawdzono
  przez wykonanie tych samych kroków lokalnie (`npm ci`-zgodny lockfile, `scripts/migrate.sh`,
  `next start` na Node 22), ale nie przez `docker compose up --build`. Pierwsze zbudowanie obrazu
  należy wykonać przed wdrożeniem (rozdz. 7).
- Pominięto testy obciążeniowe; limity sprawdzono pojedynczymi seriami (najwyżej 905 żądań).
- Fonty Lato w lokalnych testach PDF pochodziły z innej dystrybucji (pakiet `rdoc`), bo serwer
  fontów (`cdn.jsdelivr.net`) był niedostępny z sieci testowej - test dotyczył działania pdfmake
  pod CSP, nie wyglądu.

---

## 3. Macierz uprawnień (stan po poprawkach)

Legenda: **T** - tak; **N** - nie (odmowa); **W** - własne dane; **(!)** - zaakceptowane ryzyko.

| Operacja / zasób | Anonim | Ekran z tokenem | Radny obcy | Radny | Przewodniczący | Operator |
|---|---|---|---|---|---|---|
| Logowanie `/api/auth/*` (limity prób) | T | - | T | T | T | T |
| `/setup` (do ukończenia, z kodem instalacyjnym) | z kodem | - | - | - | - | - |
| Dane prezentacji `/api/display/[id]`, strony `/display`, `/overlay` | **N** (404) | T (w tym PIN (!)) | N | T | T | T |
| Strona publiczna `/public/[id]` (`publicEnabled`) | T | - | T | T | T | T |
| Obrazy `/api/uploads/*` (CSP sandbox) | T | T | T | T | T | T |
| SSE `/api/meetings/[id]/stream` (limit 12/konto) | N | - | N | T | T | T |
| `/api/meetings/[id]/formal-motions` | N | - | **N** (404) | T (bez zapisu) | T | T |
| Licznik `/api/votes/[id]/counter` - jawne | N | - | N | T, z `castByUser` (BR-2) | T | T |
| Licznik - tajne w trakcie | N | - | N | tylko liczba oddanych | tylko liczba oddanych | liczba oddanych + kto oddał |
| Panel przewodniczącego (lista „nie głosowali”) | N | - | N | N | T | T |
| Raport głosowania po zamknięciu | N | - | N | T (od razu, BR-1) | T | T |
| Raporty/CSV tajnego w trakcie | N | - | N | N | N | **N** (409) |
| `pin-auth` (bez limitu (!)) | N | - | T (bez skutku) | T | T | T |
| Głos za siebie | N | - | N | T | T | T |
| Głos / zerowanie w imieniu - jawne | N | - | N | N | N | T, bez audytu (!) |
| Zerowanie głosu tajnego (pomyłka) | N | - | N | N | N | T, z audytem, bez treści |
| Otwarcie głosowania (blokada posiedzenia, tylko posiedzenie OPEN/IN_PROGRESS/PAUSED) | N | - | N | N | N | T |
| Zamknięcie głosowania | N | - | N | N | T | T |
| Nowy link ekranu | N | - | N | N | N | T |
| Konta: tworzenie, import, rola, dezaktywacja, reset haseł (z audytem, odwołanie sesji) | N | - | N | N | N | T |
| Ustawienia (bezpieczeństwo, retencja, SMTP bez odczytu hasła) | N | - | N | N | N | T |
| Zmiana własnego hasła (koniec innych sesji) | N | - | W | W | W | W |

Zmiany stanu z obcej domeny (`Origin` różny od hosta) są odrzucane dla wszystkich ról (S21).

---

## 4. Ustalenia i ich stan

### 4.1 SA-01. Deanonimizacja głosowania tajnego - NAPRAWIONE

**Problem (audyt):** w tajnym głosowaniu bez kotary liczniki ZA/PRZECIW/WSTRZ były dostępne na żywo
publicznie i dla radnych; zestawione z informacją, kto właśnie zagłosował, ujawniały wybór osoby.
CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N (5.9), ocena domenowa: wysoka.

**Naprawa:**
- `src/lib/secretTally.ts` - `secretTallyHidden(vote)` = głosowanie tajne i status różny od `CLOSED`.
- Maskowanie po stronie serwera (nie w UI) w: `api/votes/[id]/counter` (dla każdej roli, także
  operatora), `api/display/[meetingId]` (wyniki, kandydaci, pozycje pakietu, `resultPassed`;
  ta sama odpowiedź zasila nakładkę OBS), `api/votes/[id]/report.csv` i `api/meetings/[id]/report-data`
  (409 dla tajnego w trakcie), `lib/voteReportData.ts` (pakiet tajny niezamknięty, np. przerwany).
- SSE nie przenosi danych (tylko typ zdarzenia) - bez zmian.
- Zachowane: łączna liczba oddanych głosów (ekran, liczniki), lista „nie głosowali” u przewodniczącego,
  dla operatora `votedUserIds` (kto oddał kartę). Radny nie dostaje listy osób.
- Po zamknięciu wynik dostępny od razu (ekran, raport radnego, raporty operatora).
- Panel operatora zamiast zer pokazuje „Rozkład głosów tajnych będzie dostępny po zamknięciu głosowania”.

**Testy:** S3 (zera na ekranie, u radnego i operatora; CSV i report-data 409), S3b (liczba oddanych,
„nie głosowali”, kto oddał), S3c (wynik od razu po zamknięciu), S3d (tryb kotarkowy),
`booth-mode.spec.ts` (test regresji zaktualizowany do nowej reguły: wcześniej utrwalał podatne zachowanie).

### 4.2 Zerowanie głosu tajnego (nowa funkcja na żądanie właściciela)

- Operator w trwającym tajnym głosowaniu: panel „Zeruj głos uczestnika (pomyłka)” z listą osób,
  które oddały kartę (`MeetingPanelClient.tsx`, `SecretResetPanel`).
- Mechanizm (`src/lib/secretReset.ts`): przy oddaniu głosu tajnego treść karty jest zapisywana przy
  markerze **zaszyfrowana** (`SecretBallotMarker.resetPayload`, AES-256-GCM, kontekst powiązany
  z głosowaniem i osobą). Zerowanie pod blokadą wiersza głosowania odszyfrowuje treść, cofa anonimowe
  liczniki i usuwa marker - uczestnik może zagłosować ponownie. Serwer nie zwraca treści głosu;
  dziennik `VOTE_BALLOT_RESET` zawiera tylko kto, czyj głos i w którym głosowaniu.
- Zamknięcie, przerwanie i anulowanie głosowania usuwają zaszyfrowane treści w tej samej transakcji
  (`purgeSecretResetPayloads`); po zakończeniu powiązanie osoby z treścią nie istnieje (S13b).
- **Ryzyko szczątkowe (świadome):** w czasie trwania głosowania osoba mająca jednocześnie dostęp do bazy
  i klucza serwera (`APP_ENCRYPTION_KEY` / `NEXTAUTH_SECRET`) mogłaby odczytać treść głosu. Zgodnie
  z decyzją właściciela operator jest osobą zaufaną.
- **Testy:** S13 (tylko operator, bez treści, ponowny głos, audyt bez treści), S13b.

### 4.3 SA-02. Głos i zerowanie w imieniu (jawne) - ZAAKCEPTOWANE RYZYKO

Bez zmian zgodnie z decyzją (także BR-4): operator może oddać, zmienić i wyzerować głos jawny
w imieniu radnego, również wbrew „pierwszy głos ostateczny”, bez wpisu w dzienniku i bez znacznika
autora karty; zerowanie jawne pozostaje poza blokadą wiersza. Nie dodano audytu tych czynności
(wyłączenie z SA-12). Ryzyko: niewykrywalna zmiana imiennego głosu przez operatora lub osobę
z przejętą sesją operatora (to drugie ograniczone przez SA-04). Test S5 potwierdza zachowanie funkcji.

### 4.4 SA-03. PIN głosowania - ZAAKCEPTOWANE RYZYKO

Mechanizm PIN bez zmian: 4 cyfry, brak limitu prób w `pin-auth` (S2: 30 błędnych prób bez blokady,
następnie poprawny PIN przyjęty), PIN w danych ekranu prezentacji, gdy operator włączy „pokaż PIN” (S1).
Nie dodano limitów obejmujących `pin-auth`. Uwaga: w wyniku naprawy SA-07 dane ekranu nie są już
dostępne bez tokenu ekranu lub sesji (S1b) - PIN pozostaje widoczny dla każdego, kto ma link ekranu.

### 4.5 SA-04. Sesje - NAPRAWIONE

- Rejestr sesji `UserSession` (`src/lib/sessions.ts`); token JWT niesie `sid`. Każde użycie tokenu
  (middleware w runtime Node.js oraz `auth()` w trasach) sprawdza: sesja nieodwołana i niewygasła,
  konto aktywne, limit bezczynności. Rola i dane konta są czytane z bazy (cache 5 s, współdzielony
  przez middleware i trasy na `globalThis`).
- Natychmiastowe unieważnienie: zmiana roli, dezaktywacja (także hurtowa), reset hasła przez operatora,
  wylogowanie (zdarzenie `signOut`), zmiana własnego hasła (pozostałe sesje).
- Strumień SSE sprawdza sesję co 25 s i zamyka się po jej unieważnieniu.
- **Bezczynność** (`Settings.sessionIdleMinutes`, domyślnie 240, 0 = wyłączone): czas ostatniej
  aktywności aktualizuje wyłącznie `POST /api/session/activity`, wysyłane przez niewidoczny
  `SessionKeeper` po realnej interakcji (klawiatura, wskaźnik, dotyk, kółko), najwyżej raz na minutę.
  SSE i odpytywanie serwera nie przedłużają sesji (S18).
- **Wylogowanie po zamknięciu posiedzenia** (`Settings.logoutParticipantsOnMeetingClose`, domyślnie
  wyłączone): radni zamykanego posiedzenia tracą sesje, chyba że uczestniczą w innym posiedzeniu
  otwartym, w toku lub przerwanym (S16).
- Testy: S7, S7b, S7c, S16, S18.
- Skutek wdrożenia: tokeny wydane przed wdrożeniem nie mają `sid` - **wszyscy użytkownicy muszą
  zalogować się ponownie**.

### 4.6 SA-05. Logowanie - NAPRAWIONE

- `src/lib/loginThrottle.ts`: liczone są tylko NIEUDANE próby w oknie 15 min - limity konto+IP (8),
  konto (30), IP (150). Wielu radnych logujących się poprawnie z jednego IP sali nie jest blokowanych;
  literówki jednej osoby nie blokują innych (S8). Atakujący z innego IP nie blokuje właściciela
  konta z jego IP, dopóki nie przekroczy progu konta (S8b). Blokada działa dla dowolnego ciągu
  e-mail, więc nie zdradza istnienia konta.
- Stały czas: porównanie bcrypt z hashem-atrapą dla nieistniejących i nieaktywnych kont (S8c:
  mediany 109 ms / 116 ms; przed poprawką 100 ms / 16 ms).
- Dziennik prób `LoginAttempt` (e-mail, IP, wynik), wpis `LOGIN_LOCKED` przy osiągnięciu progu.
- Adres IP z `X-Forwarded-For` tylko przy `TRUST_PROXY=true` (ostatni wpis; Caddy nadpisuje nagłówek).
- Hasła min. 8 znaków wszędzie (S19b). Hasło nadane przez operatora (utworzenie, import, reset,
  zmiana w koncie innej osoby) = hasło startowe: do zmiany dostępna jest tylko strona konta
  (strony przekierowują na `/account?wymagana=1`, API zwraca 403) - S19.
- Formularz logowania pokazuje osobny komunikat przy blokadzie.

### 4.7 SA-06. Otwarte przekierowanie - NAPRAWIONE

`LoginForm.tsx` - `safeRedirectPath()`: tylko ścieżki wewnętrzne (odrzucane `https://...`, `//host`,
`/\host`, znaki sterujące). S12 (trzy warianty, przeglądarka z blokadą ruchu zewnętrznego).

### 4.8 SA-07. Dane prezentacji - NAPRAWIONE

- Token ekranu `Meeting.displayToken` (`src/lib/displayAccess.ts`). Dostęp do `/api/display/[id]`,
  `/display/[id]` i `/overlay/[id]`: ważny token (parametr `t` lub ciasteczko HttpOnly
  `iob_dt_<id>` ustawiane przez middleware) albo sesja operatora lub uczestnika posiedzenia.
  W przeciwnym razie 404 (także dla szkiców).
- Linki w panelu operatora zawierają token (`screenUrl()`); „Nowy link ekranu (unieważnij stary)”.
- PIN na ekranie prezentacji działa jak dotąd (S1).
- Cache odpowiedzi (`src/lib/displayCache.ts`): 1 s, klucz = posiedzenie, czyszczony przy każdym
  zdarzeniu posiedzenia; autoryzacja przed odczytem cache; odpowiedź identyczna dla wszystkich
  uprawnionych i bez wyników cząstkowych tajnych; `Cache-Control: private, no-store` (S4c).
- Limit 900 żądań/min na IP (ekran odpytuje co 1,5 s, ok. 40/min) - S26.
- Testy: S1b, S4, S4b, S4c, S26; przeglądarka: ekran i nakładka z tokenem, 404 bez tokenu.
- Skutek wdrożenia: istniejące źródła OBS i ekrany sali trzeba otworzyć ponownie z linków z panelu.
  Nakładka `/overlay` wcześniej wymagała zalogowania - teraz działa z linkiem z tokenem.

### 4.9 SA-08. `formal-motions` - NAPRAWIONE

GET wymaga roli prowadzącego lub członkostwa w posiedzeniu (404 dla obcych); kolejkę tworzy tylko
prowadzący. S6.

### 4.10 SA-09. Kreator `/setup` - NAPRAWIONE

- Kod instalacyjny (`src/lib/setupToken.ts`): `SETUP_TOKEN` z `.env` albo kod losowany przy starcie
  i wypisywany w logu (`src/instrumentation.ts`); wymagany przez `/api/setup` i `/api/setup/logo`;
  pole w kreatorze.
- Atomowość: transakcja z blokadą doradczą i ponownym sprawdzeniem `setupComplete`.
- Logo i obrazy: typ po treści (`src/lib/imageSniff.ts`), SVG tylko bez skryptów, obsługi zdarzeń,
  encji i odwołań zewnętrznych.
- Testy (instalacja od zera): bez kodu i ze złym kodem 403; plik o deklarowanym typie PNG i innej
  treści odrzucony; dwa równoległe poprawne żądania - jedno 200, drugie 403, w bazie jeden operator;
  po konfiguracji 403 (S25).

### 4.11 SA-10. Szczegóły techniczne - NAPRAWIONE

`src/lib/http.ts`: `validationError()` (własne polskie komunikaty ze schematu, domyślne komunikaty zod
zastępowane ogólnym), `serverError()` (szczegóły tylko w logu). Zastąpiono 27 miejsc
`Bad request: ${zod}`, `e.message` w liście mówców, imporcie i wysyłce e-maili. Wyjątek świadomy:
„Wyślij testowy e-mail” w Ustawieniach (operator) pokazuje komunikat serwera SMTP - to jego cel
diagnostyczny. S11.

### 4.12 SA-11. Hasło SMTP - NAPRAWIONE

- Szyfrowanie AES-256-GCM (`src/lib/secretBox.ts`) kluczem `APP_ENCRYPTION_KEY` (fallback: klucz
  wyprowadzony z `NEXTAUTH_SECRET`); obsługa rotacji (`APP_ENCRYPTION_KEYS_OLD`,
  `npm run secrets:rotate`).
- Formularz dostaje tylko informację „zapisane”; zmiana przez wpisanie nowego hasła, usunięcie
  osobnym polem. Hasło nie trafia do dziennika (metadane: „zmienione”/„usunięte”).
- Migracja szyfruje istniejące hasło i usuwa hasła z dawnych wpisów dziennika (test migracji).
- Testy: S23; odtworzenie kopii i odszyfrowanie; rotacja klucza (dwie rotacje, odczyt nowym kluczem,
  komunikat o brakującym kluczu).

### 4.13 SA-12. Dziennik audytu - NAPRAWIONE (z wyłączeniem SA-02)

Nowe wpisy: `USER_CREATED`, `USER_UPDATED` (zmienione pola, zmiana roli i aktywności, bez haseł),
`USER_DEACTIVATED`, `PARTICIPANT_REMOVED`, `PASSWORD_CHANGED`, `SESSION_REVOKED` (zamknięcie
posiedzenia), `LOGIN_LOCKED`, `VOTE_BALLOT_RESET`, `RETENTION_APPLIED`, oraz `ATTENDANCE_MARKED` /
`ATTENDANCE_REVOKED` dla sprawdzenia obecności (także samodzielnego). Nieudane logowania -
w `LoginAttempt`. Głosy i zerowania w imieniu w jawnych - **bez audytu** (decyzja SA-02).

### 4.14 SA-13. Migracja bazy - NAPRAWIONE

`scripts/migrate.sh` (start kontenera):
1. `prisma/data-migrations/pre-push.sql` - idempotentne, jawne migracje: kolumna i indeks tokenu
   ekranu; BR-5 (konta CHAIRPERSON -> PARTICIPANT z wpisem w dzienniku, odtworzenie typu `Role`);
2. `prisma db push` **bez** `--accept-data-loss` - zmiana usuwająca dane zatrzymuje start
   (`[migrate] STOP`) i niczego nie zmienia;
3. `scripts/post-migrate.ts` - tokeny ekranu, szyfrowanie hasła SMTP, czyszczenie dziennika.

Testy: stan sprzed zmian (z kontem CHAIRPERSON, przewodniczącym w posiedzeniu, głosowaniami jawnymi
i tajnymi, hasłem SMTP jawnym w ustawieniach i w dzienniku) - liczby rekordów bez zmian, przypisanie
przewodniczącego zachowane, rola zmigrowana, hasło zaszyfrowane, dziennik oczyszczony; ponowne
uruchomienie bez zmian (idempotencja); instalacja od zera; symulowana zmiana schematu usuwająca
kolumnę z danymi - start zatrzymany, dane zachowane.

### 4.15 Reguły biznesowe

- **BR-1 (funkcja usunięta):** usunięto `holdResults`/`publishResultsAutomatically` z interfejsu
  i API posiedzenia, `POST /api/votes/[id]/publish`, ukryte `autoPublishResults` w Ustawieniach
  i ustawianie `resultPublishedAt` przy zamknięciu. Kolumny pozostają w bazie jako dane historyczne
  (oznaczone w schemacie jako nieużywane) - bez migracji usuwającej. Zamknięcie nie przełącza
  dodatkowo planszy (zachowano dotychczasowe automatyczne pokazanie wyników na prezentacji). S10.
- **BR-2 (reguła):** radni widzą imienne głosy jawne w trakcie (S9).
- **BR-3:** otwarcie głosowania (`src/lib/openVote.ts`, jedyna ścieżka, także „Utwórz i otwórz”)
  i zamknięcie posiedzenia pod blokadą wiersza posiedzenia; głosowanie tylko w posiedzeniu
  otwartym / w toku / przerwanym; zamknięcie i anulowanie głosowania pod blokadą wiersza głosowania.
  Różne posiedzenia nie blokują się nawzajem; ta sama osoba głosuje w dwóch posiedzeniach (S15).
  Testy: S14 (dwa równoległe otwarcia - jedno otwarte), S15, S15b (migawka składu przy „Utwórz
  i otwórz”, wcześniej pomijana), S17.
- **BR-4 (reguła):** bez zmian (S5).
- **BR-5:** usunięta wartość `CHAIRPERSON` z enuma `Role` (migracja), import i tworzenie kont
  odrzucają tę rolę z komunikatem (S20); przewodniczący wskazywany tylko w posiedzeniu.

---

## 5. Rekomendacje utwardzające - stan

| Rekomendacja | Stan | Szczegóły |
|---|---|---|
| CSP i nagłówki | **WYKONANE** | `next.config.ts`: CSP (bez `unsafe-eval` w produkcji, `frame-ancestors 'self'`, `object-src 'none'`), `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, bez `X-Powered-By`; Caddy: HSTS z `includeSubDomains`. Sprawdzone w przeglądarce: panel operatora, Ustawienia, PDF (lista obecności, protokół), DOCX, CSV, ekran i nakładka z tokenem, panel radnego - 0 naruszeń CSP. `script-src` zawiera `'unsafe-inline'` (patrz niżej). |
| CSP z nonce (bez `'unsafe-inline'`) | **NIEWYKONANE** | Wymagałoby renderowania wszystkich stron dynamicznie z nonce z middleware; ryzyko regresji ekranów prezentacji i kart głosowania. Pozostałe dyrektywy ograniczają skutki. |
| Sprawdzanie `Origin` | **WYKONANE** | Middleware odrzuca POST/PUT/PATCH/DELETE na `/api/*` z obcej domeny (S21). |
| GET bez zapisów | **WYKONANE** dla `formal-motions` | |
| CSV - neutralizacja formuł | **WYKONANE** | `src/lib/csv.ts` (S22). |
| Escapowanie e-maili, adres z `NEXTAUTH_URL` | **WYKONANE** | `src/lib/mailTemplates.ts`, `appOrigin()`; temat bez znaków nowej linii. Test lokalnym SMTP: dane z HTML w imieniu i nazwie organizacji zescapowane. |
| Hasła: wymuszona zmiana, min. 8 | **WYKONANE** | S19, S19b. |
| Dostępność: limity SSE, prezentacji, cache | **WYKONANE** | SSE 12 połączeń/konto; prezentacja 900/min/IP + cache 1 s (S26). Limit SSE nie był testowany obciążeniowo. |
| Retencja dzienników | **WYKONANE** | Ustawienia (dni dla dziennika zdarzeń, logowań, e-maili; puste = bez usuwania - domyślnie nic nie jest usuwane, min. 30 dni); raz na dobę i przycisk „Zastosuj retencję teraz”; wpis `RETENTION_APPLIED`. Test: bez okresów nic nie jest usuwane; okres < 30 dni odrzucony (400); z okresami usunięto tylko wpisy starsze (próba logowania sprzed 40 dni, wpis dziennika sprzed 400 dni), nowsze zostały. |
| Szyfrowanie sekretów z obsługą kluczy | **WYKONANE** | `secretBox`, rotacja, testy (4.12). |
| Szyfrowane kopie i odtworzenie | **WYKONANE** | `scripts/backup.sh`, `scripts/restore.sh` (AES-256 + PBKDF2, SHA-256, baza + pliki). Sprawdzone: kopia, odtworzenie do pustej bazy (zgodne liczby rekordów, identyczne pliki, odszyfrowanie hasła SMTP), zły klucz i uszkodzony plik zatrzymują odtwarzanie przed zapisem. Polecenia `docker compose exec` w skryptach nie były uruchamiane (brak Dockera) - testowano tymi samymi skryptami z poleceniami lokalnymi. |
| Zależności | **WYKONANE częściowo** | `npm audit` przed: 12 (4 krytyczne, 7 wysokich, 1 średnia). Zaktualizowano: `next` 15.5.23 -> 15.5.27, `next-auth` beta.25 -> beta.32 (`@auth/core` 0.41.3), `nodemailer` 6.10.1 -> 10.0.14 (`overrides` dla opcjonalnej zależności next-auth - dostawca e-mail Auth.js nie jest używany), `npm audit fix` bez `--force`; usunięto nieużywane `jspdf`, `jspdf-autotable`, `html2canvas`. Po: 0 krytycznych. Pozostają (wymagają zmian major): `postcss` wewnątrz `next` (narzędzie budowania, przetwarza wyłącznie własny CSS; poprawka w Next 16) oraz `deepmerge-ts` w CLI `prisma` (narzędzie migracji, dane wejściowe to własna konfiguracja). Ocena: nieosiągalne z sieci. |
| Obraz Node | **WYKONANE** | `node:22-alpine` (Node 20 bez wsparcia), wyłącznie `npm ci`, usunięte instalowanie `pnpm`. Budowa i uruchomienie w Docker Compose sprawdzone później (POPRAWKI.md, AAX) - z wyjątkiem kroku `apk add`, niedostępnego w sieci testowej. |
| Sumy kontrolne fontów | **ZBĘDNE (zmienione)** | Fonty Lato są teraz w repozytorium (`public/fonts/`, licencja OFL obok) - obraz niczego nie pobiera w czasie budowy; `scripts/pin-fonts.sh` usunięty. |
| Przypięcie obrazów po digest | **NIEWYKONANE** | Brak dostępu do rejestru obrazów w środowisku testowym; obrazy przypięte do wersji głównych. |
| Wymagane sekrety w compose | **WYKONANE** | `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET` bez wartości domyślnych (`:?`). |
| CI | **WYKONANE (nieuruchomione)** | `.github/workflows/ci.yml`: typy, migracja od zera, seed syntetyczny, build, sondy, test kotarki. Ten sam przebieg wykonano lokalnie (S1-S26: 44/44). Na GitHubie workflow uruchomi się przy PR lub push do `main`. |
| Limit bezczynności, wylogowanie po posiedzeniu | **WYKONANE** | 4.5. |

---

## 6. Tabela pokrycia

| Obszar | Metoda | Wynik |
|---|---|---|
| Hasła, logowanie, enumeracja, limity | kod + S8, S8b, S8c, S19 | naprawione |
| Sesje: wylogowanie, odwołanie, bezczynność, zmiana roli | kod + S7, S7b, S7c, S16, S18 | naprawione |
| CSRF / Origin | S21 | naprawione |
| Przekierowania | S12 | naprawione |
| Autoryzacja tras, IDOR | inwentaryzacja + C1, C5, S4, S6 | naprawione / OK |
| Głos za innego, przed otwarciem / po zamknięciu, wielokrotny | C1, C2, C3 | OK |
| Wyścig cast vs close | C4 | OK |
| Otwieranie głosowań, cykl życia | S14, S15b, S17 | naprawione |
| Wiele posiedzeń jednej osoby | S15, S16 | reguła |
| Tajność (API, ekran, nakładka, raporty, CSV, SSE) | S3, S3b, S3c, S3d + kod | naprawione |
| Zerowanie głosu tajnego | S13, S13b | nowa funkcja |
| Głos w imieniu (jawne), PIN | S5, S1, S2 | zaakceptowane ryzyko |
| Prezentacja / nakładka / cache | S1b, S4, S4b, S4c, S26 + przeglądarka | naprawione |
| Upload, kreator | test od zera, S25 | naprawione |
| Błędy techniczne | S11 | naprawione |
| SMTP, e-maile | S23 + lokalny SMTP | naprawione |
| CSV | S22 | naprawione |
| Nagłówki, CSP | S24 + przeglądarka (eksporty, ekrany) | naprawione |
| Migracje, BR-5 | testy migracji (stan sprzed zmian, od zera, blokada utraty danych) + S20 | naprawione |
| Kopie zapasowe, klucze | test kopii, odtworzenia, rotacji | wykonane |
| Zależności | `npm audit` przed i po | 0 krytycznych; 2 pozostałe (narzędzia budowania) |
| Serwer produkcyjny, TLS, obraz Dockera | - | nie objęto (2.4) |

---

## 7. Plan dalszych działań i wdrożenia

**Przed wdrożeniem (konieczne):**
1. Zbudować obraz na serwerze testowym lub produkcyjnym przed przełączeniem (`docker compose build`) -
   obrazu nie dało się zbudować w środowisku testowym.
2. Uzupełnić `.env`: `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`, kopia poza serwerem);
   upewnić się, że są `POSTGRES_PASSWORD` i `NEXTAUTH_SECRET` (bez nich start się zatrzyma).
3. Utworzyć klucz kopii `/root/iobrady-backup.key` (kopia poza serwerem) i wykonać `./scripts/backup.sh`
   PRZED wdrożeniem (zmiana schematu).
4. Po starcie sprawdzić w logu `[migrate] gotowe`; przy `[migrate] STOP` dane są nietknięte -
   wrócić do poprzedniej wersji.
5. Poinformować użytkowników, że muszą zalogować się ponownie; otworzyć ponownie ekrany sali
   i źródła OBS z nowych linków w panelu (menu „Raporty”).
6. Opcjonalnie: ustawić w Ustawieniach limit bezczynności, wylogowanie po zamknięciu posiedzenia
   i okresy retencji (domyślnie: 240 min, wyłączone, bez usuwania).

**Później:**
- przypiąć obrazy Dockera po digest;
- rozważyć migrację na Next 16 (usuwa pozostałą podatność `postcss` w narzędziu budowania) i CSP z nonce;
- zaktualizować nieaktualny test `tests/e2e/operator-flow.spec.ts` (zakłada nieistniejący seed
  z kontami `@obradio.local`; nie przechodził już przed zmianami - poza zakresem poprawek);
- okresowo (np. raz na kwartał) sprawdzać odtworzenie kopii na serwerze testowym.

**Zaakceptowane ryzyka do ponownej oceny przy zmianie założeń:** SA-02, SA-03, okno szyfrowanego
powiązania osoby z treścią głosu tajnego w trakcie głosowania.

---

## 8. Wykonane testy i sposób odtworzenia

Wszystkie testy wykonano 2026-10-04 lokalnie (build produkcyjny `next start`, PostgreSQL 16 lokalnie,
dane syntetyczne). Po testach bazy testowe odtwarzano ze zrzutu.

### 8.1 Sondy bezpieczeństwa - `tests/security/audit-probes.mjs`

Odmawia działania poza localhost; hasła kont testowych ze zmiennych środowiskowych (nie są wypisywane).
Serwer uruchamiany z `TRUST_PROXY=true` (sondy symulują różne IP nagłówkiem `X-Forwarded-For`).

```bash
# baza testowa: lokalna, pusta -> migracja -> dane syntetyczne
./scripts/migrate.sh
SEC_OP_PASS=<hasło testowe> SEC_PT_PASS=<hasło testowe> npx tsx tests/security/fixture.ts
npm run build && TRUST_PROXY=true npx next start -p 3000 &
SEC_OP_EMAIL=operator@example.local SEC_OP_PASS=<...> SEC_PT_PASS=<...> CHROME_PATH=<chromium> \
  node tests/security/audit-probes.mjs
```

Wynik końcowy (na stanie zmigrowanym ze zrzutu sprzed zmian): **44/44 OK**; ten sam zestaw na bazie
utworzonej od zera i seedzie syntetycznym: 43/43 OK (przed dodaniem S26).

| Sonda | Kategoria | Sprawdza | Wynik |
|---|---|---|---|
| S1 | zaakceptowane | PIN na ekranie z tokenem | zachowane |
| S1b | naprawa | bez tokenu i sesji brak danych prezentacji | 404 |
| S2 | zaakceptowane | 30 błędnych PIN, potem poprawny | 30 x 403, 0 x 429, poprawny 200 |
| C1 | kontrola | radny za innego | 403 |
| C2 | kontrola | 8 równoległych głosów | 1 karta |
| S5 | zaakceptowane | głos/zerowanie w imieniu (jawne) | 200/200/200 |
| S9 | reguła | `castByUser` dla radnego w jawnym | obecny |
| S10 | reguła (BR-1) | raport od razu, wstrzymanie usunięte | raport 200, `holdResults` ignorowane, `/publish` 404 |
| C3 | kontrola | głos po zamknięciu | 400 |
| S3 | naprawa | tajne w trakcie: ekran, radny, operator, CSV, report-data | 0/0/0, 0, 0, 409, 409 |
| S3b | naprawa | liczba oddanych, „nie głosowali”, kto oddał | 1, 1, -1 osoba, tak; radny bez listy |
| S13 | nowa funkcja | zerowanie tajnego | radny 403, operator 200, oddanych 0, ponowny głos 200, audyt bez treści |
| C4 | kontrola | wyścig cast vs close | suma liczników = markery |
| S13b | nowa funkcja | po zamknięciu brak treści, zerowanie niemożliwe | 0 treści, 400 |
| S3c | naprawa | wynik od razu po zamknięciu | ekran 1/1, raport radnego dostępny |
| S3d | naprawa | kotarka | ZA 0, oddanych 1, kto oddał widoczny dla operatora |
| S14 | naprawa | 2 równoległe otwarcia w jednym posiedzeniu | 200/400, otwarte 1 |
| S15 | reguła | jedna osoba w dwóch posiedzeniach | 2 karty, głos 200 i 200 |
| S15b | naprawa | „Utwórz i otwórz” z migawką składu | 200, migawka 2 wpisy |
| S16 | naprawa | wylogowanie po zamknięciu posiedzenia | radny w 2 posiedzeniach 200; tylko w zamkniętym 401 |
| S17 | naprawa | głosowanie w zamkniętym posiedzeniu | 400 |
| S4 | naprawa | prezentacja/nakładka: token, zły token, sesja | 404/404/200, nakładka 404/200, ciasteczko HttpOnly, radny 200 |
| S4b | naprawa | nowy link ekranu | stary 404, nowy 200 |
| S4c | naprawa | nagłówek cache | `private, no-store` |
| S6 | naprawa | `formal-motions` obcego posiedzenia | 404, 0 nowych list |
| C5 | kontrola | SSE obcego posiedzenia | 403 |
| S7 / S7b / S7c | naprawa | sesja po zmianie roli / dezaktywacji / wylogowaniu | 401 / 401 / 401 |
| S18 | naprawa | bezczynność | SSE i odpytywanie nie przedłużają; po limicie 401; aktywność odświeża |
| S8 | naprawa | 25 logowań z jednego IP + literówki | 25/25, inne konto OK |
| S8b | naprawa | blokada konto+IP | z IP atakującego `rate_limited`, właściciel z innego IP OK, `LOGIN_LOCKED` |
| S8c | naprawa | czas odpowiedzi | 109 ms / 116 ms |
| S19 / S19b | naprawa | hasło startowe; min. 8 | 403 i przekierowanie na konto, po zmianie 200; 400 |
| S11 | naprawa | treść błędu walidacji | „Nieprawidłowe dane żądania.” |
| S20 | reguła (BR-5) | rola CHAIRPERSON | utworzenie 400, import „error”, 0 kont |
| S21 | naprawa | `Origin` obcy | 403 |
| S22 | naprawa | CSV z formułą w tytule | `'=HYPERLINK` |
| S23 | naprawa | hasło SMTP | brak w HTML i dzienniku, zaszyfrowane w bazie |
| S24 | naprawa | nagłówki | CSP, nosniff, XFO, bez X-Powered-By |
| S25 | naprawa | `/setup` po konfiguracji | 403 |
| S26 | naprawa | limit API prezentacji | 900 x 200, 5 x 429, inne IP 200 |
| S12 | naprawa | otwarte przekierowanie (3 warianty) | brak wyjścia poza aplikację |

### 8.2 Pozostałe testy

| Test | Jak | Wynik |
|---|---|---|
| `tests/e2e/booth-mode.spec.ts` | `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/booth-mode.spec.ts` | 7/7 (test regresji zaktualizowany do reguły SA-01) |
| `tests/e2e/operator-flow.spec.ts` | jw. | 4 niepowodzenia - test nieaktualny (seed `@obradio.local` nie istnieje), niezwiązany ze zmianami |
| CSP i eksporty w przeglądarce | Playwright: panel operatora, lista obecności PDF, protokół PDF i DOCX, zestawienie CSV, Ustawienia, ekran i nakładka z tokenem, ekran bez tokenu, panel radnego | wszystkie pobrania wykonane, 0 naruszeń CSP, ekran bez tokenu 404 |
| Chronione karty głosowania | porównanie funkcji kart (`ParticipantSessionClient.tsx`), `MiniDisplayClient.tsx`, `globals.css` | bez zmian |
| Migracja stanu sprzed zmian | zrzut ze stanem „legacy” -> `scripts/migrate.sh` (dwukrotnie) | dane zachowane, BR-5 i SA-11 zmigrowane, idempotentne |
| Blokada utraty danych | schemat bez kolumny z danymi -> `scripts/migrate.sh` | `STOP`, kod 1, dane zachowane |
| Instalacja od zera | pusta baza -> `migrate.sh` -> `next start` -> kreator | kod w logu, 403 bez/ze złym kodem, logo po treści, równoległy setup: 1 operator |
| Kopia i odtworzenie | `scripts/backup.sh` / `scripts/restore.sh` z poleceniami lokalnymi | zgodne dane i pliki; zły klucz i uszkodzony plik zatrzymują przed zapisem |
| Rotacja klucza | `post-migrate.ts --rotate` z `APP_ENCRYPTION_KEY`/`_OLD` | zmiana identyfikatora klucza, odczyt nowym kluczem, czytelny błąd bez klucza |
| Wysyłka e-mail | lokalny pochłaniacz SMTP `127.0.0.1:2525` | test e-mail i powitalny wysłane przez nodemailer 10; HTML zescapowany |
| Typy i build | `npx tsc --noEmit`, `npm run build` | bez błędów |
| `npm audit` | przed i po aktualizacjach | 12 -> 5 (0 krytycznych; pozostałe w narzędziach budowania) |
| Retencja dzienników | API Ustawień + `/api/settings/retention` na danych syntetycznych | usuwane tylko wpisy starsze niż okres; domyślnie nic; min. 30 dni |

### 8.3 Nie wykonano

- `docker compose build` / uruchomienie w kontenerach - brak demona Dockera w środowisku testowym
  (sprawdzone później, POPRAWKI.md AAX).
- Weryfikacja na serwerze produkcyjnym (TLS, nagłówki Caddy) - poza zakresem i bez zgody na wdrożenie.
- Przypięcie obrazów po digest - brak dostępu do rejestru obrazów (fonty są już w repozytorium).
- Testy obciążeniowe (limit SSE, rozproszone zgadywanie haseł).
