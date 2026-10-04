# iOBRADY

Aplikacja internetowa do prowadzenia posiedzeń i głosowań organów kolegialnych (rady gmin i miast,
komisje, zgromadzenia). Operator prowadzi posiedzenie z panelu w przeglądarce, uczestnicy głosują
i zgłaszają się do dyskusji na swoich urządzeniach (tablet, telefon, komputer), a wyniki i przebieg
obrad są pokazywane na ekranie sali i w transmisji.

Interfejs i dokumenty są w języku polskim.

## Funkcje

- **Posiedzenia** - porządek obrad z punktami i podpunktami, szablony składu, uczestnicy z prawem głosu
  i goście, kluby, przewodniczący wskazywany dla posiedzenia, załączniki do punktów (dostępne tylko
  po zalogowaniu).
- **Obecność** - potwierdzanie przez operatora lub samodzielnie przez uczestników, sprawdzenia obecności
  z zapisanym stanem, kworum.
- **Głosowania** - zwykłe (za / przeciw / wstrzymuję się), na listę kandydatów, pakietowe (wiele pozycji),
  kworum; jawne i tajne; różne rodzaje i podstawy większości; opcjonalny kod PIN; wyłączenia
  z głosowania; tryb kotarkowy (głosowanie tajne w jednej kabinie, kartę udostępnia operator).
  W głosowaniu tajnym rozkład głosów nie jest dostępny dla nikogo (także operatora) przed zamknięciem.
- **Lista mówców** - dyskusja, ad vocem, wnioski formalne, limity czasu wypowiedzi, zegar dyskusji
  (także czas klubów), sygnał dźwiękowy po przekroczeniu czasu.
- **Ekrany**
  - panel operatora - pełne sterowanie posiedzeniem,
  - panel uczestnika - głosowanie, obecność, zgłoszenia; przewodniczący prowadzi obrady z tego samego panelu,
  - wyświetlacz uczestnika (wąskie okno nakładane na transmisję) - dla wskazanych osób,
  - ekran sali (prezentacja) - automatyczny dobór widoku: głosowanie, wyniki, lista mówców, porządek,
    komunikaty, przerwa, plansza reprezentacyjna,
  - nakładka transmisji (OBS).
  Ekran sali i nakładka są dostępne przez link z tokenem, który można unieważnić.
- **Dokumenty** - raporty głosowań (PDF, CSV), listy obecności i do podpisu, protokół (DOCX),
  odcinki z danymi logowania (PDF z kodem QR). Wydruki czarno-białe.
- **Konta** - logowanie e-mailem i hasłem, wymuszona zmiana hasła startowego, limit bezczynności,
  natychmiastowe unieważnienie sesji po zmianie roli, hasła lub dezaktywacji, rejestr logowań
  i dziennik czynności.
- **E-mail (opcjonalnie)** - wysyłka danych logowania i wiadomości do uczestników przez własny serwer SMTP.
- **Kopie zapasowe** - szyfrowana kopia bazy i plików oraz procedura odtworzenia.

Opis pracy operatora: [docs/OPERATOR.md](docs/OPERATOR.md).

## Role

| Rola | Kto | Co może |
|---|---|---|
| Operator | obsługa biura rady | wszystko: konta, posiedzenia, głosowania, ekrany, dokumenty, ustawienia |
| Uczestnik | radny, członek organu | głosowanie, potwierdzanie obecności, zgłoszenia do dyskusji, materiały posiedzenia |
| Przewodniczący | uczestnik oznaczony na danym posiedzeniu | jak uczestnik oraz prowadzenie obrad: lista mówców, wnioski formalne, zamykanie głosowań, zegar dyskusji, sprawdzanie obecności |

Ekran sali i nakładka transmisji nie wymagają konta - tylko linku z tokenem.

## Wymagania

- Serwer z Linuksem (np. Ubuntu 22.04 lub 24.04), min. 2 GB RAM (budowanie obrazu), 10 GB miejsca na dysku.
- Docker z wtyczką Docker Compose oraz Git.
- Domena (lub subdomena) wskazująca na serwer i otwarte porty 80 i 443 - dla HTTPS.
- Przeglądarki: aktualne Chrome, Edge, Firefox lub Safari.

## Instalacja

