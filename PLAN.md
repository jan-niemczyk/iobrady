# iOBRADY - mapa prac (skompaktowana)

Łączy listę z 2026-07-26 z niedokończonym backlogiem z sesji 2026-07-24/25.
Legenda: [S] wymaga zmiany schematu · [-] bez schematu · ✓ już zrobione (weryfikacja w kodzie)

---

## PAKIET A - Nakładka na transmisję (przeprojektowanie) [-]
Priorytet 1. Wszystko w `src/app/overlay/`.
1. Nowy układ „dzielonych" WĄSKICH pasków (jak w referencyjnej nakładce), nie gruby jeden pasek.
2. Górny pasek zostaje; nazwa organu KAPITALIKAMI; nazwa posiedzenia w osobnym kafelku pod organem (przy logo).
3. Duże, czytelne napisy (widok na telefonie).
4. Bug „głosowanie nie znika" - respektowanie tej samej logiki co prezentacja (powrót-do-auto chowa wszystkie poprzednie).
5. Domyślny widok: dół = wąski pasek z nazwą posiedzenia (albo kafelek pod organem - preferowane).
6. Punkt: wąski pasek w innym kolorze „Pkt N. porz. obrad: (nazwa)", z animacją.
7. Mówca: wąski pasek w innym kolorze, dopasowany szerokością: „Przemawia: Imię Nazwisko / Funkcja".
8. Głosowanie - otwarcie: wąski pasek „Trwa głosowanie: (temat)", BEZ większości.
9. Głosowanie - zamknięcie: na 10 s okienko „WYNIKI GŁOSOWANIA" pod logo (kafelki podsumy:
   głosowało, większość, za/przeciw/wstrz. lub lista) + wyniki imienne (do wymyślenia forma).
10. Tryb wyników (wybór operatora): (a) okienko-kafelki, albo (b) pełna tablica imienna wg ustawień prezentacji.
11. W trakcie głosowania: NIGDY nie pokazywać wymaganej większości (tylko po zamknięciu).
12. Jednolita animacja przewijania dla wszystkich pasków (spójność).
13. Przerwa: kafelek od końca logo w dół „Przerwa w obradach".
14. Wyciszenie w OBS - wyjaśnić i odwzorować mechanizm z referencji (atrybut/tytuł stanu do filtrowania).

## PAKIET B - Prezentacja + obecność (drobne, spójne) [-]
1. Zegar mówcy: przełącznik włączania (prezentacja + nakładka).
2. Przerwa w obradach: przełącznik w panelu (obecnie brak sposobu włączenia).
3. Pasek „UCZESTNICY/…": poprawka nazewnictwa (uczestnicy = z prawem głosu; reszta = goście);
   redukcja do „z prawem głosu" + „kworum" - nad kreską, między nazwą posiedzenia a „na żywo".
4. Panel radnego: zawsze imię i nazwisko (by wiedział, na czyim koncie jest).
5. Panel radnego: usunąć zadeklarowaną większość (radnemu zbędna).

## PAKIET C - Osoby: funkcje, priorytet [S]
1. Pole „funkcja" przy osobie (ustawienia osoby) - pokazywane na prezentacji i nakładce.
2. Priorytet w dyskusji: przycisk „Priorytet" (osoba wskakuje wyżej w kolejce mówców).
3. (CHAIRPERSON - decyzja odłożona; user zdecyduje później.)

## PAKIET F - Agenda: podpunkty [-]
1. Zamknięcie wszystkich podpunktów w punkcie → automatyczne zamknięcie całego punktu.

## PAKIET G - Drobiazgi [-]
1. Favicona.
2. Rozdzielenie w panelu głosowań zaplanowanych od przeprowadzonych (żeby nie spadały na dół).

## PAKIET D - Logowanie po loginach [S]
1. NextAuth: login zamiast e-maila; ekran logowania; import CSV (login).
   Migracja + strategia dla istniejących kont (login = część przed @ w e-mailu).

## PAKIET E - Kworum + protokół [S/-]
1. Dokończyć „nowe kworum" (potwierdzić model - patrz backlog).
2. Protokół: nowa treść + generowanie do .docx.

---

## BACKLOG z sesji 2026-07-24/25 (część już zrobiona - zweryfikowane w kodzie)
- ✓ Bug listy/polling (kasowanie niewysłanych zaznaczeń) - naprawione (key + brak resetującego effectu).
- ✓ Sortowanie Ł/Ó/Ż (comparePl / Intl.Collator "pl") - jest (src/lib/sortPl.ts).
- ✓ Snapshot klubu/personaliów w Ballot + SpeakerListEntry - pola są (voterClubShort, speakerClubShort).
- ✓ Wykluczenie z posiedzenia (excludedFromMeeting) - pole jest.
- ✓ Hurtowe usuwanie użytkowników - jest (ParticipantsManagerClient).
- ✓ Goście bez konta (model Guest + API) - backend jest (`/api/guests`).  UI KATALOGU: do sprawdzenia/dokończenia.
- ✓ Szablony składu (MeetingTemplate + API) - backend jest.  UI: BRAK - do zrobienia.
- Skrót klubu w nawiasie na liście mówców (gdy groupsEnabled) - do weryfikacji.
- Lista niegłosujących u przewodniczącego w trwającym głosowaniu - do weryfikacji/dokończenia.
- Odczyt list/raportów ze snapshotu (nie z bieżącego klubu) - do weryfikacji.
- Grupy posiedzeń - (część „wiele posiedzeń naraz").

## DUŻE TEMATY (osobne tury)
- Wiele posiedzeń naraz (przebudowa „active": me/session, display, attendance, głosowania).
- Przebudowa UX/UI panelu operatora („najpotrzebniejsze w zasięgu").

## KOLEJNOŚĆ (rekomendacja)
A → B → F → G (bez schematu, szybkie), potem C (schemat: funkcje/priorytet),
domknięcie UI gości/szablonów, potem D (loginy), E (kworum+protokół),
na końcu wielo-posiedzeniowość i redesign panelu.
