# CLAUDE.md - iOBRADY (dawniej eSOG)

Ten plik jest czytany automatycznie przez Claude Code przy starcie. Zawiera pełny kontekst
projektu, konwencje i procedury wypracowane w trakcie długiej sesji rozwojowej. **Czytaj też
`POPRAWKI.md` (dziennik wszystkich zmian), `README.md` i `INSTRUKCJA-DEPLOY.md`.**

---

## 1. Czym jest projekt

**iOBRADY** to aplikacja do prowadzenia posiedzeń i głosowań rad miejskich (polska
administracja samorządowa - sesje rady, głosowania, listy mówców, wnioski formalne, protokoły).
Nazwa w interfejsie: **iOBRADY** (dawna nazwa: eSOG / System Obsługi Głosowań - może jeszcze
występować w starych komentarzach).

- **LIVE:** https://glosowania.mswz.pl
- **Serwer:** Hetzner VPS, IP `167.233.60.227`, katalog `/root/esog`
- **Infrastruktura:** Docker Compose (db + app + caddy) + Caddy jako reverse proxy (HTTPS)
- **Właściciel/operator:** Jan - pracuje zdalnie, odpowiada po polsku, robi korekty w trakcie
  (integrować bez zbędnej dyskusji; przy realnych niejasnościach - pytać przed kodowaniem).

---

## 2. Stack techniczny

- **Next.js 15.5** (App Router, `output: standalone`) + **React 19** + **TypeScript**
- **PostgreSQL 16** + **Prisma** (ORM)
- **NextAuth v5** - role: `OPERATOR` / `PARTICIPANT`; `CHAIRPERSON` to flaga per-posiedzenie
  (`MeetingParticipant.isChairperson`), a nie osobna rola
- **SSE** (Server-Sent Events) do aktualizacji na żywo - `publishToMeeting()` w `src/lib/events.ts`
- **pdfmake** - generowanie PDF (raporty głosowań, listy obecności, odcinki logowania z QR)
- **docx** - generowanie protokołów Word
- **qrcode** - kody QR na odcinkach logowania
- **bcryptjs** - hasła; **zod** - walidacja; **date-fns** - daty; **Tailwind** - style

Skrypty (`package.json`): `dev`, `build` (= `prisma generate && next build`), `start`,
`lint`, `prisma:migrate`, `prisma:seed`, `prisma:studio`, `test:e2e` (Playwright).

---

## 3. Struktura katalogów

```
src/
  app/
    (operator)/     - panel operatora (posiedzenia, ustawienia, użytkownicy, szablony)
    (participant)/  - panel uczestnika/radnego: session/ + session/mini/ (widok "wyświetlacz")
    account/        - zmiana hasła
    chairperson/    - widok przewodniczącego
    display/[meetingId]/  - PREZENTACJA (duży ekran sali) - DisplayClient.tsx (~2000 linii)
    overlay/[meetingId]/  - transmisja OBS (nakładka)
    login/
    api/            - wszystkie endpointy (route.ts)
  components/
    operator/       - MeetingPanelClient.tsx (~2500 l.), DisplayControlPanel, SpeakersPanel,
                      FormalMotionsPanel, MeetingSettingsPanel, ParticipantsManagerClient,
                      MeetingParticipantsClient, SettingsForm, AgendaEditorClient, ...
    participant/    - ParticipantSessionClient.tsx (~1700 l.), MiniDisplayClient.tsx
    ui/             - Icon i inne wspólne
  lib/              - logika (patrz niżej)
  types/
prisma/schema.prisma
```

### Kluczowe pliki `src/lib/`
- **`voteReportData.ts`** - `buildVoteReportData(voteId)` -> ReportData. Centralna logika raportu
  głosowania: obecność z migawki rostera (`VoteRoster`), grupowanie po klubach (migawka `clubShort`),
  sortowania, odmiana polska. **Uwaga na obecność (nb/ng)** - patrz sekcja 7.
- **`reportTypes.ts`** - typy ReportData/ReportPerson/ReportGroup; `buildSummaryLine`, etykiety większości.
- **`generatePdf.ts`** - `reportContent(data)` -> definicja pdfmake; `downloadReportsPdf()`,
  `loadPdfMake()` (font Lato z `/fonts` przez URL - NIE Roboto/vfs).
- **`generateProtocol.ts`** - protokół .docx.
- **`meetingName.ts`** - `formatPlDate` (genityw PL, bez "r."), `meetingNameWithDate(name, date)`,
  `withDateText(name, dateText)`. **Obie chronią przed podwójnym "w dniu"** (regex `/w dniu/i`).