Instrukcja krok po kroku - od czystego serwera do działającej aplikacji pod własną domeną z HTTPS,
z aktualizacjami, kopiami zapasowymi i rozwiązywaniem problemów: **[INSTALACJA.md](INSTALACJA.md)**.

W skrócie: `git clone`, `cp .env.example .env` i uzupełnienie wartości, `./scripts/update.sh --no-pull`,
a następnie kreator `/setup` w przeglądarce. Aktualizacja to jedno polecenie: `./scripts/update.sh`.

## Konfiguracja

Cała konfiguracja instalacji jest w pliku `.env` (wzór z opisem każdej zmiennej: [.env.example](.env.example)).
Najważniejsze:

| Zmienna | Znaczenie |
|---|---|
| `NEXTAUTH_URL` | publiczny adres aplikacji, np. `https://obrady.twoja-domena.pl` |
| `DOMAIN` | ten sam host - dla niego serwer WWW (Caddy) pobiera certyfikat HTTPS |
| `NEXTAUTH_SECRET` | sekret podpisujący sesje |
| `APP_ENCRYPTION_KEY` | klucz szyfrowania sekretów w bazie (hasło SMTP) |
| `POSTGRES_PASSWORD` | hasło bazy danych |

Aplikacja nie ma wbudowanych adresów, domen ani kont. Przy błędnej konfiguracji odmawia startu
z opisem problemu (sprawdzenie: `./scripts/check-env.sh`). Nazwę organizacji, logo, kolory i czcionki
ekranu sali ustawia się w panelu operatora (Ustawienia).

## Budowa

- Next.js 15 (App Router), React 19, TypeScript
- PostgreSQL 16, Prisma
- NextAuth (sesje w bazie, role operator / uczestnik)
- Server-Sent Events - aktualizacje na żywo
- Bootstrap i Tailwind CSS (style), pdfmake (PDF), docx (DOCX)
- Docker Compose: `db` (PostgreSQL), `app` (aplikacja), `caddy` (HTTPS, reverse proxy)

## Praca nad kodem

```bash
npm ci
cp .env.example .env      # ustaw NEXTAUTH_URL=http://localhost:3000, DOMAIN=http://localhost, sekrety, hasło bazy
                          # oraz DATABASE_URL (sekcja "TYLKO DO PRACY NAD KODEM")
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db   # baza na 127.0.0.1:5432
npm run db:migrate                                  # schemat bazy
npm run dev                                         # http://localhost:3000
```

Testy: `npx tsc --noEmit`, `npm run build`, `npm run test:security` (sondy bezpieczeństwa),
`npx playwright test` (testy przeglądarkowe), `tests/smoke/fresh-install.mjs` (test dymny świeżej
instalacji - opis w nagłówku pliku). CI: [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Ograniczenia

- Jedna organizacja na instalację (ustawienia, konta i posiedzenia są wspólne).
- Jedna instancja aplikacji: aktualizacje na żywo i pamięć podręczna sesji działają w pamięci procesu
  (nie ma skalowania na wiele serwerów).
- Czcionki ekranu sali i nakładki są pobierane z Google Fonts - komputer ekranu potrzebuje dostępu
  do internetu, a Google otrzymuje adres IP tego komputera. Bez dostępu używane są czcionki zastępcze.
  Panel i dokumenty PDF korzystają z czcionek dostarczonych z aplikacją.
- Logowanie hasłem, bez logowania dwuskładnikowego.
- Świadomie zaakceptowane w audycie bezpieczeństwa: PIN głosowania ma 4 cyfry i jest pokazywany
  na ekranie sali; operator może oddać lub wyzerować głos w imieniu uczestnika w głosowaniu jawnym.
- Aplikacja nie jest certyfikowanym systemem głosowania; zgodność z regulaminem organu i przepisami
  ocenia użytkownik.
- Kopie zapasowe uruchamia się poleceniem (`./scripts/backup.sh`, także przy każdej aktualizacji);
  harmonogram (cron) i przechowywanie poza serwerem ustawia administrator.

## Zgłaszanie błędów i podatności

Błędy: [CONTRIBUTING.md](CONTRIBUTING.md). Podatności bezpieczeństwa - nie publicznie, zasady w [SECURITY.md](SECURITY.md).

## Licencja

Oprogramowanie własne. Wszelkie prawa zastrzeżone.
Licencje komponentów zewnętrznych (biblioteki, czcionki): [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
