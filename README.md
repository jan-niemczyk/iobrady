# iOBRADY - System Obsługi Głosowań

**iOBRADY** to aplikacja do prowadzenia posiedzeń i głosowań organów kolegialnych (rady, komisje, zgromadzenia).
Obsługuje obecność, listę mówców, wnioski formalne, głosowania różnych typów oraz generowanie
protokołów i raportów.

## Główne funkcje

- Zarządzanie posiedzeniami: porządek obrad z punktami i podpunktami (numeracja 2.1, 2.2), przewodniczący, uczestnicy, goście.
- Obecność: sprawdzenie obecności z potwierdzaniem (przez operatora lub samodzielnie przez radnych), migawki stanu obecności z możliwością edycji i usuwania.
- Głosowania:
  - zwykłe (za / przeciw / wstrzymuję się),
  - na listę kandydatów,
  - pakietowe (wiele pozycji, na każdą osobno),
  - kworum (sprawdzenie obecności w formie głosowania, opcjonalnie z PIN-em).
  Głosowania jawne i tajne, różne rodzaje i podstawy większości, opcjonalny kod PIN.
- Lista mówców: dyskusja, ad vocem, wnioski formalne, liczniki czasu wypowiedzi (netto per klub).
- Ekrany:
  - prezentacja (sala) - automatyczny dobór widoku (głosowanie, wyniki, obecność, lista mówców, porządek). Wynik zamkniętego głosowania pojawia się automatycznie po jego zakończeniu; operator chowa go z prezentacji, zamykając okno wyniku.
  - panel przewodniczącego / transmisja - podgląd przebiegu z wynikami cząstkowymi,
  - panel radnego - głosowanie, potwierdzanie obecności, zgłoszenia do dyskusji; przewodniczący posiedzenia prowadzi obrady z tego samego panelu (dodatkowe przyciski przy liście mówców i głosowaniu),
  - panel operatora - pełne sterowanie posiedzeniem.
- Dokumenty: protokół (PDF/DOCX), raporty głosowań (PDF/CSV), listy obecności i do podpisu, raporty migawek. Dokumenty czarno-białe, DOCX w foncie Arial.

## Stos technologiczny

- Next.js 15 (App Router), React 19, TypeScript
- PostgreSQL 16 + Prisma
- NextAuth (logowanie hasłem, role: operator / uczestnik; przewodniczący jest uczestnikiem z flagą na posiedzeniu)
- Server-Sent Events (SSE) do aktualizacji na żywo
- Tailwind CSS
- pdfmake (PDF), docx (DOCX)

## Uruchomienie (produkcja)

Pełna instrukcja wdrożenia od zera (dla dowolnego serwera, bez danych konkretnej instalacji)
znajduje się w pliku **INSTRUKCJA-DEPLOY.md**.

Aplikacja działa w kontenerach (Docker Compose): usługa bazy `db`, aplikacja `app`, reverse proxy `caddy`
(automatyczny certyfikat HTTPS).

Wymagane zmienne środowiskowe (plik `.env`):

- `DATABASE_URL` - połączenie do PostgreSQL
- `NEXTAUTH_URL` - publiczny adres aplikacji
- `NEXTAUTH_SECRET` - sekret sesji
- `SEED_OPERATOR_EMAIL`, `SEED_OPERATOR_PASSWORD` - dane konta operatora tworzonego przy seedzie (hasło min. 8 znaków)
- `INIT_SEED` - `true` przy pierwszym uruchomieniu na pustej bazie (potem `false`)

Start:

```
docker compose up -d --build
docker compose logs app -f
```

Przy starcie aplikacja wykonuje `prisma db push` (synchronizacja schematu) i - gdy `INIT_SEED=true` -
seed tworzący ustawienia globalne oraz jedno konto operatora. Konta operatora nie tworzy się z domyślnym
hasłem: bez `SEED_OPERATOR_PASSWORD` seed przerywa działanie.

## Model danych (skrót)

- `Meeting` - posiedzenie (status, tryb prezentacji, ustawienia domyślne).
- `AgendaItem` - punkt/podpunkt porządku obrad.
- `MeetingParticipant` - powiązanie użytkownika z posiedzeniem (prawo głosu, wykluczenia, priorytety, flaga przewodniczącego posiedzenia).
- `Vote` / `VoteOption` / `Ballot` / `VoteRoster` - głosowania, opcje, oddane głosy, migawka składu.
- `AttendanceCheck` / `AttendanceCheckEntry` - sprawdzenia obecności i ich migawki.
- `SpeakerList` / `SpeakerListEntry` - listy mówców i zgłoszenia.
- `Guest` - goście (spoza składu z prawem głosu).

## Role

- Operator - prowadzi posiedzenie: obecność, głosowania, lista mówców, dokumenty, ustawienia.
- Uczestnik (radny) - głosuje, potwierdza obecność, zgłasza się do dyskusji.
- Przewodniczący posiedzenia - uczestnik oznaczony flagą na danym posiedzeniu (głosuje jak każdy radny), który dodatkowo prowadzi obrady w zakresie: zamykanie głosowań, lista mówców i wnioski formalne (udzielanie/kończenie głosu, korekta czasu, limit, kolejność, usuwanie zgłoszeń, otwieranie/zamykanie zapisów), zegar dyskusji, sprawdzenie obecności i kworum. Uprawnienia wynikają z bycia przewodniczącym konkretnego posiedzenia, nie z globalnej roli.

## Bezpieczeństwo

- Logowanie hasłem (hash bcrypt), role sprawdzane po stronie API.
- Nagłówki bezpieczeństwa na proxy (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- Pełny stan posiedzenia dostępny wyłącznie dla operatora.

## Licencja

Oprogramowanie własne. Wszelkie prawa zastrzeżone.