- **`loginCards.ts`** - `downloadLoginCards(cards, loginUrl, fileName)` - PDF odcinków logowania
  (imię, login=email, hasło, adres, QR). Font **Lato** (`defaultStyle: { font: "Lato" }`).
- **`useHotkeys.ts`** - hook skrótów klawiszowych (patrz sekcja 8).
- **`ids.ts`** - `newMeetingId()` = nanoid 16 znaków, bezpieczny alfabet URL (krótkie ID posiedzeń).
- **`events.ts`** - SSE (`publishToMeeting`).
- **`quorum.ts`, `majority.ts`, `listVote.ts`** - reguły kworum/większości/list.
- **`sortPl.ts`** - sortowanie polskie.

---

## 4. Uruchomienie lokalne (Claude Code)

W Claude Code masz pełną sieć, więc `prisma generate` DZIAŁA (w środowisku sesji online padał -
patrz sekcja 6). Typowy cykl:

```bash
npm install
npx prisma generate          # działa lokalnie (jest sieć)
npx tsc --noEmit             # audyt typów - patrz sekcja 6
npm run build                # pełny build (prisma generate + next build)
npm run dev                  # serwer deweloperski (potrzebna baza - patrz niżej)
```

Baza lokalnie: najprościej `docker compose up -d db` (Postgres 16) i `DATABASE_URL` w `.env`
wskazujący na `localhost:5432`. Schemat wgrywa `npx prisma db push`.

---

## 5. Deploy na produkcję (Hetzner)

**Standardowa procedura (ZAWSZE backup przy zmianie schematu; `.env` KOPIUJ, nie przenoś):**

```bash
scp esog.tar.gz root@167.233.60.227:/root/          # albo git pull na serwerze
ssh root@167.233.60.227
cd /root
docker compose -f /root/esog/docker-compose.yml exec -T db \
  pg_dump -U esog esog | gzip > /root/esog-backup-$(date +%F-%H%M).sql.gz
docker compose -f /root/esog/docker-compose.yml down
cp /root/esog/.env /root/esog.env.SAVE
rm -rf /root/esog && tar xzf esog.tar.gz            # albo git pull w /root/esog
cp /root/esog.env.SAVE /root/esog/.env
cd /root/esog && docker compose up -d --build
docker compose logs app --tail=100 -f               # czekaj na "✓ Ready", potem Ctrl+C
```

**docker-compose:** 3 usługi - `db` (postgres:16-alpine, wolumen `esog_db`, port 5432 NIE
wystawiony na świat), `app` (build z Dockerfile, `expose: 3000`, wolumen `esog_uploads` na
`/app/public/uploads` - logo przetrwa redeploy), `caddy` (porty 80/443, `./Caddyfile`).
Start `app`: `npx prisma db push --accept-data-loss && [seed?] && node server.js`.
**Dockerfile** curluje fonty Lato (.ttf) do `public/fonts/` i robi `npx prisma generate && npm run build`.

**Migracja do Claude Code:** rozważ `git pull` na serwerze zamiast `scp` paczki - wtedy deploy to
`cd /root/esog && git pull && docker compose up -d --build` (backup i `cp .env` nadal obowiązkowe
przy zmianach schematu).

**WAŻNE: nie deployować bez wyraźnej zgody Jana.** Build na serwerze może paść na etapie
"Linting and checking validity of types" (jeden błąd naraz) - wtedy poprawić i przebudować.

---

## 6. Audyt TypeScript - metodologia

**Kontekst historyczny:** w środowisku sesji online `prisma generate` PADAŁ (brak dostępu do
binaries.prisma.sh), przez co `@prisma/client` był bez typów i `tsc` zwracał ~423-429 FAŁSZYWYCH
błędów (szum). **W Claude Code z siecią ten problem znika** - `prisma generate` działa, więc
`npx tsc --noEmit` powinno być czyste.

Gdyby jednak trzeba było filtrować szum (np. offline), prawdziwe błędy to te w plikach źródłowych
PO wykluczeniu wzorców:
```
never | '\{\}' | is of type 'unknown' | has no exported member |
implicitly has an 'any' | No overload
```
Baseline szumu = 423-429. Jeśli po filtrze pusto -> czysto.

**Weryfikacja klamer** (nawyk z sesji): przy dużych plikach warto sprawdzić bilans `{}` i `()`.
Nawiasy w komentarzach/stringach dają false-positive - realny bilans liczyć po zestripowaniu
komentarzy i stringów.

---

## 7. Pułapki domenowe (uczące się na błędach)

### Obecność w raportach - nb (nieobecny) vs ng (niegłosujący)
- Obecność na potrzeby raportu głosowania bierze się z **migawki rostera** (`VoteRoster`,
  tworzonej przy OTWARCIU głosowania: `present` = `attendance.status==="PRESENT"`,
  `clubShort` = klub z chwili otwarcia).
- **Zabezpieczenie:** jeśli migawka rostera jest pusta (0 obecnych - np. głosowanie otwarto przed
  potwierdzeniem obecności), dla głosowań innych niż KWORUM obecność liczy się z bieżącego
  `attendance.status` (flaga `useRosterPresence = hasRoster && rosterHasAnyPresent`).
  Ta sama logika jest w `voteReportData.ts` i w CSV (`api/votes/[id]/report.csv/route.ts`).
- **KWORUM** to specjalne głosowanie liczone OD ZERA: obecny = ten, kto oddał w nim głos.

### Migawka klubu
- Klub zapisywany jest do rostera w chwili otwarcia głosowania (`clubShort`). W trakcie posiedzenia
  ktoś może zmienić klub - raport i tak używa migawki z momentu głosowania.

### Odmiana polska
- Liczebniki: 1 -> "osoba ... nie poparła"; 2-4 (poza 12-14) -> "osoby ... nie poparły";
  reszta -> "osób ... nie poparło". Wzorzec w `generatePdf.ts` (szukać `nie poparł`).

### Data "w dniu"
- ZAWSZE sklejać nazwę z datą przez `meetingNameWithDate` / `withDateText` (chronią przed
  podwójnym "w dniu"). Nie sklejać ręcznie stringów.

### Audit log
- `audit({ action, ... })` - `action` musi należeć do enuma `AuditAction` w schemacie (m.in.
  MEETING_*, VOTE_*, ATTENDANCE_*, AGENDA_ITEM_*, PARTICIPANT_*, SETTINGS_CHANGED, MESSAGE_PUBLISHED).
  **Nie wymyślać nowych wartości** (np. "USERS_BULK_GROUP" wysypało build - użyto SETTINGS_CHANGED).
  Jeśli naprawdę trzeba nowej akcji - dodać ją do enuma w schemacie.

### PDF - pdfmake
- Font **Lato** ładowany z URL `/fonts/*.ttf` (Dockerfile je pobiera). NIE używać "Roboto"
  ani vfs_fonts (Roboto w defaultStyle = błąd, bo font nie jest zdefiniowany -> PDF się nie generuje).
- Tabele list/pakietu: bez `unbreakable` (pdfmake sam dzieli między strony); wcześniej `unbreakable`
  powodował znikanie tabel wyższych niż strona.

---

## 8. Skróty klawiszowe (`src/lib/useHotkeys.ts`)

Hook `useHotkeys(hotkeys, deps)`:
- NIE działa w polach tekstowych (INPUT/TEXTAREA/SELECT/contentEditable),
- ignoruje Ctrl/Meta/Alt,
- dopasowanie klawisza case-insensitive,
- Shift ignorowany domyślnie TYLKO dla liter (żeby np. "+" = Shift+= działało).

**Zasada UX: skróty są UKRYTE - tylko wybrani mają je znać.** Żadnych widocznych podpowiedzi
"(Z)", "Skróty: ...", ani `aria-keyshortcuts` w UI. (Komentarze w kodzie mogą je opisywać.)

### RADNY (`ParticipantSessionClient.tsx`) - głos wysyła się AUTOMATYCZNIE po naciśnięciu
- Głosowanie zwykłe: **Z**=za, **P**=przeciw, **W**=wstrzymuję się; **O**=nieważny (tajne).
- Kworum / sprawdzenie obecności: **O** = potwierdź obecność (wszystkie potwierdzenia = O).
- Lista (model "sejmowy"): **↑/↓** wybór aktywnej pozycji, **Z** lub **+** = ZA aktywnej,
  **-** = kasuj, **O** = zatwierdź i wyślij. (BEZ cyfr 1-9.)
- Pakiet: **↑/↓** wybór pozycji, **Z/P/W** głos aktywnej (i dalej), **O** lub **Enter** = wyślij.
- Lista mówców: **D**=dyskusja (zgłoś/wycofaj), **Shift+D**=priorytet, **A**=ad vocem,
  **Shift+F**=wniosek formalny na liście mówców.
- Duży czerwony przycisk: **F**=wniosek formalny do prowadzącego (rozróżnienie od Shift+F powyżej).

### OPERATOR (`MeetingPanelClient.tsx`, `SpeakersPanel.tsx`, `FormalMotionsPanel.tsx`)
- Mówcy: **G**=udziel głosu następnemu, **K** lub **Spacja**=zakończ wypowiedź, **+/-/=**=±30 s.
- Wnioski formalne: **B**=udziel głosu wnioskowi, **K/Spacja**=zakończ (wspólne z listą mówców).
- Głosowanie/punkt: **C**=zamknij głosowanie (confirm), **Esc**=zamknij okno wyników + AUTO,
  **A**=prezentacja AUTO, **R**=zakończ bieżący punkt (confirm), **N**=otwórz następny punkt.
- Destrukcyjne akcje operatora = `window.confirm`.

---

## 9. Prezentacja i widoki

- **`display/[meetingId]/DisplayClient.tsx`** - duży ekran sali. Tryby (`ViewKind`): default,
  agenda, agenda-list, vote-active, vote-results, speaker-list, formal-motions, message, break,
  blank, pin. TopBar ma **stałą wysokość (88px)** by nie przeskakiwał; na ekranie `default` jest
  `minimal` (tylko zegar po prawej).
- **Ekran domyślny (DefaultView):** herb/logo + nazwa organu KAPITALIKAMI + nazwa posiedzenia.
  Nazwa ma STAŁĄ wielkość (bez animacji FitText - to była częsta pretensja: "mikroskopijna nazwa").
- **Komunikat OBS (`messageObsStyle`):** kolorowe tło, nazwa posiedzenia u góry + treść pod nią,
  bez marginesu (pełne tło), tylko zegar (TopBar ukryty).
- **Pakiet W TRAKCIE głosowania:** NIE pokazuje pozycji - tylko licznik obecnych/oddanych i tablica
  imienna dla jawnych (jak lista). Pozycje z wynikami cząstkowymi dopiero po zamknięciu.
- **Widok mini (`MiniDisplayClient.tsx`, route `/session/mini`):** wąskie pełne okno nakładane na
  stream, `zIndex:9999`, jednolite ciemne tło. U góry imię i nazwisko (zamiast legitymacji) + zegar
  + przycisk wyjścia (✕ -> /session). Renderuje REALNY panel głosowania (`VoteBallot`), więc można
  głosować i skróty działają. Głosowanie ma najwyższy priorytet. NIE pokazuje pełnej nazwy
  głosowania ani wyniku ostatniego głosowania. Dostęp: uprawnienie `MeetingParticipant.canUseMiniDisplay`
  (operator włącza w tabeli uczestników); link "Otwórz wyświetlacz" w panelu sesji.

---

## 10. Schemat bazy - zasady zmian

- **Wszystkie zmiany schematu robić jako `@default` lub opcjonalne (`?`)** - wtedy `prisma db push`
  (uruchamiany przy starcie kontenera) nakłada je bez utraty danych. Nigdy nie dodawać pól
  wymaganych bez defaultu do istniejących tabel z danymi.
- Nowe posiedzenia dostają krótkie ID (nanoid 16 zn., `newMeetingId()`); istniejące zachowują stare.
- Przy KAŻDEJ zmianie schematu na produkcji: backup bazy (pg_dump) PRZED deployem.
- Domyślne ustawienia posiedzenia (schemat `Meeting`): `autoOpenSpeakerList @default(true)`,
  `displaySummaryAfterClose @default(true)`, `agendaAutoDisplayMode @default("FULL")`.

---

## 11. Konwencje (trwałe)

- **Język: polski** (UI, komunikaty, komentarze, rozmowa z Janem).
- **Typografia:** BEZ myślników em/en (— –), BEZ middot/bullet (· •) - wszystko zamieniać na
  zwykły dywiz `-`. Dotyczy kodu, UI i wydruków.
- Dokumenty B&W; DOCX czcionka Arial; PDF czcionka Lato.
- `.env` na serwerze KOPIOWAĆ (`cp`), nigdy `mv`.
- Pakować/commitować przyrostowo po każdej logicznej partii zmian.
- Weryfikować `tsc` i (przy dużych plikach) bilans klamer po zmianach.
- Nie deployować bez zgody. Duże funkcje - dopytać o szczegóły UX przed implementacją.
- Skróty klawiszowe pozostają ukryte w UI.

---

## 12. Dziennik i dokumentacja w repo
- **`POPRAWKI.md`** - chronologiczny dziennik wszystkich zmian (sekcje A..NN). Aktualizować przy
  każdej większej partii.
- **`README.md`** - opis aplikacji iOBRADY.
- **`INSTRUKCJA-DEPLOY.md`** - uniwersalna instrukcja wdrożenia od zera (placeholdery zamiast danych
  serwera).

Zaczynając pracę: przejrzyj `POPRAWKI.md` od końca, żeby poznać najświeższy stan.
