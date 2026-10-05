# Lista poprawek (seria po deployu)

Legenda: [ ] do zrobienia · [~] w trakcie/wymaga ustalenia · [x] zrobione

## A. Obecność / kworum (największa przebudowa)
- [x] A1. Zintegrować sprawdzenie obecności z listą obecności - JEDEN mechanizm, nie dwa. Usunąć "Otwórz/Zamknij listę".
- [x] A2. Każda zatwierdzona ("Zapisz") zmiana stanu przez operatora tworzy migawkę INKREMENTALNĄ (od poprzedniego stanu), aktualizuje wszystko.
- [x] A3. "Rozpocznij sprawdzenie" = od zera (CONFIRMATION: wszyscy present=false); korekta INCREMENTAL dziedziczy stan.
- [x] A4. BUG: operator oznacza obecnego → nie tworzy się migawka.
- [x] A5. (raporty zamkniętych bez rostera: obecny = oddał głos, niezależnie od migawek)
- [~] A6. (backend: cast+entries blokują nieobecnych; UI radnego ukrywa zapisy) Nieobecni (po zmianie stanu) tracą WSZYSTKIE funkcje w aplikacji (głosowanie, zapisy, wnioski).
- [x] A7. Nigdy-nieobecni mają widoczny przycisk wniosku formalnego - ukryć.
- [x] A8. Otwarcie sprawdzania obecności → automatycznie pokazuje listę obecności na prezentacji i transmisji.
- [x] A9. Kworum (QUORUM_VOTE) po zakończeniu: pokazywać obecni/nieobecni, nie obecni/potwierdziło.
- [x] A10. Głosowanie kworum ma się dodawać do migawek.

## B. Raporty / listy obecności
- [x] B1. Raport obecności = TECHNICZNY: kto, kiedy, co (dziennik zdarzeń obecności). Nie "głosowanie nr -", bez decydowania o kworum.
- [x] B2. To co teraz jest "raportem" → LISTA OBECNOŚCI scalona z całego posiedzenia (kto był, kogo nie było).
- [x] B3. PDF pakietu: imienna tabela osoba x pozycja (za/pr./ws.) + legenda pozycji.
- [x] B4. PDF wykluczeni: "(niez.)" mimo wyłączonych klubów - ukryć klub gdy grupy wyłączone.

## C. Głosowania - cykl życia i UI
- [x] C1. Gdy trwa głosowanie: chować listę mówców, zapisy, przycisk wniosku (radny) - zostaje tylko głosowanie (ew. wyskakujące pole) do zakończenia.
- [x] C2. Edycja głosowania PRZED rozpoczęciem = pełny composer (typ, opcje, większość, PIN, pakiet); PATCH pól strukturalnych tylko dla READY.
- [x] C3. Pakiet w trakcie: 3 linie (za/przeciw/wstrzym) nie 1; działa "Pokaż licznik oddanych głosów".
- [x] C4. Operator: podgląd oddanego głosu (jawne) + zerowanie głosu uczestnika.
- [x] C5. Duże pola: nazwa głosowania i nazwa punktu (nie jedna linijka) - sprawdzić, czemu nie zadziałało.

## D. Zapisy do dyskusji
- [x] D1. Po zamknięciu punktu → zapisy się zamykają. (Obecnie zakończone punkty jako "zaplanowane".)
- [x] D2. Punkt rozpoczęty → znika z "zapisy do dyskusji" (bo jest bieżący).
- [x] D3. Kolejność w panelu radnego: zapisy ZA głosowaniem.
- [x] D4. Operator: podgląd i edycja zapisów do przyszłych punktów bez ich otwierania.

## E. Wnioski formalne
- [x] E1. Wnioski formalne jako osobna lista z licznikiem/limitem (K7).
- [x] E2. Zapisy do wniosków przez operatora (K7 + dopisywanie).
- [x] E3. Prezentacja: przełączenie na "wnioski formalne" - invalid enum value (naprawić enum displayMode).

## F. Prezentacja / przewodniczący
- [x] F1. "Głosowało: 1" jako kafelek identyczny jak w głosowaniu na listę (nie napisik).
- [x] F2. Przerwa: aktualna godzina bez opisu, w rogu.
- [x] F3. Wykluczony: mniej wyczerniony, imię i nazwisko NIE czarną czcionką (widoczne na ciemnym tle).
- [x] F4. (jw. - K17)

## G. Operator UX
- [x] G1. Przerwa w obradach - rozwijane (nie zajmuje miejsca stale).
- [x] G2. Przycisk "Goście" w panelu + dopisywanie gościa z katalogu do listy mówców.
- [x] G3. "Zgłoszenie z priorytetem" → "PRIORYTET"; używać kolorów zgłoszeń z panelu.
- [x] G4. (priorytet w wielu punktach: multi-select pill Globalny + numery punktów; model priorityAgendaItemIds)

## H. Licznik dyskusji
- [x] H1. Licznik dyskusji netto: zawieszenie/zamknięcie punktu kończy przemówienie i nalicza czas; runningSince zerowane (brak tykania na sucho).

## J. Lista do podpisu
- [x] J1. Generator listy obecności do podpisu (Lp. | Nazwisko i imię | Klub | Podpis), PDF Lato.

## I. Ogólne
- [x] I1. Długie pauzy (-) → używać "-" i półpauz "-" wszędzie.

## K. Kolejna seria (po drugim deployu)
- [x] K-SSE. Fix SSE: enqueue po zamknięciu controllera (Invalid state) + cleanup w cancel.
- [x] K2. PDF lista scalona: bez "(scalona)", data w tytule, czarno-biała.
- [x] K2b. PDF raport techniczny: tabela radni x sprawdzenia (do 8 kolumn/tabelę), bez "jest"/kworum/opisu.
- [x] K3. Lista do podpisu: czarne ramki, font 11, 15/stronę bez dzielenia wierszy, nagłówek organ/Lista obecności/nazwa+data, bez "obecni na liście".
- [x] K4. Przerwa: autoformat GG:MM + pole minut z palca.
- [x] K8. Głosowanie na listę: sortowanie alfabetyczne (nie wg głosów).
- [x] K5. Raport konkretnego sprawdzenia: usuń "jest"/kworum, dostosuj do sprawdzania.
- [x] K6. (dopisywanie do przyszłych punktów i do wniosków formalnych)
- [x] K7. Wnioski formalne: licznik + /-30/+30, limit czasu jak dyskusja + domyślny w ustawieniach.
- [x] K9. Przycisk priorytet u radnego: UI zmieniony (naprawić).
- [x] K10. Operator: dodawanie kogoś z priorytetem do listy.
- [x] K11. PRZEBUDOWA modelu obecności: znika stała lista; tylko sprawdzenie obecności (lista = wyskakujące okienko z checkboxami); obecność ze sprawdzenia (i kworum) = jedyny decydent uczestnictwa.
- [x] K12. Nieobecni: znika lista mówców i panel głosowania; widzą tylko pierwszą tabelę "z prawem głosu / nie potwierdzono".
- [x] K13. (referent/komisja UI+prezentacja+eksport; opis usunięty; duże pola: C5) Porządek obrad: usunąć opis, pokazywać referenta, dodać pole "komisja" i pokazywać (admin + prezentacja); duże pola głosowanie/punkt.
- [x] K14. Zamknięcie punktu = zamknięcie zapisów.
- [x] K15. Start nowego przemówienia kończy obecne.
- [x] K16. (radny: modal nad wszystkim; operator: okno wyników po zamknięciu) Głosowanie: wyskakujące okno/overlay nad ekranem.
- [x] K17. Ekran przewodniczącego obsługuje wszystkie typy (lista/pakiet z pozycjami, kworum) + trzymanie wyników imiennych po zamknięciu.
- [x] K18. Eksport porządku obrad: PDF + DOCX (Lato), bez godzin.
- [~] K19. (generator PDF+DOCX gotowy; dyskusja z list mówców, głosowania z listą imienną, suma kontrolna; do dopieszczenia po testach) Generator quasi-protokołu (rozbudowany: dyskusja + głosowania spoza porządku), wzór rada24.

## L. Konto i powiadomienia
- [x] L1. Zmiana hasła zalogowanego użytkownika (operator w ustawieniach, radny przez /account; weryfikacja obecnego, min. 8 znaków).
- [x] L2. Wyskakujące powiadomienie u operatora o nowym wniosku formalnym (toast + dźwięk).
- [x] L3. Przywrócono przycisk „Uczestnicy" (dodawanie uczestników) w karcie Obecność - regresja po K11.
- [x] Redesign operatora: ODRZUCONY przez uzytkownika - zostaje stary uklad (swiadoma decyzja).

## M. Wieloposiedzenia
- [x] M1. Panel radnego: wszystkie otwarte posiedzenia (przełącznik, naraz jedno widoczne).
- [x] M2. Nakładka głosowań PONAD wyborem posiedzenia: głosowanie wyskakuje niezależnie od wybranego posiedzenia; przy kilku posiedzeniach pokazuje nazwę posiedzenia; obsługa wielu otwartych głosowań naraz (oddajesz kolejno w każdym).

## N. Goście
- [x] G2. Przycisk „Goście" w panelu (karta Obecność) + dopisywanie gościa z katalogu do listy mówców (+ Gość).

## O. Bezpieczeństwo (po audycie)
- [x] O1. IDOR + wyciek PIN w /api/meetings/[id]/state - endpoint ograniczony do roli OPERATOR (radny korzysta z /api/me/session). Naprawia odczyt cudzych posiedzeń i ujawnianie pinCode.
- [x] O2. Seed oczyszczony: tylko ustawienia globalne + JEDNO konto operatora; hasło z SEED_OPERATOR_PASSWORD (min. 8 znaków, brak = przerwanie). Usunięto konta radny123/gosc123/operator123 i przykładowe dane.
- [x] O3. Panel logowania: usunięto nieadekwatne oznaczenie wersji (v0.1) i martwy odnośnik "Pomoc".
- [ ] O4. (świadomie pominięte) PIN pozostaje miękką blokadą - bez rate-limitingu/utwardzania (decyzja użytkownika).
- [ ] O5. (do rozważenia później) CSP, rate-limiting logowania, token dla /display.

## P. Poprawki po testach (duża tura)
- [x] P1. Radny: wybór posiedzenia nie przeskakuje (me/session trzyma ?m=).
- [x] P2. Głosowanie jawne niefinalne: okno zostaje do zamknięcia z możliwością zmiany; finalne znika + komunikat.
- [x] P3. Pakiet/lista: bez górnego ZA/PRZECIW/WSTRZYM; sortowanie tylko alfabetyczne (wszyscy, też nieobecni).
- [x] P4. Lista/pakiet: pokazywane JAKIE głosy (tabela osoba x pozycja), nie ile.
- [x] P5. Operator popup wyników: osobny render kworum/lista/pakiet/standard.
- [x] P6. Usuwanie migawek (DELETE + przycisk); karta Obecność pokazuje liczbę z danej migawki, kworum nie miesza się z bieżącym stanem.
- [x] P7. Checkboxy listy mówców (dyskusja/ad vocem/wniosek) zapamiętywane per posiedzenie.
- [x] P8. Przewodniczący: pakiet/lista/kworum jak prezentacja + wyniki cząstkowe; ResultsHoldView per typ.
- [x] P9. Przewodniczący: dyskusja pokazuje się gdy ktokolwiek zapisany (nie tylko przemawia).
- [x] P10. Przewodniczący: w trakcie wniosków formalnych - mówca + licznik + kolejka.
- [x] P11. Pakiet na prezentacji: pozycje z wynikami cząstkowymi (nie jak zwykłe).
- [x] P12. Sekcja obecność: grid responsywny, kafelki nie wychodzą poza sekcję.
- [x] P13. Prezentacja: mówca w ramach wniosku formalnego jest pokazywany (AUTO).
- [x] P14. Lista do podpisu: wymuszone 20 pozycji/stronę.
- [x] P15. Wyniki w protokole PDF/DOCX (odczyt ballot.choice); nierozpoczęte/anulowane/przerwane pomijane.

## R. Druga tura poprawek po testach
- [x] R1. Lista do podpisu: duże wiersze o stałej wysokości wypełniające stronę A4, 20/stronę, bez ucięcia w połowie.
- [x] R2. Sekcja Obecność: przyciski (Uczestnicy/Goście/Korekta/Sprawdzenie) zawijają się pod tytułem, nie wychodzą poza kartę.
- [x] R3. Głosowanie kworum nadpisuje bieżący stan obecności (upsert Attendance), jak potwierdzenie.
- [x] R4. Edycja limitu wniosku formalnego (minuty) przed udzieleniem głosu.
- [x] R5. Radny: minimalizacja panelu głosowania (pasek na dole) + przełącznik między trwającymi głosowaniami (taby).
- [x] R6. Wnioski formalne AUTO (przewodniczący i prezentacja) tylko gdy ktoś PRZEMAWIA; same oczekujące nie przejmują ekranu.

## S. Kworum jako sprawdzenie obecności + poprawki obecności
- [x] S1. Kworum liczone OD ZERA: obecny = kto oddał głos w kworum (raport, prezentacja, roster). Nie dziedziczy wcześniejszej obecności.
- [x] S2. Prezentacja kworum: Uprawnionych / Obecnych (oddali) / Nieobecnych - bez mylącego "potwierdziło".
- [x] S3. Korekta obecności: NIE przełącza prezentacji na listę obecności; rejestruje się jako zwykłe CONFIRMATION (nie "korekta").
- [x] S4. Licznik potwierdzeń na żywo podczas sprawdzania (szybszy polling + wyraźny licznik).
- [x] S5. Sekcja sprawdzania obecności widoczna także po zakończeniu posiedzenia.
- [x] S6. Edycja migawek (kto obecny "w danej godzinie") + opcjonalne nadpisanie stanu bieżącego; przycisk "Odśwież obecność" w wydruku głosowania (recompute-roster) po korekcie migawki.
- [x] S7. Podgląd online w panelu operatora (rejestr SSE: kafelek Online + rozwijana lista kto połączony).
- [x] S8. Lista obecności w trybie AUTO: podczas sprawdzenia (CONFIRMATION) prezentacja sama pokazuje listę BEZ zmiany trybu (zostaje AUTO); po zamknięciu wraca automatycznie. Kworum ma własny widok głosowania.

## T. Duża tura (ustawienia, online, import)
- [x] T1. Usunięto ręczny tryb "Lista obecności" z przełącznika prezentacji (pokazuje się automatycznie w AUTO podczas sprawdzenia). Potwierdzanie obecności bez zmian.
- [x] T2. Nowe posiedzenie kopiuje domyślne z ustawień globalnych (reguła kworum, wartość, tryb obecności).
- [x] T3. Online: globalny heartbeat od zalogowania (endpoint /api/presence/ping + heartbeat w Providers), niezależny od otwarcia posiedzenia; state łączy online SSE + globalny.
- [x] T4. Zmiana hasła dostępna zawsze (link na ekranie bez aktywnego posiedzenia; /account bez ograniczeń).
- [x] T5. Online pokazuje całą listę (online + offline), online najpierw.
- [x] T6. PIN dostępny także dla głosowania kworum (panel ustawień głosowania).
- [x] T8. Zaplanowane głosowania sortowane wg punktu porządku, potem wg kolejności dodania.
- [x] T10. README napisane od nowa (bez odniesień do inspiracji/zewnętrznych instytucji).
- [x] T7. Nazwa posiedzenia + "w dniu DD miesiąc RRRR r." wszędzie poza nagłówkiem prezentacji: raport głosowania, protokół, listy obecności/podpisu, raport migawki, ekran przewodniczącego i radnego. Pomocnik src/lib/meetingName.ts (formatPlDate, meetingNameWithDate); data słownie w dopełniaczu.
- [x] T9. Import głosowań z tekstu (linia = tytuł) ze wspólnymi ustawieniami (typ zwykłe/kworum, jawność, większość, punkt): endpoint /votes/bulk + modal "Importuj z tekstu".

## U. Rola przewodniczącego (wariant C: prowadzi + głosuje)
- [x] U1. Flaga isChairperson na MeetingParticipant (przewodniczący = uczestnik z prawem głosu, prowadzi TO posiedzenie). Globalna rola CHAIRPERSON wycofana z logiki (enum zostaje w schemacie, nieużywany).
- [x] U2. Pomocnik canManageMeeting/canManageByVote/canManageBySpeakerEntry (operator LUB przewodniczący posiedzenia).
- [x] U3. Uprawnienia przewodniczącego: zamykanie głosowań, lista mówców + wnioski formalne (udziel/zakończ, ±30s, limit przed udzieleniem, kolejność), zegar dyskusji, sprawdzenie obecności/kworum.
- [x] U4. Operator: potwierdzone pełne sterowanie zegarem wniosków i edycja limitu przed udzieleniem głosu (było); to samo dostępne dla przewodniczącego.
- [x] U5. Operator oznacza przewodniczącego (checkbox "Przew." w uczestnikach); PATCH meeting-participants + isChairperson w me/session i na stronie.
- [x] U6. Panel radnego: sekcja "Prowadzenie obrad" (tylko dla przewodniczącego danego posiedzenia): zamknij głosowanie, sprawdzenie obecności, lista mówców udziel/zakończ + link do pełnego ekranu przewodniczącego. Głosuje jak każdy radny.
- [x] U7. Sprzątanie roli: middleware i strażnicy /chairperson oparte na fladze (operator lub przewodniczący posiedzenia), nie na globalnej roli.

## W. Poprawki przewodniczącego + głosowania
- [x] W1. Usunięto link/osobną sekcję sterowania. Przewodniczący steruje z LISTY MÓWCÓW (te same przyciski co radny + dodatkowe): przy przemawiającym -30s/+30s/Zakończ, przy oczekujących Udziel. Ekran /chairperson tylko prezentacyjny.
- [x] W2. Radni widzą kolejkę wniosków formalnych (me/session zwraca formalMotions; komponent FormalMotionsQueue dla wszystkich). Przewodniczący steruje: udziel/zakończ/±30s + edycja limitu przed udzieleniem.
- [x] W3. Toast po oddaniu głosu (kolorowy, konkretny głos). WYJĄTEK: głosowania TAJNE - tylko neutralne "Oddano głos" bez ujawniania wyboru. Standard: ZA/PRZECIW/WSTRZYMUJĘ; kworum: potwierdzono; lista: kandydaci; pakiet: głos per pozycja.
- [x] W5. Toast przy rozpoczęciu sprawdzenia obecności ("Rozpoczęto sprawdzenie obecności") i po potwierdzeniu ("Potwierdzono obecność", zielony). Kworum: toast potwierdzenia działa (QuorumBallot -> cast).
- [x] W4. "Pierwszy głos ważny" ustawiany per głosowanie (pole Vote.firstVoteFinal: null=globalne, tak/nie=wymuś). Composer: lista Domyślnie/Tak/Nie; cast, me/session, active-votes uwzględniają per-głosowanie z pierwszeństwem nad globalnym.

## Audyt prewencyjny (pełny tsc offline)
- [x] Zainstalowano zależności (npm) i uruchomiono realny `npx tsc --noEmit`.
- [x] Prisma Client nie generuje się offline (silnik z binaries.prisma.sh zablokowany) -> 423 błędy tsc to SZUM (implicit-any, brak enumów, prisma.* jako never). Zweryfikowano że wszystkie należą do rodzin szumu.
- [x] Znalezione i naprawione PRAWDZIWE błędy:
  - schema: Vote nie miał pola `createdAt` (dodano `createdAt DateTime @default(now())`) - użyte do sortowania zaplanowanych i w state.
  - ParticipantSessionClient: typ payloadu `cast` rozszerzony o `invalid` i `packageChoices` jako tablica {optionId, choice}[] (zgodnie z Package/StandardBallot). showCastToast obsługuje głos nieważny.
  - MeetingPanelClient: usunięto filtr `a.isSubItem` (pole spoza typu agendy w state).
- [x] Zweryfikowano pola/enumy/eventy wszystkich zmian względem schematu: Vote (createdAt, firstVoteFinal), MeetingParticipant (isChairperson), Attendance, VoteRoster, AttendanceCheckEntry, SpeakerListKind.FORMAL_MOTIONS, AuditAction, BroadcastEvent - wszystko pokryte.

## X. Poprawki prezentacji, przewodniczącego, głosowań (duża tura)
- [x] X1. Lista mówców w AUTO: pokazuje się gdy ktokolwiek zgłoszony/przemawia (bez wymogu autoOpenSpeakerList).
- [x] X2. Usunięto tekst "anonimowy i jednorazowy" (tajne) i szary komunikat "głos zapisany... możesz zmienić" nad polami (dublował zielony toast).
- [x] X3. Pakiet: ponowny klik odznacza pozycję (gdy nie głosuje / kliknął przez pomyłkę).
- [x] X4. Przewodniczący: zamyka głosowanie (przycisk wrócił), usuwa z listy mówców, zamyka/otwiera zapisy uczestników.
- [x] X5. Lista mówców: przewodniczący tylko +/-30 (bez wpisywania). Wnioski formalne: pole limitu w SEKUNDACH.
- [x] X6. Auto-odświeżanie: ekran "brak posiedzeń" (SessionAutoRefresh) przy otwarciu; przeładowanie klienta przy zamknięciu posiedzenia.
- [x] X7. Online: TTL 12s + polling operatora co 5s (wykrywa wylogowanie/zamknięcie bez czekania na event).
- [x] X8. Chowanie głosowania z prezentacji: wyniki pokazują się TYLKO gdy operator przypnie ("Pokaż na prezentacji"). "Zamknij i ukryj" odpina na stałe. Usunięto auto-powrót po 15s (isRecent).
- [x] X9. Nazwa + "w dniu ... r." na prezentacji i transmisji (Header, TopBar, DefaultView). PDF-y (lista obecności, raport, migawka, podpis) już miały datę w nagłówku.
- [x] X10. Marginesy kafelków na transmisji: rzędowe kafelki (StatTile stacked) - etykieta nad liczbą, wyśrodkowane, równe niezależnie od długości etykiety.
- [x] X11. Przywrócono toast "Rozpoczęto sprawdzenie obecności" (dotyczy tylko sprawdzenia obecności).
- [x] Audyt tsc: 423 błędy = szum braku Prisma Client; moje pliki czyste, zero nowych prawdziwych błędów.

## Y. Korekta chowania wyników + README
- [x] Y1. Wynik pojawia się AUTOMATYCZNIE po zamknięciu głosowania (close ustawia displayPinnedVoteId = to głosowanie + publish display.changed). Operator nic nie klika - działa jak dotychczas. Zamknięcie głosowania = publikacja wyników.
- [x] Y2. Okno wyników u operatora: jeden przycisk "Zamknij (ukryj z prezentacji)" - odpina (displayPinnedVoteId=null). Kliknięcie tła też chowa. Usunięto "Pokaż na prezentacji".
- [x] Y3. README zaktualizowane: rola przewodniczącego (flaga na posiedzeniu, prowadzi + głosuje), model ekranów, automatyczne pokazywanie/chowanie wyników, NextAuth bez globalnej roli przewodniczącego, MeetingParticipant z flagą.

## Z. Pakiet PDF/prezentacja + regresja list + sortowanie
- [x] REGRESJA NAPRAWIONA: znikające tabele przy dużych głosowaniach. Przyczyna: unbreakable:true w pdfmake pomija blok wyższy niż strona. Teraz unbreakable tylko gdy kluby WŁĄCZONE; bez klubów (jedna wielka lista) pozwalamy naturalne łamanie między stronami. Dotyczy list, pakietów i zwykłych głosowań.
- [x] Nowy wydruk pakietu PDF: per pozycja jak zwykłe głosowanie (nagłówek pozycji, podsumowanie, dwie kolumny nazwisk z markami). Globalne GŁOSOWAŁO/NIE GŁOSOWAŁO/NIEOBECNI w nagłówku gdy wymóg wszystkich pozycji; per pozycja GŁOSOWAŁO...NIEOBECNI gdy bez wymogu. Reguła łamania jak kluby (całość razem; bez klubów przy >40 osób łamiemy listę nazwisk).
- [x] Kluby: lista i pakiet dzielone na kluby tylko gdy groupsEnabled; inaczej jedna zbiorcza lista.
- [x] Prezentacja: kafelki znów w JEDNEJ linii (cofnięto stacked).
- [x] Pakiet na prezentacji: paginacja jak lista (6 pozycji/stronę), przełączanie strzałkami operatora (candidatePage rozszerzone na PACKAGE).
- [x] Kafelek "GŁOSOWAŁO X" pod nazwą głosowania w pakiecie z wymogiem wszystkich pozycji (równej wielkości).
- [x] Pakiet na transmisji: nie używa NameBoard (tablicy imiennej) - zawsze widok pozycji z wynikami cząstkowymi.
- [x] Usunięto wzmiankę o odklikiwaniu w pakiecie u radnego.
- [x] Okno wyników u operatora: ograniczona wysokość + scroll treści, przycisk "Zamknij" jako stała stopka (da się zamknąć przy dużym pakiecie/liście).
- [x] Autosortowanie A-Z opcji listy (polskie znaki) przyciskiem w edytorze głosowania.

## AA. Typografia
- [x] Zamieniono wszystkie – (en dash) i — (em dash) na - (zwykły dywiz) w całym kodzie (107 plików). Zero pozostałych. tsc bez zmian (423 szum), klamry OK.

## BB. Partie 3-4: wyniki operatora + porządek obrad
- [x] #17 "Przyjęto/Odrzucono" przeniesione do linii "Jawne/Tajne - typ - status" (usunięto osobny pill).
- [x] #18 Ujednolicono napis "Głosowanie nr X" (był w dwóch różnych stylach w jednym wierszu).
- [x] #19 Kafelek "GŁOSOWAŁO" w zakończonym pakiecie (StatColumns jak w trwającym).
- [x] #20 Naprawiony move + nowy tryb "Przenieś po..." (select z punktami / na początek).
- [x] #21 Checkbox "bez numeru" w formularzu dodawania (usunięto osobny przycisk); wyłącza pole numeru.
- [x] #22 Cofnięcie pominięcia punktu (reopen obsługuje SKIPPED).
- [x] #23 Przenumerowanie pomija punkty bez numeru.
- [x] #24 Redesign wiersza porządku: nazwa pełna szerokość u góry, przyciski w rzędzie pod spodem (wszystkie widoczne).
- [x] #31 (część) kropki -> "-" w wierszu głosowania operatora.

## CC. Partia 5: prezentacja / przerwa
- [x] #25 Po zamknięciu komunikatu wyników - odpięcie + powrót do AUTO (displayMode:AUTO), koniec pustego ekranu przy mode PINNED_VOTE bez przypiętego głosowania.
- [x] #26 Data "w dniu..." na ekranie Przerwa w obradach.
- [x] #27 Kolor przerwy = kolor posiedzenia także na transmisji (bare).
- [x] #29 Ekran domyślny: przy ręcznej nazwie statyczny rozmiar (bez auto-skalowania / "pływania" fontu).
- [x] #30 Nowe pole Meeting.displayNameOverride - nazwa łamana tylko na prezentacji (nie rusza PDF/CSV/protokołów). Edycja w ustawieniach posiedzenia - do dodania w kolejnej partii.
- [ ] #28 Pełnoekranowy komunikat jak OBS - kolejna partia.

## DD. Partia 6: ustawienia globalne, nazwa łamana, kropki, instrukcja
- [x] #32 Trzy ustawienia globalne (Settings): domyślny licznik oddanych głosów, imienne wyniki jawnych (tablica), indywidualne stanowiska. Stosowane przy tworzeniu posiedzenia; edytowalne w Ustawieniach.
- [x] #30 Edycja Meeting.displayNameOverride w API PATCH (nazwa łamana tylko na prezentacji).
- [x] #31 Wszystkie kropki (middle dot / bullet) zamienione na "-".
- [x] README: nazwa iOBRADY + odnośnik do instrukcji.
- [x] INSTRUKCJA-DEPLOY.md: UNIWERSALNA, od zera, bez danych serwera (dla każdego zainteresowanego).

## EE. Partia 7: radny + nazwy plików + przebudowa wydruku listy (F)
- [x] A Radny wycofuje własny wniosek formalny z kolejki (przycisk Wycofaj).
- [x] B Lista mówców widoczna jako podgląd gdy ma wpisy (przy wnioskach formalnych).
- [x] C "+" przy "Wniosek formalny".
- [x] D Usunięto wstawkę "okno do oddania głosu...".
- [x] E Numer posiedzenia w nazwie pliku PDF i CSV wydruku głosowania.
- [x] F Wydruk listy: tabela tylko dla głosujących; osobna tabela "Niegłosujący i nieobecni" (1-3 kol., ng. przed nb., alfabetycznie, chowana gdy pusta); podsuma "Wynik głosowania" także na dole; próg większości tylko gdy bezwzględna/kwalifikowana (zwykła ukryta); zdanie "Żadnej kandydatury nie poparło: N osób" (odmiana wg liczby, N = przeciw wszystkim).

## FF. Import z tekstu, reasumpcja pakietu, krótkie id
- [x] Import opcji z tekstu (przycisk "Wklej z tekstu") w edytorze listy i pakietu - każda linia = jedna pozycja.
- [x] Reasumpcja kopiuje wszystkie pozycje pakietu (i opcje listy) - naprawiony bug: prefill nie inicjalizował packageItems/options.
- [x] #33 Krótkie id posiedzenia: nanoid, bezpieczny alfabet URL, 16 znaków (max 20). Helper src/lib/ids.ts, nadawane przy tworzeniu posiedzenia. Zostaje jeszcze #28 (komunikat OBS) - czeka na potwierdzenie.

## GG. #28 - komunikat pełnoekranowy w stylu OBS na prezentacji
- [x] Nowy checkbox u operatora: "Na prezentacji pokaż komunikat w stylu transmisji (kolorowe tło)".
- [x] Gdy włączony: MessageView renderuje styl OBS (kolorowe tło, logo, organizacja, duży tekst) + nazwa posiedzenia z datą.
- [x] W tym trybie górny pasek (TopBar) znika; zostaje sam zegar w prawym górnym rogu.
- [x] Schemat: Settings/Meeting.displayMessageObsStyle (default false). API display PATCH + state + display API zwracają flagę.

## HH. Partia A: naprawy krytyczne + panel operatora
- [x] nb/ng: zabezpieczenie gdy migawka rostera pusta -> obecność z attendance.status (PDF+CSV).
- [x] Podwójne "Wynik głosowania" - usunięty duplikat nagłówka.
- [x] Zakończenie posiedzenia: blokada gdy trwa głosowanie + zakończenie otwartych punktów (CURRENT->COMPLETED).
- [x] Status głosowania (pakiet/lista/kworum) przeniesiony do linii "Jawne/Tajne - typ - status".
- [x] Globalna ochrona przed podwójnym "w dniu" (helper withDateText w 6 miejscach: raporty, listy/raporty obecności, protokoły).
- [x] Ad hoc: kontekst z datą; punkt bez numeru "- tytuł" zamiast "Pkt .".
- [x] Usunięto kafelki "Uczestnicy ogółem" i "Bez prawa głosu"; uczestnik = z prawem głosu. Listy obecności już tylko uprawnieni.
- [x] Redesign porządku obrad w PANELU POSIEDZENIA (nazwa pełna szerokość u góry, przyciski pod spodem).

## II. Partia B: pakiet z klubami, tajna lista, komunikat, strzałki
- [x] Wydruk pakietu obsługuje kluby (nazwiska pod pozycją grupowane po klubach gdy groupsEnabled).
- [x] Migawka klubu przy otwarciu głosowania (clubShort z chwili otwarcia - potwierdzone).
- [x] Tajna lista w układzie jak jawna: obecni w blokach klubów (ob.), osobna tabela "Nieobecni", podsuma "Wynik głosowania".
- [x] Komunikat OBS na prezentacji: nazwa posiedzenia u góry, treść komunikatu POD nią (na kolorowym tle).
- [x] Strzałki przełączania stron dodane wprost do okna wyników (lista/pakiet), bo panel bywa zasłonięty.

## JJ. Partia C: modal wklejania, hurtowa zmiana klubu, generator odcinków
- [x] Modal wklejania pozycji (textarea + licznik) zamiast window.prompt - lista i pakiet.
- [x] Hurtowa zmiana klubu: dropdown "Przypisz do grupy" przy zaznaczonych kontach + endpoint /api/users/bulk-group.
- [x] Generator PDF odcinków logowania (imię, login=email, hasło, adres logowania, QR z adresem):
    - po imporcie CSV: przycisk "Odcinki logowania (PDF)" dla świeżo utworzonych (świeże hasła z importu),
    - na żądanie dla zaznaczonych: "Odcinki logowania" -> reset haseł (/api/users/reset-passwords) + PDF.
    - qrcode + @types/qrcode dodane; fonty Lato jak reszta.

## KK. Skróty klawiszowe (radny + operator)
Hook: src/lib/useHotkeys.ts (bezpieczny - nie działa w polach tekstowych, ignoruje Ctrl/Meta/Alt, aria-keyshortcuts).
RADNY:
- Głosowanie zwykłe: Z=za, P=przeciw, W=wstrzymuję się (auto-wysyłka), N=nieważny (tajne).
- Kworum: O lub Enter = potwierdź obecność.
- Sprawdzenie obecności: O lub Enter = potwierdź.
- Lista: 1-9 zaznacz/odznacz kandydata, Enter wyślij.
- Pakiet: strzałki gora/dol wybór pozycji, Z/P/W głos aktywnej pozycji (i przejście dalej), Enter wyślij.
- Lista mówców: D=dyskusja (zgłoś/wycofaj), Shift+D=priorytet, A=ad vocem, F=wniosek formalny na liście mówców.
- Duży czerwony przycisk: Shift+F=wniosek formalny do prowadzącego (rozróżnienie od F).
OPERATOR:
- G=udziel głosu następnemu, K lub Spacja=zakończ wypowiedź, +/- = +/-30 s.
- C=zamknij trwające głosowanie (potwierdzenie), Esc=zamknij okno wyników + powrót do AUTO,
  A=prezentacja do AUTO, R=zakończ bieżący punkt (potwierdzenie).
Bezpieczeństwo: destrukcyjne akcje operatora (zamknięcie głosowania, zakończenie punktu) z window.confirm.

## LL. Poprawki skrótów + model listy "sejmowej"
- [x] Duży czerwony wniosek formalny: jednoklawiszowe F (było Shift+F). Lista mówców wniosek: Shift+F.
- [x] Głos nieważny (tajne) na O (wspólnie z kworum/obecnością - wszystkie potwierdzenia obecności = O).
- [x] Operator: N - otwórz następny punkt (pierwszy PENDING).
- [x] Operator wnioski formalne: B - udziel głosu, K/Spacja - zakończ (wspólne z listą mówców).
- [x] Głosowanie na listę - model "sejmowy" (rozwiązuje >9 kandydatów): nawigacja strzałkami po aktywnej
      pozycji, Z lub + = ZA dla aktywnej, - = kasuj, Enter = zatwierdź. Cyfry 1-9 nadal jako skrót dla krótkich list.
      Aktywna pozycja podświetlona (wyświetlacz).

## MM. Widok mini (wyświetlacz) - dokończenie + nowy ekran domyślny prezentacji
- [x] Route /session/mini renderujący MiniDisplayClient, z kontrolą uprawnienia canUseMiniDisplay i otwartego posiedzenia.
- [x] Uprawnienie canUseMiniDisplay w schemacie (MeetingParticipant) + endpoint meeting-participants PATCH.
- [x] Przełącznik "Wyświetlacz" w tabeli uczestników posiedzenia (operator włącza wybranym osobom).
- [x] Link "Otwórz wyświetlacz" w panelu sesji dla uprawnionego uczestnika.
- [x] API me/session zwraca canUseMiniDisplay, myFirstName, myLastName.
- [x] Widok mini: pełne wąskie okno, jednolite tło, imię i nazwisko u góry (zamiast legitymacji) + zegar,
      głosowanie zawsze najwyższy priorytet, bez pełnej nazwy głosowania, nazwa posiedzenia na dole.
- [x] NOWY EKRAN DOMYŚLNY PREZENTACJI: herb + nazwa organu KAPITALIKAMI + nazwa posiedzenia (część zasadnicza);
      nagłówek na tym ekranie pokazuje tylko zegar (bez powielania logo/organizacji/nazwy).

## NN. Duża seria poprawek (22 punkty)
Skróty: usunięte widoczne podpowiedzi/nawiasy (tylko wybrani znają); hook naprawiony (znaki z Shift jak "+"); pakiet ma O na wysyłkę.
Mini: przepisany na realny panel głosowania (VoteBallot) - można głosować z wyświetlacza, lista i skróty działają, kandydaci widoczni; przycisk wyjścia (X); zIndex 9999 (nagłówek nie zasłania); bez wyniku ostatniego głosowania.
Prezentacja: nazwa na ekranie domyślnym STAŁA wielkość (bez animacji FitText); stała wysokość nagłówka (88px); komunikat OBS bez marginesu; pakiet w trakcie nie pokazuje pozycji (jak lista, tablica dla jawnych); strzałki usunięte z panelu prezentacji (są w oknie wyników).
PDF: poprawna odmiana "nie poparły N osób"; kluby w pakiecie mają podsumę (ZA/PRZECIW/WSTRZYM per klub).
Operator: czas wniosku formalnego w SEKUNDACH (był w minutach); online sortowane po NAZWISKU; większa czcionka w polu wyboru wniosków; nazwa punktu (mniejsza) nad nazwą głosowania u radnego.
Odcinki: font Lato zamiast Roboto (przyczyna niegenerowania).
Ustawienia domyślne: auto-otwieranie listy mówców = true, po zamknięciu tylko podsuma = true (schemat @default). Zapisz przeniesiony na dół (po porządku w autoprezentacji); checkboxy zapisują się automatycznie.
Schemat: MeetingParticipant.canUseMiniDisplay; Meeting.displaySummaryAfterClose/autoOpenSpeakerList @default zmienione na true.

## OO. Duża przebudowa - Faza 0: fundament CSS (Bootstrap)
- [x] Dodano `bootstrap` + `sass` (dev). Motyw `src/styles/_bs-theme.scss` zmapowany na
      istniejącą paletę (--color-ink jako $primary, --color-yes/no/abstain, bez cieni/gradientów -
      celowo NIE domyślny niebieski Bootstrapa).
      `src/styles/bootstrap-scoped.scss` kompilowany skryptem `npm run build:bootstrap` (wpięty
      przed `prisma generate && next build` w skrypcie `build`) do `src/app/bootstrap-scoped.css`
      (plik generowany, w .gitignore).
- [x] CSS Bootstrapa zaimportowany WYŁĄCZNIE w layoutach: `(operator)/layout.tsx` oraz nowych
      `login/layout.tsx`, `account/layout.tsx`, `chairperson/layout.tsx`. Next.js dołącza CSS
      zaimportowany w layoucie tylko do jego drzewa tras - zweryfikowano w
      `.next/app-build-manifest.json`, że arkusz Bootstrapa NIE trafia do `/session`, `/display`,
      `/overlay` (karty głosowania, prezentacja, transmisja - bez zmian).
- [x] Zaokrąglenie `.card`/`.card-soft`/`.btn`/`.input` w `globals.css` z 2px na 6px (zgodne z
      domyślnym zaokrągleniem Bootstrapa) - jedyna celowa zmiana dotycząca też kart głosowania.
- [x] `package.json`: `"name"` z "esog" na "iobrady".
- [~] Dalsze kroki: przejście komponentów panelu operatora (i opcjonalnie logowania/konta/
      przewodniczącego) na klasy Bootstrapa - w kolejnych partiach.
- [x] Logo organizacji w nagłówku operatora i radnego (wysokość 40px, ustawialne w Ustawieniach -
      `Settings.presentationLogoUrl`, dotychczas widoczne tylko na prezentacji/transmisji).
- [x] U radnego: nazwa organizacji kapitalikami obok herbu, wyśrodkowana w pionie względem niego
      (flex items-center), ukryta na telefonie (`hidden sm:inline`) - logo zostaje widoczne.

## PP. Duża przebudowa - Faza 1: fonty prezentacji/transmisji
- [x] Dodano Fira Sans, Plus Jakarta Sans, Atkinson Hyperlegible (+ nowsza "Atkinson Hyperlegible
      Next" jako podstawowa, oryginalna jako fallback), IBM Plex Sans do `fontStack()` w
      `DisplayClient.tsx` i `OverlayClient.tsx`, do linków Google Fonts w `display/layout.tsx` i
      `overlay/layout.tsx` oraz do selektorów czcionki prezentacji/transmisji w `SettingsForm.tsx`.

## QQ. Duża przebudowa - Faza 2: log logowań zamiast rejestru czynności
- [x] Nowy model `LoginEvent` (userId, role, at) w schemacie - dodatkowy, bezpieczny (bez utraty
      danych przy `db push`).
- [x] Zapis w `src/lib/auth.ts` w `authorize()` po udanej weryfikacji hasła (`try/catch`
      nieblokujący logowania).
- [x] Nowa strona `/login-log` (lista + CSV) zastępująca `/audit` w nawigacji operatora i w
      `middleware.ts`.
- [x] Usunięto TYLKO interfejs: `src/app/(operator)/audit/page.tsx`,
      `src/app/api/audit/csv/route.ts`. Model `AuditLog` i wszystkie wywołania `audit(...)` w
      API zostają bez zmian, nadal piszą w tle.

## RR. Duża przebudowa - Faza 3: przebudowa protokołu PDF/DOCX
- [x] Usunięto widok HTML do druku (`MeetingProtocolView.tsx` + `meetings/[id]/protocol/page.tsx`
      + link "Protokół posiedzenia" w panelu). Jedyny protokół to eksport PDF/DOCX
      (`generateProtocol.ts` + `protocol-data/route.ts`).
- [x] Dodano godziny otwarcia/zamknięcia posiedzenia (`Meeting.openedAt/closedAt`) i każdego
      punktu (`AgendaItem.startedAt/completedAt`).
- [x] Dodano listę obecności (obecni/nieobecni, z klubem gdy włączone) PRZED porządkiem obrad.
- [x] Wyniki imienne dla WSZYSTKICH głosowań, także LIST i PACKAGE - per kandydat/pozycja
      (kto był za/przeciw przy każdej pozycji z osobna), nie tylko zbiorcze liczby.
- [x] Wnioski formalne i głosowania ad hoc umieszczane chronologicznie w obrębie punktu, który
      przerwały (dopasowanie po czasie do okna `startedAt..completedAt` punktu), albo - jeśli nie
      mieszczą się w żadnym punkcie - w sekcji "Poza porządkiem obrad" wstawionej we właściwym
      miejscu dokumentu (nie zawsze na końcu), wyznaczonym przez moment wystąpienia względem
      startu kolejnych punktów.
- [x] Typ wystąpienia pokazywany, gdy inny niż zwykłe ("(ad vocem)"); wnioski formalne - osobna
      linia "Wniosek formalny: ...".
- [x] Usunięto nagłówek "Protokół z posiedzenia" (zostaje sama nazwa posiedzenia z datą);
      "Porządek obrad" (wariant bez głosowań) bez zmian.
- [x] "Lista imienna" -> "Wyniki imienne" (PDF i DOCX).

## SS. Duża przebudowa - Faza 4: nowy "Raport wystąpień" PDF/DOCX
- [x] Nowy plik `src/lib/generateSpeechesReport.ts` + endpoint
      `api/meetings/[id]/speeches-report`. Wystąpienia pogrupowane wg punktów, w kolejności
      zabrania głosu: nazwisko i imię, typ (zwykłe/ad vocem/wniosek formalny), początek, koniec,
      czas trwania, limit. Ta sama zasada dopasowania chronologicznego co w protokole (Faza 3) -
      wniosek formalny przerywający punkt trafia w jego obręb, reszta - "poza porządkiem obrad"
      we właściwym miejscu chronologicznie.
      Przyciski eksportu (PDF/DOCX) obok eksportu protokołu w panelu posiedzenia.

## TT. Duża przebudowa - Faza 5: drobniejsze usprawnienia
- [x] 5a. Nowy endpoint `votes/bulk-by-agenda` - po jednym głosowaniu (zwykłe/kworum) na każdy
      zaznaczony punkt porządku, z nazwą = tytuł punktu. `BulkImportModal` dostał przełącznik
      trybu "Import z tekstu" / "Dla wybranych punktów" (checkboxy punktów zamiast pojedynczego
      selecta).
- [x] 5b. Lista do podpisu: czcionka tabeli 12pt -> 11pt (`FS_TABLE` w `generatePdf.ts`), wysokość
      wiersza bez zmian; nagłówek tabeli wyśrodkowany w pionie w swoim 24-punktowym wierszu
      (przeliczany margines wg wzoru zamiast sztywnej wartości dobranej pod stary rozmiar fontu).
- [x] 5c. Skonsolidowano dwie prawie identyczne implementacje generatora haseł do
      `src/lib/randomPassword.ts` (wariant `crypto.getRandomValues`). `POST /api/users` przyjmuje
      `autoGenerate` - hasło generowane po stronie serwera i zwracane w odpowiedzi. W formularzu
      nowego konta: checkbox "Wygeneruj hasło" (blokuje pole hasła); po utworzeniu automatycznie
      pobiera się PDF z odcinkiem logowania (ten sam mechanizm co przy imporcie/resecie haseł).

## UU. Duża przebudowa - Faza 6: uniezależnienie od serwera + kreator instalacji
- [x] Wyczyszczono twarde odniesienia: `Caddyfile` (domena -> `{$DOMAIN:localhost}`, placeholder
      Caddy), `docker-compose.yml` (`NEXTAUTH_URL` domyślnie `http://localhost:3000` zamiast
      realnej domeny; `esog`->`iobrady` w domyślnych nazwach DB/usera; `TZ`/`DOMAIN` jako zmienne;
      nazwy wolumenów Dockera CELOWO zostają `esog_*` - zmiana zgubiłaby dane istniejących
      instalacji), `.env.example`, `prisma/seed.ts`, `clean-seed.sql`, `docs/OPERATOR.md`,
      `reset-data.sql` (esog/eSOG -> iobrady/iOBRADY/example.local). Notatki wewnętrzne z
      prawdziwym IP/ścieżką serwera to dokumenty wewnętrzne - nie wchodzą do publicznej
      dystrybucji (kwestia pakowania, nie kodu).
- [x] Kreator pierwszego uruchomienia (`/setup`): nowe pole `Settings.setupComplete`
      (domyślnie false). Strona `src/app/setup/page.tsx` + `SetupWizardClient.tsx` (nazwa
      organizacji, logo, dane pierwszego konta operatora) + `api/setup` (tworzy operatora,
      zapisuje ustawienia, `setupComplete=true`) + `api/setup/logo` (oba samo-wyłączają się po
      ukończeniu). Eliminuje wymóg ręcznego ustawiania `SEED_OPERATOR_EMAIL`/`_PASSWORD`/
      `INIT_SEED` przed pierwszym uruchomieniem (te zmienne zostają jako opcjonalna, zapasowa
      ścieżka dla wdrożeń automatycznych).
- [x] Bramka `requireSetupComplete()` (`src/lib/setup.ts`) wywoływana z layoutów
      (login/account/chairperson/operator/participant) - przekierowuje na `/setup`, dopóki
      konfiguracja nie jest ukończona. Middleware (Edge) NIE sprawdza tego bezpośrednio - brak
      dostępu do Prisma w Edge runtime; próba włączenia eksperymentalnej flagi `nodeMiddleware`
      okazała się niestabilna w Next 15.5 (ostrzeżenie + błąd typów) - odrzucona na rzecz
      sprawdzenia w poszczególnych layoutach (zwykły Node.js runtime, tak jak reszta aplikacji).
      Layouty bez własnego wcześniejszego `auth()` dostały `export const dynamic =
      "force-dynamic"`, żeby Next nie próbował ich statycznie prerenderować (Prisma bez
      DATABASE_URL w trakcie builda wysypywało build - naprawione).
- [x] `INSTRUKCJA-DEPLOY.md` zaktualizowana pod kreator (Krok 3 bez danych operatora w `.env`,
      Krok 5 opisuje `/setup` zamiast ręcznego zakładania konta).

# Część 2: materiały, dostęp radnego, notatki, e-mail, widok publiczny

## VV. Faza 7: model danych
- [x] Nowe modele: `Attachment` (materiał posiedzenia/punktu, flagi widoczności dla
      radnych/publicznie), `AgendaItemNote` (prywatna notatka radnego, unikalna per
      punkt+użytkownik), `EmailLog` (dziennik wysłanych e-maili). `Meeting.publicEnabled`
      (domyślnie false). `Settings`: `defaultMaterialsVisibleToParticipants`,
      `defaultMaterialsPublic`, pełna konfiguracja SMTP (`smtpHost/Port/Secure/User/Password/From`
      - hasło świadomie w bazie, nie w env). `AuditAction`: `EMAIL_SENT`,
      `ATTACHMENT_UPLOADED`, `ATTACHMENT_DELETED`.

## WW. Faza 8: materiały/załączniki
- [x] Pliki przechowywane POZA `public/` (`storage/attachments/`, nowy `src/lib/attachments.ts`)
      - Next.js nie serwuje ich statycznie, jedyny dostęp to autoryzowany endpoint. Whitelist
      PDF/DOCX/XLSX/PNG/JPG/WEBP, limit 20 MB, nazwa na dysku losowa (`crypto.randomUUID()`).
- [x] `src/lib/participantAccess.ts` - `getMeetingParticipant()`, reużywany helper dostępu.
- [x] Endpointy: `POST/GET /api/meetings/[id]/attachments` (operator - upload/lista),
      `PATCH/DELETE /api/attachments/[id]` (widoczność/usunięcie), `GET
      /api/attachments/[id]/download` (kontrola dostępu: operator zawsze; radny - tylko jeśli ma
      `MeetingParticipant` I `visibleToParticipants`; bez sesji - tylko jeśli
      `meeting.publicEnabled` I `visibleToPublic`; w innym wypadku 404 bez ujawniania przyczyny).
- [x] `AttachmentsManager.tsx` (nowy, reużywalny) - lista/upload/toggle widoczności/usuwanie.
      Wpięty w `AgendaEditorClient.tsx` (przycisk "Materiały" per punkt) i `MeetingPanelClient.tsx`
      (karta "Materiały posiedzenia", załączniki całego posiedzenia).
- [x] `docker-compose.yml` - nowy wolumen `iobrady_attachments:/app/storage/attachments`
      (przetrwa redeploy, tak jak `esog_uploads`).

## XX. Faza 9+10: archiwum/nadchodzące radnego, notatki prywatne, wyniki imienne
- [x] Trasy radnego: `/session/archive` (lista, scoped po istnieniu `MeetingParticipant` -
      **bez filtra po `excludedFromMeeting`**, wykluczenie nie ukrywa historii), `/session/archive/
      [meetingId]` (porządek, materiały widoczne dla radnych, głosowania z przyciskiem "Wyniki"),
      `/session/upcoming` + `/session/upcoming/[meetingId]` (analogicznie, bez głosowań - jeszcze
      się nie odbyły). **Uwaga:** trasy NIE mogą nazywać się `/archive`/`/upcoming` wprost - to by
      kolidowało z istniejącą stroną operatora `(operator)/archive` pod tym samym URL-em (Next.js
      nie pozwala na dwie różne strony pod tą samą ścieżką) - stąd zagnieżdżenie pod `/session/`.
  - `src/lib/participantAccess.ts` - `getMeetingParticipant()`, reużywany helper dostępu.
  - Link "Pełny porządek obrad, materiały i wyniki głosowań" w `ParticipantSessionClient.tsx`
    (widok BIEŻĄCEGO posiedzenia) prowadzi do TEJ SAMEJ strony `/session/archive/[meetingId]` -
    działa identycznie dla posiedzenia w toku i zakończonego (dostęp sprawdzany wyłącznie po
    `MeetingParticipant`, nie po statusie posiedzenia).
- [x] Notatki prywatne: model `AgendaItemNote` (Faza 7), `GET/PUT /api/agenda/[id]/note` -
      zawsze scoped do `session.user.id` z sesji (nigdy z parametru requestu - nie da się
      odczytać/nadpisać cudzej notatki). Komponent `MyAgendaItemNote.tsx` (zwijany, zapis z
      debounce 600ms) użyty w widoku archiwum/bieżącym.
- [x] Wyniki imienne dla radnego - nowy `GET /api/votes/[id]/participant-report` (autoryzacja:
      operator zawsze, radny tylko z `MeetingParticipant` na posiedzeniu głosowania) zwraca
      `buildVoteReportData()` **bez zmian** - ta funkcja już samodzielnie chroni tajność (dla
      `isSecret` per-osoba ma tylko obecność, nigdy treść głosu). Nowy komponent
      `VoteResultsView.tsx` - kolorowa oprawa (kafelki `.stat` w kolorach za/przeciw/wstrzym.,
      wyniki imienne pogrupowane po klubach), otwierany jako KOMUNIKAT/modal (nie link) po
      kliknięciu "Wyniki" przy głosowaniu. Dla `isSecret` pokazuje tylko liczby zbiorcze
      (+ ew. listę obecnych przy kworum) z wyraźnym oznaczeniem "Głosowanie tajne", bez
      wyników imiennych.

## YY. Faza 11: moduł e-mail (SMTP)
- [x] `nodemailer` + `@types/nodemailer`. `src/lib/mail.ts` - `sendMail()` buduje transport NA
      ŻĄDANIE z bieżącej `Settings` (działa od razu po zmianie w UI), zawsze zapisuje `EmailLog`
      + `audit("EMAIL_SENT")` niezależnie od wyniku. `src/lib/mailTemplates.ts` - szablony
      powitalny/reset hasła/ogólny (posiedzenie + opcjonalny link publiczny).
- [x] Ustawienia: sekcja SMTP (host/port/TLS/user/hasło/nadawca) w `SettingsForm.tsx` +
      `api/settings/route.ts` (zod) + `api/settings/test-email` (wysyła testowy e-mail na adres
      zalogowanego operatora).
- [x] Hooki opt-in (operator decyduje za każdym razem): `POST /api/users` (`sendEmail`) - e-mail
      powitalny po utworzeniu konta; `POST /api/users/import` (`sendEmails`) - powitalny per
      utworzony wiersz; `POST /api/users/reset-passwords` (`sendEmails`, pytanie `window.confirm`
      przy hurtowym resecie) - e-mail z nowym hasłem. Checkboxy w `UserModal` i modalu importu CSV.
- [x] E-mail ad hoc: `POST /api/meetings/[id]/email` (wybór odbiorców z uczestników posiedzenia,
      temat, treść, opcjonalny link do widoku publicznego) - nowy przycisk "Wyślij e-mail do
      uczestników" + modal w `MeetingPanelClient.tsx`. `POST /api/email/send` (dowolni odbiorcy,
      niezwiązane z posiedzeniem) - przycisk "Wyślij e-mail" przy zaznaczonych kontach w
      `ParticipantsManagerClient.tsx`.

## ZZ. Faza 12: widok publiczny posiedzenia
- [x] `Meeting.publicEnabled` (Faza 7) - przełącznik w `MeetingSettingsPanel.tsx` (domyślnie
      wyłączony, operator włącza świadomie per posiedzenie), PATCH przez istniejący
      `api/meetings/[id]/route.ts`.
- [x] Nowa publiczna trasa `src/app/public/[meetingId]/page.tsx` (dodana do listy publicznych
      ścieżek w `src/middleware.ts`) - bez logowania. `meeting.publicEnabled !== true` -> 404
      (nie zdradza, czy posiedzenie istnieje).
- [x] Układ: nagłówek z logo/herbem, nazwą organu i nazwą posiedzenia (jak ekran domyślny
      prezentacji), poniżej materiały ogólne posiedzenia i pełny porządek obrad - przy każdym
      punkcie podpięte materiały publiczne ORAZ wyniki zakończonych w nim głosowań, renderowane
      OD RAZU w treści strony (nie jako osobny link/zakładka). Dla głosowań jawnych - pełne
      wyniki imienne (to znaczy "jawne"); dla tajnych - tylko wynik zbiorczy, tak jak w Fazie 10.
      Nowy komponent `PublicVoteResult.tsx` (wariant `VoteResultsView` bez fetchowania/modala -
      dane liczone server-side przez `buildVoteReportData()` wprost na stronie).
- [x] Wysyłka linku mailem: opcja "Dołącz link do widoku publicznego" w modalu e-maila
      posiedzenia (Faza 11) - działa tylko gdy `meeting.publicEnabled`.

## AAB. Bootstrap - pierwsza tura przemalowania paneli operatora
- [x] `(operator)/layout.tsx` - pasek nawigacji przepisany na `navbar` Bootstrapa.
- [x] `(operator)/dashboard/page.tsx`, `archive/page.tsx`, `login-log/page.tsx` - pełne przejście
      na siatkę/komponenty Bootstrapa (`container`, `row`/`col`, `card`+`card-body`, `table`,
      `list-group`, `badge`).
- [x] `SettingsForm.tsx`, `GuestsManagerClient.tsx`, `TemplatesManagerClient.tsx` - pola
      formularzy (`.input`→`form-control`, `.label`→`form-label`); reszta układu (siatka,
      odstępy) zostaje na Tailwindzie - działa równolegle z Bootstrapem bez konfliktu, bo to inne
      nazwy klas.
- [ ] **Pozostało (świadomie odłożone, duży zakres):** `MeetingPanelClient.tsx` (~2700 linii -
      główny "pokój sterowania" posiedzeniem), `ParticipantsManagerClient.tsx`,
      `AgendaEditorClient.tsx`, `SpeakersPanel.tsx`, `FormalMotionsPanel.tsx`,
      `DisplayControlPanel.tsx`, `AttendanceCheckPanel.tsx`, `MeetingParticipantsClient.tsx`,
      `VoteReport.tsx`, strony `meetings/`, `votes/[id]/report`.
      Zasada `.btn`/`.card` (te same nazwy w obu systemach, Bootstrap ładowany później więc
      wygrywa w kaskadzie) już częściowo "przemalowuje" te ekrany bez zmian w kodzie - ale
      `.input`/`.label`/`.pill`/`.eyebrow` tam zostają w starym stylu, dopóki nie przejdą tej
      samej konwersji.

## AAC. Bootstrap - druga tura (małe, izolowane komponenty operatora)
- [x] `MeetingSettingsPanel.tsx` - pełne przejście na `card`/`card-header`/`card-body`,
      `form-label`, `form-select`, `form-control`, `form-check` (z parowanymi `id`/`htmlFor`),
      przyciski trybu prezentacji na `btn-primary`/`btn-outline-secondary`.
- [x] `RecomputeMajority.tsx` - owinięty w `card`/`card-body`, `.label`→`form-label`, oba
      selecty→`form-select`, opis→`form-text`.
- [x] `DiscussionClockPanel.tsx` - `card-header`/`card-body`, przełącznik włączenia→
      `form-check form-switch` (`role="switch"`), `.label`→`form-label`, selecty→`form-select`,
      siatka trybu/zakresu→`row g-3`/`col-6`, przyciski→`btn-outline-secondary`/
      `btn-outline-danger btn-sm`; zagnieżdżony `ClubRow` również skonwertowany
      (`form-control form-control-sm`, `btn-outline-secondary btn-sm`).
- [x] `PrintButton.tsx` - sprawdzony, bez zmian: jedyny interaktywny element to
      `<button className="btn btn-primary">`, który już renderuje się jako Bootstrap dzięki
      kaskadzie; reszta pliku to logika generowania PDF (pdfmake), bez `.input`/`.label`/`.card`.
- [x] `AttendanceCheckPanel.tsx`, `MeetingParticipantsClient.tsx`, `FormalMotionsPanel.tsx` -
      pola `.input`→`form-control`/`form-select`; reszta układu (siatka, checkboxy w etykietach
      `flex items-center gap-2`, kolorowe `.pill` z niestandardową logiką aktywności) zostawiona
      bez zmian - konwersja skomplikowałaby istniejący układ bez korzyści wizualnej, zgodnie z
      zasadą "nie zmieniać checkboxów/`.pill`, gdy to komplikuje układ".
- [x] `AgendaEditorClient.tsx`, `DisplayControlPanel.tsx`, `SpeakersPanel.tsx` - pola
      `.input`/`.label`→`form-control`/`form-select`/`form-label` (selecty przenoszenia punktu,
      pola edytora punktu, textarea komunikatu i przerwy, limity czasu mówców, selecty dodawania
      mówcy/gościa). `VoteReport.tsx` sprawdzony - celowo bez zmian: komponent jest w całości
      czarno-biały i drukowalny (inline style, zero klas `.input`/`.label`/`.card`), zgodnie z
      zastrzeżeniem w planie o zachowaniu wyglądu wydruku.
- [x] `ParticipantsManagerClient.tsx` - wszystkie pola `.input`→`form-control` (w tym warianty
      `.input mono`), selecty (rola, klub, hurtowe przypisanie do grupy)→`form-select`,
      `.label`→`form-label` we wszystkich modalach (nowy/edycja uczestnika, grupa, e-mail do
      zaznaczonych, import CSV).
- [x] Cienkie wrappery stron: `meetings/page.tsx` - tabela na `table table-hover`/`table-light`,
      status na `badge text-bg-light border`; `meetings/new/page.tsx` - pełen formularz na
      `form-control`/`form-select`/`form-label`. `meetings/[id]/participants/page.tsx`,
      `meetings/[id]/agenda/page.tsx`, `votes/[id]/report/page.tsx`, `participants/page.tsx`,
      `guests/page.tsx`, `templates/page.tsx` sprawdzone - to same server-side pobieranie danych
      i przekazanie do już przekonwertowanych komponentów klienckich, bez własnych klas do
      zmiany.
- [x] `MeetingPanelClient.tsx` (2739 l.) - ostatni, największy plik. Wszystkie pola `.input`
      (33 wystąpienia, w tym w modalach: tworzenie/edycja głosowania ad hoc, hurtowe głosowania
      wg punktów, edycja posiedzenia, korekta większości, dopisanie do listy mówców/wniosków,
      e-mail do uczestników) → `form-control`, a `<select>` z `className="input"` (13 selectów)
      → `form-select`; `.label` (27 wystąpień) → `form-label`. Konwersja w pełni mechaniczna
      (bez zmian układu/JSX) - to kończy przemalowanie panelu operatora na Bootstrap zapoczątkowane
      w Fazie 0 (patrz sekcje AAB-AAC).

## AAD. Korekta wizualna po pierwszej ocenie na produkcji - bez zmian układu
- Po wdrożeniu na produkcję użytkownik ocenił efekt jako "rozjechany, chaotyczny": niespójne
  odstępy między wizualnie identycznymi nagłówkami sekcji i zbyt mocno zaokrąglone `.pill`
  (999px) obok kart/przycisków (`.375rem`/6px). Diagnoza: część paneli buduje nagłówek karty
  jako zwykły `<div className="eyebrow">`, część jako `<h2>/<h3> className="eyebrow">` -
  Bootstrap narzuca własny `margin-bottom`/`line-height` na prawdziwe tagi `<h1>-<h6>`
  niezależnie od klasy `.eyebrow`, więc te same wizualnie nagłówki miały różne odstępy zależnie
  od użytego tagu. Poprawka **celowo nie rusza układu/JSX żadnego komponentu** - dwie punktowe
  zmiany CSS:
  - [x] `src/styles/bootstrap-scoped.scss` - dopisana reguła `h2.eyebrow, h3.eyebrow { margin:0;
        line-height:1.4; }` po imporcie Bootstrapa (wyższa specyficzność niż goły `h2`/`h3` z
        reboot Bootstrapa, więc wygrywa niezależnie od kolejności ładowania arkuszy).
  - [x] `src/app/globals.css` - `.pill { border-radius: 999px }` → `6px`, czyli dokładnie ta
        sama wartość co `.card`/`.btn`/`.input` w tym samym pliku i `$border-radius` w motywie
        Bootstrapa - koniec z pełnymi "pigułkami" bez zmiany ani jednego miejsca użycia `.pill`
        w komponentach.
  - Realne Bootstrapowe `.badge` (dashboard/archive/login-log/meetings) już miały poprawny,
    nie-pigułkowy promień - `$border-radius` nie był nadpisywany dla badge, więc nie wymagały
    zmian.

## AAE. Prawdziwy rdzeń problemu: CSS Cascade Layers (Tailwind vs Bootstrap) - naprawa wzorem sprawdzonej aplikacji
- Poprawka AAD nie wystarczyła (użytkownik pokazał zrzut ekranu na żywo - "WNIOSKI FORMALNE"
  nadal renderował się jako olbrzymi czerwony nagłówek, `.pill` nadal w pełni zaokrąglone).
  Prawdziwa przyczyna: `globals.css` (Tailwind v4, `@import "tailwindcss"`) owija własne klasy
  (`.eyebrow`, `.pill`, `.card`, `.btn`...) w `@layer components`, a skompilowany Bootstrap
  (`bootstrap-scoped.css`) jest w całości UNLAYERED (poza jakimkolwiek `@layer`). Wg specyfikacji
  CSS Cascade Layers reguły spoza jakiegokolwiek layera ZAWSZE wygrywają z regułami
  layerowanymi - niezależnie od specyficzności selektora i kolejności w dokumencie. Dlatego
  Bootstrapowy, goły `h2,h3{font-size:1.75rem/1.5rem}` (unlayered, tag) bezwarunkowo wygrywał z
  layerowanym `.eyebrow{font-size:10px}` (klasa) z `globals.css`, mimo wyższej specyficzności
  klasy - stąd olbrzymie nagłówki wszędzie tam, gdzie `.eyebrow` trafiał na prawdziwy tag
  `<h2>/<h3>`. Poprzednia poprawka AAD nadpisywała tylko margines/line-height, nie font-size.
- Zdiagnozowane i naprawione wzorem architektury z `jan-niemczyk/systemglosowanobiegowych`
  (druga aplikacja tego zespołu, gdzie motyw Bootstrapa jest jedynym systemem CSS - bez
  Tailwinda w tle, więc bez konfliktu layerów):
  - [x] `src/styles/bootstrap-scoped.scss` - `.eyebrow` przeniesiony z layerowanej definicji
        w `globals.css` na PEŁNĄ, samodzielną, unlayered definicję w tym pliku (po imporcie
        Bootstrapa) - font-size/waga/margines/line-height w jednym miejscu, bezwarunkowo
        wygrywa z Bootstrapem niezależnie od tagu. `globals.css` zachowuje swoją (layerowaną)
        wersję `.eyebrow` bez zmian - nadal poprawnie działa na kartach głosowania/prezentacji,
        które nie ładują Bootstrapa.
  - [x] Dopisana `.badge-live` (pulsująca kropka, wzorem `.pill-live::before` - jedyna rzecz,
        której Bootstrapowy `.badge` nie ma gotowej) oraz `.card { box-shadow: $box-shadow-sm; }`
        (delikatny cień na wszystkich kartach operatora - jedno dopisanie do własnej reguły
        Bootstrapa, bez zmiany choćby jednego pliku komponentu).
  - [x] `src/styles/_bs-theme.scss` - włączone stonowane cienie (`$box-shadow-sm/$box-shadow/
        $box-shadow-lg`, wartości 1:1 z `systemglosowanobiegowych`) zamiast całkowitego
        wyłączenia (`$enable-shadows:false` usunięte) - "miększy" wygląd zamiast płaskich,
        surowych bloków; nieco hojniejszy `$card-spacer-y/x` (1.1rem).
  - [x] Wszystkie pozostałe użycia `.pill*` w panelu operatora zamienione na `badge` +
        modyfikator (`AgendaEditorClient.tsx` - `StatusPill`, `MeetingPanelClient.tsx` -
        pasek tytułowy/`AgendaStatusPill`/tabliczka obecnych/"bieżący punkt",
        `MeetingParticipantsClient.tsx` - chipy zakresu priorytetu, `SpeakersPanel.tsx` -
        znaczniki AD VOCEM/WNIOSEK/PRIORYTET, `ParticipantsManagerClient.tsx` - rola konta):
        `pill-live`→`badge badge-live`, `pill-ok`→`badge text-bg-success` (kolor `$success`
        już wcześniej zamapowany na `--color-yes`), `pill-neutral`→`badge text-bg-light border`
        (wzorem już istniejących `MEETING_STATUS_LABEL` badge z Fazy AAB), gołe `.pill` z
        inline-stylowanym tłem/kolorem → `badge` z tym samym inline stylem (promień/padding
        bazowy przejęty od Bootstrapa), interaktywne chipy z obramowaniem → `badge border`.
  - Karty głosowania/prezentacja/transmisja - bez zmian (nie ładują Bootstrapa, `.pill`/
    `.eyebrow` z `globals.css` nadal ich jedynym źródłem stylu).

## AAF. "Domyślny wygląd Bootstrapa" - prawdziwe komponenty zamiast ręcznych imitacji + druga
     przyczyna niewidocznych elementów (kolizja `.collapse` Tailwind/Bootstrap)
- Dalsza, ostrzejsza ocena użytkownika ("nadal jest paskudnie... karty wyglądają źle, macie
  zrobić domyślny wygląd... jak się klika Raporty to dramat, nie ma dropdown tylko dropup...
  Przerwa w obradach jest po swojemu a nie na bootstrap") wskazała, że punktowe poprawki CSS to
  za mało - część UI wciąż była RĘCZNIE zaimitowana (nagłówek karty jako zwykły `<div>` z linią
  pod spodem zamiast prawdziwego `card-header`; menu "Raporty" jako natywny `<details>/<summary>`
  zamiast Bootstrapowego `.dropdown`; "Przerwa w obradach" jako ręcznie stylowany `<div
  style={{border:...}}>` z własnymi trójkącikami ▾/▸ zamiast Bootstrapowego wzorca zwijanej
  sekcji) - stąd "nie ma dropdown tylko dropup" (natywny `<details>` nie ma kolizji z viewportem
  jak prawdziwy Bootstrapowy dropdown z Popperem) i ogólny "niespójny" wygląd.
- [x] **Prawdziwe nagłówki kart** - wszystkie ręcznie budowane paski nagłówka
      (`className="px-5 py-3 border-b ..."` z `<h2/h3 className="eyebrow">` w środku, ~14 miejsc
      w `DisplayControlPanel`, `FormalMotionsPanel`, `MeetingPanelClient` (×5),
      `AttendanceCheckPanel` (×2), `AgendaEditorClient` (×2), `SpeakersPanel`,
      `ParticipantsManagerClient` (×2)) zamienione na prawdziwy Bootstrapowy `card-header`
      (jasne tło `--bs-card-cap-bg`, własny padding/border) - sama nazwa klasy, bez zmiany
      treści nagłówków ani układu.
- [x] **Prawdziwy dropdown "Raporty"** (`MeetingPanelClient.tsx`) - zamiast `<details>/<summary>`
      + ręcznie pozycjonowanego `absolute` panelu: `div.dropdown` + `button.dropdown-toggle
      data-bs-toggle="dropdown"` + `ul.dropdown-menu.dropdown-menu-end` z `li>a/button
      .dropdown-item`, `dropdown-header` (sekcja "Porządek i protokół") i `dropdown-divider` -
      teraz to prawdziwy komponent Bootstrapa z automatycznym, poprawnym pozycjonowaniem.
      Wymaga JS Bootstrapa (patrz niżej) - bez niego `data-bs-toggle` nic by nie robił.
- [x] **JS Bootstrapa dociągnięty** - nowy `src/components/BootstrapJs.tsx` (client component,
      `useEffect(() => import("bootstrap/dist/js/bootstrap.bundle.min.js"))`) wyrenderowany w
      layoutach `(operator)`, `login`, `account`, `chairperson` - dotąd był ładowany tylko CSS
      Bootstrapa (apka nie miała dropdownów), teraz jest i JS, więc `data-bs-toggle="dropdown"`
      działa "z pudełka", bez pisania własnej logiki otwierania/pozycjonowania. Dodano
      `src/types/bootstrap-js.d.ts` (deklaracja modułu - paczka nie ma typów dla ścieżki do
      gotowego bundla).
- [x] **"Przerwa w obradach" na realnych komponentach** (`DisplayControlPanel.tsx`) - ręczny
      `<div style={{border:...}}>` z trójkącikami ▾/▸ zamieniony na `border rounded` + Bootstrapowy
      wzorzec zwijanej sekcji (`className="collapse show"` sterowany istniejącym stanem React,
      bez `data-bs-toggle` - nie było potrzeby JS-a skoro stan już był w komponencie), środek na
      `btn-group` (przyciski 5/10/15/30 min - teraz złączone w jeden pasek, nie osobne guziki) i
      `input-group` (pole + przycisk "Ustaw" w jednym, spójnym elemencie). Reszta panelu
      (`DisplayControlPanel`) też przeszła na prawdziwe komponenty: `list-group`/
      `list-group-item-action`/`active` dla listy trybów prezentacji (zamiast ręcznego
      pogrubiania tekstu przez `fontWeight`), `form-check` dla checkboxów opcji.
- [x] **Druga przyczyna niewidocznych elementów - kolizja nazwy klasy `.collapse`.** Po dodaniu
      `className="collapse show"` do Przerwy, jej zawartość (przyciski 5/10/15/30 min, pola
      input-group) była w DOM (potwierdzone przez odczyt realnego drzewa strony), ale
      NIEWIDOCZNA mimo poprawnego `display:block`. Przyczyna: Tailwind ma WŁASNĄ, zupełnie inną
      utility o tej samej nazwie `.collapse` (`visibility:collapse` - do ukrywania wierszy
      tabeli), generowaną automatycznie, bo gdziekolwiek w kodzie pojawia się
      `className="collapse"`. To nie jest konflikt na tej samej właściwości CSS (Bootstrap
      ustawia `display`, Tailwind `visibility`), więc zasada "unlayered wygrywa z layerowanym"
      (patrz AAE) nic tu nie rozstrzyga - OBIE reguły się stosują naraz: element dostaje
      poprawne `display:block` ORAZ `visibility:collapse` z Tailwinda i jest niewidoczny mimo
      zajmowania miejsca w layoucie. Naprawione jedną regułą w `bootstrap-scoped.scss`:
      `.collapse { visibility: visible; }` (unlayered, więc bezwarunkowo neutralizuje Tailwinda
      w całym zakresie Bootstrapa) - Bootstrap i tak nigdy świadomie nie używa `visibility` do
      pokazywania/ukrywania `.collapse`, więc to bezpieczne, ogólne zabezpieczenie na przyszłość
      (dowolny kolejny Bootstrapowy `.collapse`/accordion w panelu operatora będzie działał
      poprawnie bez ponownego natrafiania na ten sam problem).
- Zweryfikowane na żywo (nie tylko przez czytanie kodu) - lokalne uruchomienie `npm run dev` z
  bazą Postgres, zalogowanie jako operator, utworzenie testowego posiedzenia z punktami/
  wnioskiem formalnym/głosowaniami i zrzuty ekranu rzeczywistej strony: nagłówki kart z jasnym
  tłem, dropdown "Raporty" otwierający się w dół z podziałami sekcji, "Przerwa w obradach" z
  widocznym, złączonym `btn-group`/`input-group` po rozwinięciu.

## AAG. `DisplayControlPanel.tsx` - jeden spójny `list-group-flush` zamiast trzech stylów
- Kolejny zrzut ekranu użytkownika pokazał, że karta "Ekran prezentacyjny" mieszała TRZY różne
  style przycisków w jednej kolumnie: płaskie, złączone wiersze `list-group` (tryby ekranu),
  osobne zaokrąglone przyciski `btn btn-outline-secondary` z odstępami ("Pokaż konkretny punkt",
  "Pokaż wyniki głosowania") i bezramkowy tekst ("Przerwa w obradach") - stąd zarzut "dwa rodzaje
  przycisków" i wrażenie zbędnych marginesów między blokami w tej samej karcie.
- [x] Cała zawartość karty przebudowana na JEDEN ciągły `list-group list-group-flush`
      (Bootstrapowy, oficjalny wzorzec listy "wtopionej" w kartę - bez własnego obramowania/
      zaokrąglenia, tylko cienkie linie między wierszami, zero dodatkowych marginesów) -
      wszystkie tryby, "Pokaż konkretny punkt"/"Pokaż wyniki głosowania" (rozwijają się jako
      kolejne, wcięte pozycje tej samej listy, nie osobne boksy), "Przerwa w obradach" (po
      rozwinięciu pokazuje `btn-group`/`input-group` wewnątrz jednego `list-group-item`, nie w
      oddzielnej ramce) i "Pokaż PIN na sali" (nagłówek sekcji jako wyszarzony wiersz listy) -
      wszystko jedną, spójną wizualnie sekwencją. Kompozycja komunikatu tekstowego i checkboxy
      opcji zostają w osobnych, jawnie oddzielonych `card-body` (`border-top`) - to inny rodzaj
      treści (formularz, nie lista wyboru), więc oddzielenie jest tu celowe, nie przypadkowe.
- Zweryfikowane na żywo tym samym sposobem co w AAF - zrzut ekranu pokazuje jedną, ciągłą listę
  bez mieszanych stylów przycisków.

## AAH. Rozdzielenie statusu posiedzenia od przycisku "Otwórz" + ujednolicenie kart panelu (`card-body`)

**Koncepcja od Jana:** pełny panel posiedzenia (głosowania na żywo, mówcy, obecność...) ma się
włączać dopiero po otwarciu posiedzenia; samo "Otwórz posiedzenie" ma być oddzielone od
faktycznego rozpoczęcia obrad (osobny przycisk), a dopóki posiedzenie nie jest otwarte, operator
ma widzieć edytor porządku obrad razem z planerem głosowań zamiast pustego/pełnego panelu.
Przy okazji: "na nowo zbudować wszystkie karty ... nie rozumiem marginesów" - w
`MeetingPanelClient.tsx` znaleziono pięć różnych ad-hoc paddingów (`p-3`/`p-4`/`p-5`/`p-6`/`p-8`)
używanych zamiast Bootstrapowego `card-body`, w dwóch miejscach nałożonych na sam `.card` (a nie
na treść pod nagłówkiem) - to była mechaniczna przyczyna "rozjazdu".

- [x] **Rozdzielenie statusów OPEN / IN_PROGRESS.** Etykiety w `labels.ts` już od dawna miały
      osobne "Otwarte" i "W toku" - flow tego nie wykorzystywał (`/open` skakał od razu do
      `IN_PROGRESS`). Teraz: `POST /api/meetings/[id]/open` ustawia `status: "OPEN"` (bez zmiany
      w pozostałej logice), nowy endpoint `POST /api/meetings/[id]/start` (wymaga `status ===
      "OPEN"`) ustawia `status: "IN_PROGRESS"`. Nowa wartość enuma `AuditAction.MEETING_STARTED`
      w schemacie (audit log rozpoczęcia obrad, osobno od `MEETING_OPENED`).
- [x] **Nagłówek panelu (`MeetingPanelClient.tsx`)** - trzy niezależne przyciski zamiast jednego:
      "Otwórz posiedzenie" (PREPARED/DRAFT -> OPEN), "Rozpocznij obrady" (OPEN -> IN_PROGRESS,
      widoczny tylko w statusie OPEN), "Zamknij posiedzenie" (OPEN lub IN_PROGRESS -> CLOSED, bez
      zmian poza warunkiem widoczności).
- [x] **Widok przygotowania (`PreparationView`, nowy)** - dopóki `status` to `PREPARED`/`DRAFT`
      (`isPreparation`), zamiast siatki 12 kolumn z pełnym panelem pokazywany jest baner
      informacyjny + `AgendaEditorClient` (nowy prop `embedded` - bez własnego nagłówka strony,
      do osadzenia wewnątrz panelu) + nowa karta `VotePlannerCard`. Po `OPEN`/`IN_PROGRESS` panel
      wygląda jak dotychczas (bez zmian w funkcjonalności samego posiedzenia w toku).
- [x] **`VotePlannerCard` (nowa karta "Planer głosowań")** - lista punktów porządku z
      checkboxami + wybór rodzaju/jawności/większości/podstawy, tworzy po jednym głosowaniu na
      zaznaczony punkt przez istniejący endpoint `votes/bulk-by-agenda` (ten sam, którego już
      używał `BulkImportModal` w trybie "agenda") - bez duplikowania logiki bulk-tworzenia.
- [x] **Ujednolicenie paddingu kart na `card-body`** - "Aktualny punkt", pusty stan "Głosowanie",
      `ActiveVotePanel`, `MessagesPanel` (`p-3..p-8` -> `card-body`); "Materiały posiedzenia" i
      karta e-mail miały `.p-4` na samym `.card` (podwójny padding razem z nagłówkiem) - poprawione
      na `card` + osobny `card-body` pod nagłówkiem. `FutureSignupsPanel` ("Zapisy do przyszłych
      punktów") był ręcznie zwijany przyciskiem z glifami ▾/▸ - przebudowany na prawdziwy
      Bootstrapowy `card-header` (button) + `collapse`/`show`, ten sam wzorzec co "Przerwa w
      obradach" w AAF/AAG.
- [x] **Poprawka:** serwerowy initial state (`app/(operator)/meetings/[id]/page.tsx`) nie
      przekazywał pól `unnumbered`/`isSubItem`/`hiddenFromDisplay`/`description`/`presenter` w
      mapowaniu `agenda` - efekt uboczny: nienumerowane punkty ("Przerwa", "Zamknięcie
      posiedzenia") w nowej karcie "Planer głosowań" wyświetlały samo "." zamiast "-." (dywiz
      zamiast numeru). Uzupełniono mapowanie o brakujące pola.
- **Świadomie nietknięte:** cztery miejsca po stronie uczestnika, które już wcześniej traktowały
  `OPEN` jako "posiedzenie widoczne/dołączalne" razem z `IN_PROGRESS`/`PAUSED`
  (`api/me/session`, `api/me/active-votes`, `(participant)/session/page.tsx`,
  `(participant)/session/mini/page.tsx`) - zgodnie z ustaleniem "aplikacją u radnego zajmiemy się
  później, będzie więcej zmian", uczestnik od teraz widzi posiedzenie jako aktywne już w stanie
  OPEN (przed kliknięciem "Rozpocznij obrady") - to zachowanie zgodne z pierwotnym zamysłem
  nazewnictwa statusów, nie regresja.
- Zweryfikowane na żywo: lokalny `npm run dev`, przejście testowego posiedzenia
  PREPARED -> (widok przygotowania: edytor porządku + planer głosowań) -> "Otwórz posiedzenie"
  -> OPEN (pełny panel, przycisk "Rozpocznij obrady") -> "Rozpocznij obrady" -> IN_PROGRESS
  ("W toku", przycisk znika, zostaje tylko "Zamknij posiedzenie") - zrzuty ekranu Playwright na
  każdym etapie, `npx tsc --noEmit` i `npm run build` czyste.

## AAI. Prawdziwa przyczyna "znikających" przycisków i planer głosowań z dowolnymi nazwami

Po AAH Jan zgłosił, że mimo poprzednich poprawek karty nadal wyglądają źle: "dlaczego wewnątrz
kart są odstępy?", "dlaczego niektóre przyciski nie mają widocznych krawędzi (chciałbym żeby
wszystkie miały tło)". Odczyt `getComputedStyle` gołego `className="btn"` na panelu operatora
potwierdził: `background-color: transparent`, `border-color: transparent` - guzik był tam cały
czas, tylko całkowicie niewidoczny (stąd wrażenie "odstępu" zamiast przycisku).

- [x] **Przyczyna: ta sama, co przy `.collapse` (patrz AAF), tym razem dla `.btn`.** Bootstrapowa
      bazowa `.btn` jest CELOWO przezroczysta (zakłada wariant koloru typu `.btn-primary`).
      Dawny, własny `.btn` z `globals.css` (biały spód + widoczna krawędź, sprzed migracji na
      Bootstrap) jest layerowany (`@layer base`, Tailwind); Bootstrapowa `.btn` jest unlayered
      (importowana w `bootstrap-scoped.scss` poza jakimkolwiek `@layer`) - więc dla wspólnych
      właściwości (`background-color`, `border-color`) unlayered zawsze wygrywa, niezależnie od
      specyficzności. Ponad 90 miejsc w panelu operatora (`MeetingPanelClient.tsx` samo ma 46) używa
      gołego `className="btn"` licząc na stary, widoczny wygląd - wszystkie były w efekcie
      przezroczyste. Ten sam mechanizm zerował też kolorowe `.btn-yes`/`.btn-no`/`.btn-abstain`.
- [x] **Poprawka w `bootstrap-scoped.scss`** - unlayered `.btn:not(<lista wariantów Bootstrapa i
      własnych .btn-yes/.btn-no/.btn-abstain>)` przywraca biały spód + widoczną krawędź +
      hover/disabled, bez dotykania kolorowych wariantów (wykluczone jawnie w `:not()`, bo mają tę
      samą specyficzność - o pierwszeństwie decydowałaby tylko kolejność w arkuszu). Dodano też
      unlayered `.btn-yes`/`.btn-no`/`.btn-abstain` z właściwymi kolorami + hover.
- [x] **Ważna pułapka procesowa, do zapamiętania:** `bootstrap-scoped.scss` NIE jest kompilowany
      przez wbudowaną obsługę Sass w Next.js - layouty (`(operator)`, `login`, `account`,
      `chairperson`) importują gotowy, skompilowany `src/app/bootstrap-scoped.css` (plik
      wygenerowany, w `.gitignore`, NIE w repo). Kompiluje go dopiero `npm run build:bootstrap`
      (`sass src/styles/bootstrap-scoped.scss:src/app/bootstrap-scoped.css`), uruchamiane
      automatycznie na początku `npm run build`, ale NIE przy samym `npm run dev`. Efekt: edycja
      `bootstrap-scoped.scss` i sam restart `npm run dev` (bez wcześniejszego pełnego
      `npm run build` lub ręcznego `npm run build:bootstrap`) nie daje żadnego efektu wizualnego -
      strona nadal serwuje stary, skompilowany CSS. Przy każdej zmianie w tym pliku uruchomić
      `npm run build:bootstrap` (albo `npm run build`) przed testowaniem w przeglądarce.
- [x] **Planer głosowań - dowolne nazwy, także poza porządkiem.** Jan: "Planer głosowań ma
      dodawać wszystkie głosowania, z żądaną nazwą, nawet poza porządkiem" - dotychczasowy
      `VotePlannerCard` tworzył głosowania WYŁĄCZNIE po tytułach zaznaczonych punktów porządku.
      Dodano przełącznik trybu: "Z porządku obrad" (bez zmian - checkboxy punktów) / "Dowolne
      nazwy" (textarea, jedna linia = jedno głosowanie, dowolny tytuł - ten sam endpoint
      `votes/bulk` co "Importuj z tekstu" w pełnym panelu) z opcjonalnym przypisaniem do punktu
      porządku (select) - domyślnie "- poza porządkiem (ad hoc) -" (bez punktu, `adHoc: true`).
      Bez nowego endpointu - reużyto istniejące `votes/bulk` i `votes/bulk-by-agenda`.
- Zweryfikowane na żywo: `getComputedStyle` przed/po pokazuje `background-color`/`border-color`
  gołego `.btn` zmienione z `transparent` na biały/ciemny; `.btn-primary`/`.btn-danger`
  niezmienione (kontrola regresji); planer głosowań w trybie "Dowolne nazwy" tworzy głosowania
  `adHoc=true` bez `agendaItemId` (potwierdzone zapytaniem do bazy) - dowolna nazwa, poza
  porządkiem. `npx tsc --noEmit` i `npm run build` (z `build:bootstrap`) czyste.

## AAJ. Pojedyncze głosowanie przy punkcie (przed otwarciem) + dalsze marginesy

Jan po AAI: planer głosowań dobry, ale tylko do seryjnego (hurtowego) tworzenia - pojedyncze
głosowania powinny być dodawane przyciskiem przy punkcie porządku, a zaplanowane głosowania
pokazywać się pod nazwą punktu (nie tylko w osobnej liście). Do tego: nadal za dużo pustego
miejsca z prawej strony rzędów w kartach oraz za duży margines przed numerem/tekstem punktu -
zrzuty ekranu z zaznaczeniami potwierdziły obie te interpretacje.

- [x] **`AgendaEditorClient.tsx`** - nowy prop `initialVotes` (id/title/agendaItemId/status).
      Każdy punkt dostał przycisk **„+ Głosowanie”** obok „Usuń” - otwiera mały inline formularz
      (pole nazwy + Zapisz/Anuluj, bez modala) i tworzy JEDNO głosowanie przypisane do tego
      punktu przez istniejący endpoint `votes/bulk` (`text` z jedną linią + `agendaItemId`, bez
      nowego endpointu). Głosowania w stanie „Przygotowane” przypisane do punktu wyświetlają się
      teraz POD jego nazwą (badge „Przygotowane” + tytuł + „Usuń”, `DELETE /api/votes/[id]`) -
      zamiast wyłącznie w oddzielnej, płaskiej liście. To samo w standalone stronie
      `/meetings/[id]/agenda` (przekazano `initialVotes` z bazy) - przy okazji naprawiono tam też
      brakujące pole `unnumbered` w mapowaniu (ten sam błąd co w AAH, inne miejsce, przeoczone).
      Planer głosowań (`VotePlannerCard`) zostaje bez zmian - do masowego/seryjnego tworzenia.
- [x] **Zbyt duży margines przed numerem/tekstem punktu** - w trzech miejscach (lista „Porządek
      obrad” w pełnym panelu, `voteRow` w karcie „Głosowania”, lista w `AgendaEditorClient`)
      zmniejszono padding wiersza (`px-5`→`px-3`), szerokość kolumny numeru (32-40px→18-24px, z
      wyrównaniem do prawej zamiast do lewej) i odstęp `gap-3`→`gap-2` - numer/tekst zaczyna się
      teraz wyraźnie bliżej krawędzi karty. To samo (`px-5`→`px-3`) w liście oczekujących mówców
      (`SpeakersPanel.tsx`).
- [x] **Zbyt dużo pustego miejsca z prawej strony rzędu** - siatka 12-kolumnowa w pełnym panelu
      miała nierówny podział 4/5/3 (lewa/środkowa/prawa kolumna); środkowa karta „Głosowania” ma
      krótkie, zwarte wiersze (mały tytuł + kilka małych przycisków) i przy szerokości 5/12
      zostawiała wyraźny pusty pas z prawej. Zmieniono na równy podział **4/4/4** - węższa
      środkowa kolumna redukuje ten pas, a szersza prawa kolumna (gęsta lista `list-group`) i tak
      wypełnia się naturalnie, więc nie robi się pusta.
- [x] **Przy okazji:** `p-4` bezpośrednio pod `card-header` w `FormalMotionsPanel.tsx` (ten sam
      wzorzec podwójnego/niespójnego paddingu co w AAH, przeoczony wtedy) zamieniony na
      `card-body`.
- Zweryfikowane na żywo: kliknięcie „+ Głosowanie” przy punkcie „test1” w widoku przygotowania
  tworzy głosowanie widoczne natychmiast pod nazwą punktu (zrzut ekranu + potwierdzenie w bazie:
  `agendaItemId` ustawiony, `status='READY'`); zrzut pełnego panelu po zmianie siatki 4/4/4 i
  zmniejszonych marginesach. `npx tsc --noEmit` i `npm run build` czyste.

## AAK. Siatka 3/6/3 (środek najszerszy), widok przygotowania węższy, modal głosowania bez scrolla całej strony

Jan po AAJ: nadal za dużo pustego miejsca po lewej (widoczne po krótkim pasku "Przygotowane" w
widoku przygotowania), a przy okazji 4/4/4 zepsuło to, że środkowa kolumna MA być najszersza.
Zgłosił też do poprawki: okno tworzenia głosowania (nie mieści się w jednym widoku, trzeba
przewijać całą stronę) oraz wygląd trwającego głosowania i "oddaj głos za kogoś" w porównaniu do
oryginału.

- [x] **Siatka 12-kol. zmieniona z 4/4/4 na 3/6/3** - lewa i prawa kolumna węższe (3/12 każda),
      środkowa ("Głosowanie"/"Głosowania" - tu mieści się aktywny ballot z wynikami) dwa razy
      szersza (6/12), zgodnie z żądaniem "środkowy pasek ma być najszerszy".
- [x] **Widok przygotowania (`PreparationView`)** - dotąd rozciągał się na pełną szerokość strony
      (poza siatką 12-kol.), przez co krótkie wiersze (punkt + mały pasek "Przygotowane" z
      zaplanowanym głosowaniem) zostawiały ogromny pusty pas po prawej na szerokim ekranie.
      Ograniczono do `maxWidth: 860px, marginInline: auto` (wyśrodkowane, węziej) - ten sam rząd
      wielkości co standalone strona `/meetings/[id]/agenda` (960px).
- [x] **Okno tworzenia/edycji głosowania (`VoteComposerModal`)** - dotąd całe okno (nagłówek +
      treść + przyciski Anuluj/Utwórz) przewijało się razem ze stroną w tle (`overflowY: auto` na
      całym tle, brak ograniczenia wysokości samego okna) - przy dłuższej zawartości (lista/pakiet
      z wieloma pozycjami) trzeba było przewijać całą stronę, żeby dotrzeć do przycisku "Utwórz".
      Przebudowane na ten sam sprawdzony wzorzec co okno wyników głosowania: okno ma
      `maxHeight: 92vh` i jest `flex column`, nagłówek i pasek przycisków (`flexShrink: 0`) są
      NIERUCHOME, przewija się tylko środkowa treść formularza (`overflowY: auto, flex: 1`) -
      przyciski "Anuluj"/"Utwórz" są zawsze widoczne, bez przewijania całej strony.
- Sprawdzone też na żywo widok trwającego głosowania i "Oddaj głos w imieniu uczestnika" - po
  poprawce widoczności przycisków z AAI (transparentne `.btn`) obie te karty wyglądają spójnie z
  resztą panelu (widoczne tła/krawędzie przycisków Zamknij/Przerwij/Anuluj, tabela ZA/PRZECIW/
  WSTRZYMAŁ SIĘ, rozwijany wiersz wyszukiwania uczestnika) - nie znaleziono dodatkowych
  rozjazdów w kodzie tych dwóch widoków.
- Zweryfikowane na żywo: zrzuty ekranu siatki 3/6/3, widoku przygotowania (węższy), okna
  tworzenia głosowania (nagłówek/stopka nieruchome), trwającego głosowania i rozwiniętego
  "oddaj głos w imieniu uczestnika". `npx tsc --noEmit` i `npm run build` czyste.

## AAL. Podsumowanie głosowania na prawdziwym Bootstrapie + kolory + dalsze marginesy

Jan po AAK, na zrzucie z telefonu zaznaczył na czerwono: nadal za duże marginesy przy numerach/
małych kontrolkach (limit czasu, checkbox "Dozwolone w każdej chwili", lewy margines listy
głosowań) - "ma być estetycznie"; poprosił o przeprojektowanie "podsumowania głosowania" (licznik
ZA/PRZECIW/WSTRZYMAŁ SIĘ) na prawdziwym Bootstrapie; zapytał czy przyciski w "oddaj głos w
imieniu" są kolorowe; poprosił by komunikat o oddanym głosie przy nazwisku był kolorowy.

- [x] **Licznik ZA/PRZECIW/WSTRZYMAŁ SIĘ (`BallotCounter`) przeprojektowany na Bootstrapie** -
      dotychczasowy ręczny `grid grid-cols-3 gap-px bg-[kolor] border` (symulowanie ramek 1px
      przerwą + kolorem tła) zamieniony na prawdziwe `row row-cols-3 g-0 border rounded-2
      overflow-hidden` + `col` z `border-end` między komórkami (bez obramowania na ostatniej).
      To samo dla licznika pakietu (`PackageCounterRow`) - zamiast ręcznej siatki CSS, prawdziwa
      Bootstrapowa `<table className="table table-bordered table-sm">`.
- [x] **Przyciski w "Oddaj głos w imieniu uczestnika" SĄ kolorowe** (`btn-yes`/`btn-no`/
      `btn-abstain` - zielony/czerwony/żółty) - to już działało od poprawki AAI (niewidoczne
      gołe `.btn`), zweryfikowane bezpośrednio zrzutem ekranu.
- [x] **Komunikat "oddał: ZA/PRZECIW/WSTRZYM." przy nazwisku - teraz kolorowy** wg oddanego głosu
      (zielony/czerwony/żółty, `var(--color-yes/no/abstain)`) zamiast jednolitego szarego -
      dla listy/pakietu zostaje neutralny (nie ma pojedynczego koloru dla wielu wyborów).
- [x] **Globalne zmniejszenie odstępu w kartach** - `$card-spacer-y`/`$card-spacer-x` w
      `_bs-theme.scss` zmniejszone z `1.1rem` na `.6rem`/`.75rem` - to jedna zmienna Bootstrapa,
      więc dotyczy WSZYSTKICH `card-header`/`card-body` naraz (m.in. "Limit (s):", "Dozwolone w
      każdej chwili" i inne małe kontrolki w nagłówkach kart, które wyglądały na "otoczone dużym
      marginesem" przy poprzednim, domyślnym odstępie Bootstrapa).
- [x] **Dalsze zmniejszenie paddingu/marginesów w wierszach list** - `voteRow` (karta
      "Głosowania"), lista oczekujących w `SpeakersPanel.tsx`, lista wniosków formalnych w
      `FormalMotionsPanel.tsx` i panel "Oddaj głos w imieniu uczestnika" - usunięto sztywne
      szerokości kolumny numeru (`minWidth`/`width`/`w-6`) na rzecz naturalnego rozmiaru, padding
      wierszy `px-3`→`px-2`, `p-3`→`p-2`.
- Zweryfikowane na żywo: zrzut przeprojektowanego licznika ZA/PRZECIW/WSTRZYMAŁ SIĘ (prawdziwe
  `row`/`col`/`border-end`, zaokrąglone rogi), potwierdzone kolorowe przyciski w "oddaj głos w
  imieniu". `npx tsc --noEmit` i `npm run build` czyste.

---

## AAM. Kompleksowe dokończenie migracji na Bootstrap - spójny panel operatora, logowanie, ekrany radnych

Zgłoszenie Jana: interfejs po migracji był niespójny (przypadkowe rozmiary nagłówków i kontrolek,
nierówne wyrównania, dziwne marginesy kart, pozostałości starego stylu). Zadanie: dokończyć
migrację panelu operatora i logowania, uporządkować ekrany radnych (telefon -> duży monitor),
BEZ zmian w kartach do głosowania, prezentacji (/display) i transmisji (/overlay, OBS) - także
pośrednich.

**Wspólny system (operator, logowanie, konto, przewodniczący - tylko te sekcje ładują Bootstrapa)**
- [x] `_bs-theme.scss` przepisany: paleta (granat `#1E4171` jako primary, stonowane szarości),
      bazowy font 15 px, skala nagłówków h1-h6 i `fs-1..6`, jednolite paddingi kart, przycisków,
      pól, tabel, odznak i list.
- [x] `bootstrap-scoped.scss`: najmniejszy tekst 13 px (bez mikroskopijnych etykiet), `.eyebrow`
      bez wersalików i rozstrzelenia, jeden wygląd tytułu karty (`.card-title-text`), nagłówek
      strony `.page-header`, neutralny `btn` bez wariantu (jasne tło + ramka), warianty
      `btn-yes/no/abstain`, wyrównanie checkboxów z etykietami, `.badge-live`, numer wiersza
      `.row-num`, `.table-responsive { position: relative }` (element `visually-hidden` w
      nagłówku tabeli poszerzał stronę na telefonie).
- [x] Nowe komponenty: `operator/ui.tsx` (`CardHeader`, `PageHeader`, `PageContainer`),
      `operator/Modal.tsx` (okno w strukturze Bootstrapa: nagłówek/treść/stopka, Esc, blokada
      przewijania tła), `operator/NavLinks.tsx` (aktywna zakładka). Wszystkie ręcznie budowane
      okna (`fixed inset-0 ...`) zastąpione `Modal`.
- [x] Pasek nawigacji operatora: `navbar-expand-lg` ze zwijanym menu na telefonie.

**Panel operatora i podstrony**
- [x] Panel posiedzenia: nagłówek strony, statystyki w `row g-3`, siatka 3/6/3 -> na telefonie
      jedna kolumna (wcześniej strona przewijała się w poziomie o ~290 px), listy jako
      `list-group`, odznaki statusów, delikatne wyróżnienie głosowań bieżącego punktu.
- [x] Mówcy, wnioski formalne, ekran prezentacyjny, obecność, zegar dyskusji, materiały,
      komunikaty, ustawienia posiedzenia - jeden wzorzec nagłówka karty, `input-group`,
      `btn-group`, `form-switch`.
- [x] Pulpit, lista posiedzeń, nowe posiedzenie, archiwum, log logowań, ustawienia globalne
      (sekcje jako karty, przypięty pasek "Zapisz ustawienia"), uczestnicy (tabela z ukrywaniem
      kolumn na wąskich ekranach, okna użytkownika/grupy/importu/e-maila), uczestnicy
      posiedzenia, goście, szablony, porządek obrad (rzadsze akcje w menu "Więcej"), raport
      głosowania (opakowanie przewijane w poziomie), konto (zmiana hasła).
- [x] Usunięto ukryty błąd: opcja "Publikuj wyniki automatycznie" w ustawieniach była widoczna
      (klasa `d-flex` z `!important` wygrywała z `display:none`) - teraz `d-none`.
- [x] Widok przewodniczącego: responsywna siatka (na telefonie jedna kolumna), etykiety bez
      wersalików i rozstrzelenia, skalowane duże teksty (`clamp`).

**Logowanie**
- [x] Wyśrodkowana karta 400 px, znak iOBRADY nad kartą, większe pola (wygodne na telefonie),
      błąd jako `alert` + podświetlenie pól (`is-invalid`), spinner w przycisku.

**Ekrany radnych (bez Bootstrapa - kolizja nazw klas z kartami do głosowania)**
- [x] Nowy arkusz `src/app/(participant)/participant.css` z klasami `pt-*` (unikalne nazwy,
      wyłącznie zmienne motywu `--color-*`, więc działa też tryb czarny). `globals.css` bez zmian.
- [x] Nagłówek z zakładkami Bieżące / Nadchodzące / Archiwum (`ParticipantNav`, przewijane w
      poziomie na wąskich ekranach), przyciski min. 44 px wysokości.
- [x] Sesja: nagłówek, status/obecność, bieżący punkt, komunikaty, wyniki ostatniego
      głosowania (2x2 na bardzo wąskich ekranach), wniosek formalny, lista mówców (pełne nazwy
      "Ad vocem"/"Wniosek formalny" zamiast mikroskopijnych "AV"/"WF"), kolejka wniosków,
      zapisy do dyskusji, sprawdzenie obecności. Nadchodzące/archiwum jako listy klikalnych
      wierszy zamiast tabel, szczegóły archiwum, okno wyników, notatka.
- [x] NIETKNIĘTE: `VoteBallot`, `StandardBallot`, `ListBallot`, `QuorumBallot`, `PackageBallot`,
      `PinGate`, `ActiveVotesOverlay`, `ToastHost`, `MiniDisplayClient`, `globals.css`,
      `/display`, `/overlay` (sprawdzone porównaniem treści funkcji z HEAD).

**Weryfikacja**
- Zrzuty przed/po chronionych widoków (prezentacja i OBS 1920x1080 w stanach: spoczynek,
  głosowanie trwa, wyniki, lista; karty do głosowania: zwykłe, tajne, lista, pakiet, kworum,
  PIN, po oddaniu głosu - w szerokościach 360/390/768/1024/1440; widok mini) przy zamrożonym
  zegarze i odtworzonych danych testowych - porównanie pikselowe.
- Zrzuty operatora 390/1024/1440, logowania 360/390/768/1440 (+ stan błędu), radnego
  360/390/768/1024/1440: brak poziomego przewijania strony.
- Test interakcji (dane testowe): menu Raporty, okno edycji posiedzenia, utworzenie i otwarcie
  głosowania, oddanie głosu przez radnego, zamknięcie głosowania i okno wyników (Esc), menu
  "Więcej" i edytor punktu, okna uczestników i importu CSV, zapis ustawień, menu mobilne.
- `npx tsc --noEmit` i `npm run build` czyste.

## AAN. Karta do głosowania bez widocznych podpowiedzi skrótów

- [x] Na zwykłej karcie do głosowania (`StandardBallot`, używanej też w mini wyświetlaczu)
      przyciski pokazywały "(Z)", "(P)", "(W)" - sprzeczne z zasadą ukrytych skrótów. Usunięto
      same podpowiedzi; skróty Z/P/W/O działają bez zmian (sprawdzone: klawisz Z oddaje głos).
      Inne widoczne podpowiedzi skrótów w UI nie występują (przeszukane komponenty).

## AAO. Zniesione ograniczenie 500 znaków w nazwie punktu i głosowania

- [x] Nazwa punktu porządku obrad i tytuł głosowania były w API ograniczone do 500 znaków (walidacja
      zod; kolumny w bazie to `text` bez limitu). Limit podniesiony do 5000 znaków: dodawanie i
      edycja punktu, tworzenie i edycja głosowania, hurtowe tworzenie głosowań (z porządku obrad
      i z listy tytułów - wcześniej tytuł był po cichu ucinany do 500). Nazwy pozycji listy/pakietu:
      200 -> 2000 znaków. Bez zmian schematu bazy.
- Sprawdzone na żywo: punkt i głosowanie z tytułem ~1500 znaków zapisują się w całości (dodanie,
  edycja, głosowanie przy punkcie).

## AAP. Przenoszenie punktów strzałkami (błąd 500)

- [x] Zamiana kolejności punktu porządku obrad strzałkami ↑/↓ kończyła się błędem 500:
      tymczasowa wartość `order = -Date.now()` (~ -1,8 bln) nie mieści się w kolumnie Int
      (32 bity). To samo w przesuwaniu mówców strzałkami. Wartość tymczasowa zmieniona na
      zakres -1 000 000 .. -1 999 999. Sprawdzone na żywo: punkt w górę i w dół działa.

## AAQ. Zgłoszenia Jana - punkty w trakcie posiedzenia, planer, obecność, prezentacja, raport

- [x] **Błąd aplikacji #300 przy operacjach na punkcie** - `SpeakersPanel` miał hook skrótów po
      warunkowym `return`; zakończenie punktu (brak listy mówców) wywalało cały panel operatora.
      Hook przeniesiony przed wyjścia; przeszukano wszystkie komponenty - innych takich miejsc brak.
- [x] **Usuwanie punktu po otwarciu** - masowe `order - 1` łamało unikalny indeks (posiedzenie,
      kolejność) -> 500. Przesuwanie pojedynczo; to samo przy wstawianiu w środek. W panelu
      posiedzenia dodany przycisk Usuń przy punkcie (poza bieżącym).
- [x] **Wiele punktów bez numeru** - prezentacja i widok przewodniczącego rozpoznawały punkty po
      numerze (pusty = wszystkie "bieżące", zdublowane klucze list). Teraz po id. Protokół i raport
      wystąpień dopasowują punkty po indeksie. Wspólna numeracja `lib/agendaNumbering` - po
      przesunięciu numery odświeżają się także z punktami bez numeru i podpunktami.
- [x] **Planer**: "+ Głosowanie" otwiera pełne okno planowania; "Edytuj" przy zaplanowanym
      głosowaniu; numer punktu w planerze głosowań nie jest ściskany; w planerze pełny skład
      posiedzenia (`MeetingParticipantsLoader`, API `/participants/editor`). Poprawione ukryte błędne
      wartości większości (QUALIFIED_2_3 / OF_STATUTORY - API odrzucało), dodana 3/5.
- [x] **Sprawdzenie obecności**: prezentacja liczy obecnych z bieżącego sprawdzenia (kafelki zgodne
      z listą); kafelek Obecni w panelu pokazuje potwierdzenia na żywo.
- [x] Menu Raporty nie chowa się pod belką "Zaplanowane"; w oknie wyniku głosowania przycisk
      "Raport PDF" i zawsze widoczne strzałki stron (lista i pakiet, +1/-1).
- [x] Zegar dyskusji w trybie "na punkt" zeruje się (z pulami klubów) przy zmianie punktu.
- [x] Panel ekranu: listy "Pokaż konkretny punkt" / "Pokaż wyniki" nie rozjeżdżają się; usunięte
      "Ukryj" z listy wyników; nowy tryb "Lista obecności".
- [x] **Prezentacja**: `PagedRows` - wiersze mierzone i pakowane do stron bez ucinania (wyniki listy
      i pakietu, wcześniej pakiet się przewijał); zegar wypowiedzi bez sztywnej szerokości (nie
      wychodzi za margines); bez kafelka "Uprawnionych" na wynikach po zamknięciu.
- [x] **Raport tajnego głosowania na listę**: obecni i nieobecni razem w kolumnach (ob./nb.), bez
      osobnej tabeli nieobecnych (jak w tajnym pakiecie).
- Sprawdzone na żywo (dane testowe): każda z powyższych ścieżek, zrzuty prezentacji 1920x1080,
  wygenerowany PDF raportu. `npx tsc --noEmit` i `npm run build` czyste.

## AAR. Aplikacja radnego - układ na poziomy tablet i komputer bez przewijania strony

- [x] Ekran sesji radnego od 960 px szerokości: nagłówek posiedzenia na całą szerokość (nazwa,
      pod nią w jednym wierszu "Zalogowano jako", przyciski i zwarte etykiety Status / Obecność),
      pod nim dwie kolumny: **główna** (bieżący punkt, porządek obrad, komunikaty, sprawdzenie
      obecności, wynik / oczekiwanie) i **zgłoszeń** (wniosek formalny, lista mówców, kolejka
      wniosków formalnych, zapisy do dyskusji). Gdy kolumna zgłoszeń jest pusta (nieobecny, trwa
      głosowanie) - jedna kolumna max 1080 px.
- [x] Od 960x620: układ wypełnia okno, kolumny przewijają się obok siebie (nie strona). Długie
      listy (komunikaty, mówcy, wnioski, zapisy) przewijają się we własnym panelu - nagłówek
      panelu i przyciski zgłoszeń zostają widoczne.
- [x] Telefony i węższe ekrany (w tym 768 px i powiększenie 200%) bez zmian: opakowania kolumn
      mają `display: contents`, kolejność DOM i fokusu taka sama jak wcześniej.
- [x] Karty do głosowania (`ActiveVotesOverlay` i karty) nietknięte - sprawdzone skrótem funkcji
      i porównaniem pikselowym zrzutów kart przed/po.
- [x] Przy okazji: zapisy do dyskusji nie pokazują ". " przed punktem bez numeru; w tabeli wyników
      pakietu (desktop) nagłówki Za / Prz. / Ws. nie łamią się w pół.
- Sprawdzone zrzutami (dane testowe): 360x800, 390x844, 768x1024, 1024x768, 1180x820, 1280x800,
  1366x768, 1440x900, 1920x1080 oraz 720x450 i 683x384 (200%); stany: typowy, długie listy i
  komunikaty, sprawdzenie obecności, oczekiwanie, głosowanie zwykłe / lista / pakiet, po
  głosowaniu nad pakietem.

## AAS. Tryb kotarkowy dla głosowania tajnego; przyciski listy mówców

- [x] **Lista mówców (radny)**: "+ Zapisz się" (albo "Wycofaj zapis") na całą szerokość,
      pozostałe przyciski (wniosek formalny, ad vocem, priorytet) dzielą kolejny wiersz po równo.
- [x] **Tryb kotarkowy** (`Vote.boothMode`, domyślnie wyłączony; przełącznik w oknie
      przygotowania głosowania, tylko tajne bez kworum; zmiana możliwa tylko przed otwarciem).
      Jedna kabina: kartę ma naraz co najwyżej jedna osoba (`Vote.boothUserId`).
  - Operator: w panelu "Trwa głosowanie" zamiast liczników panel kabiny - lista uprawnionych
    (obecni z prawem głosu), statusy Oczekuje / Głosowanie udostępniono / Głos oddany, osoba
    z kartą, przyciski Udostępnij / Cofnij udostępnienie, licznik oddanych / uprawnionych.
    Operator sam wybiera osobę (bez wymuszonej kolejności). Ostrzeżenie przy zamknięciu, gdy
    karta jest nadal udostępniona (przycisk i skrót C).
  - Radny: "Poczekaj na wywołanie i udostępnienie głosowania" -> po udostępnieniu istniejąca
    karta (bez zmian) -> po przyjęciu wyłącznie "Głos został przyjęty.". Stan zawsze z serwera
    (odświeżenie, ponowne połączenie). Wszystkie typy tajne: zwykłe, lista, pakiet.
  - Serwer (`api/votes/[id]/booth`, `lib/booth.ts`, `cast`): głos przyjmowany tylko od osoby
    z udostępnioną kartą; przyjęcie głosu, znacznik udziału i zwolnienie kabiny w jednej
    transakcji pod blokadą wiersza głosowania (`SELECT ... FOR UPDATE`). Pod tą samą blokadą:
    udostępnianie/cofanie (równocześni operatorzy, konflikt cofnięcie vs głos) i zamknięcie.
    Zarządzanie kabiną tylko dla roli OPERATOR. Nowe akcje audytu VOTE_BOOTH_GRANTED/REVOKED
    (kto i komu, bez treści głosu).
  - Bez wyników cząstkowych: w trybie kotarkowym do zamknięcia `/counter`, API prezentacji
    i raport PDF/CSV pojedynczego głosowania nie zwracają liczników ZA/PRZECIW/... (przy jednej
    osobie w kabinie przyrost licznika zdradzałby wybór).
- [x] **Wszystkie głosowania**: zamknięcie liczy wynik pod blokadą wiersza (wcześniej głos
      przyjęty w chwili zamykania mógł nie wejść do wyniku); głos po zamknięciu = 409.
- [x] **Wszystkie głosowania**: zerwane połączenie przy wysyłaniu głosu nie wywraca już strony
      radnego ("Application error") - granica błędów `VoteErrorBoundary` wokół nakładki i widoku
      mini, neutralny komunikat i ponowne pobranie stanu z serwera.
- Tajność - ograniczenia (opisane uczciwie): treść głosu trafia tylko do zbiorczych liczników,
  ale znacznik udziału i przyrost licznika zapisuje ta sama transakcja bazy. Osoba z pełnym
  dostępem do serwera/bazy (np. analiza wersji wierszy PostgreSQL, WAL, zrzut bazy w trakcie
  głosowania) mogłaby teoretycznie powiązać głos z osobą. Tajność chroni przed operatorem,
  innymi uczestnikami, prezentacją i raportami, nie przed administratorem serwera. Głosowania
  tajne BEZ trybu kotarkowego nadal pokazują liczniki na żywo (jak dotąd).
- Testy: `tests/e2e/booth-mode.spec.ts` (Playwright; sam zakłada i usuwa posiedzenie i konta):
  `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/booth-mode.spec.ts`
  (potrzebny DATABASE_URL). Scenariusze: ustawienie trybu, brak dostępu, jeden głos, brak wyników
  cząstkowych, cofnięcie i ponowne udostępnienie, dwóch operatorów, 5 równoległych wysłań,
  cofnięcie vs głos i zamknięcie vs głos (obie kolejności), pełny przebieg UI, druga zakładka,
  utrata odpowiedzi, telefon offline, ostrzeżenie przy zamknięciu, regresja bez trybu, przyciski
  listy mówców 360/390/1366. Dodatkowo jednorazowo: 82 sprawdzenia API i 58 UI (build produkcyjny).

## AAT. Zapisy do przyszłych punktów, komunikaty w aplikacji, plansza reprezentacyjna

- [x] **Zapisy do przyszłych punktów (operator)**: przy każdym przyszłym punkcie porządku obrad
      przycisk "Zapisani: N" - okno z listą w aktualnej kolejności (priorytetowe na początku),
      "Usuń" (z potwierdzeniem) i dotychczasowe dopisywanie "Zwykły / Priorytet". Ta sama lista
      (`FutureSignupList`) w zwijanej karcie "Zapisy do przyszłych punktów". Logika zapisów bez zmian.
- [x] **Priorytet do przyszłych punktów (radny)**: w "Zapisach do dyskusji" przycisk "Z priorytetem"
      dla osób, których prawo priorytetu obejmuje dany punkt (`lib/priority.ts`, ta sama reguła co
      przy zapisie). Nadal wyłącznie zwykły zapis (REGULAR) - z flagą priorytetu.
- [x] **Bez natywnych okien przeglądarki**: usunięto 93 wywołania (63 alert, 30 confirm, 0 prompt).
      Wspólny system `lib/feedback.ts` (`notify`, `ask`, `notifyFailure`, `readUserError`) +
      `components/ui/FeedbackHost.tsx` w layoutach operatora (Bootstrap, okno na `Modal`), radnego
      i kreatora. Dymki: prawy dolny róg (operator) / dół ekranu (radny), znikają same (błędy po 8 s).
      Potwierdzenia: tytuł, treść, Anuluj / akcja; destrukcyjne na czerwono z fokusem na "Anuluj";
      Escape = Anuluj. Błędy: treść z serwera tylko gdy jest zwykłym komunikatem dla użytkownika,
      w pozostałych przypadkach ogólny tekst; szczegół techniczny w konsoli. Pola błędów formularzy
      (`setError(await r.text())`) też przez `readUserError` - poza chronionymi kartami do głosowania.
- [x] **Plansza reprezentacyjna**: Ustawienia -> sekcja "Plansza reprezentacyjna" (zdjęcie tła,
      logo organizacji / osobny wariant / bez logo, tekst wielowierszowy, krycie nakładki - domyślnie
      80%, podgląd na żywo). Kolor = kolor nagłówka prezentacji. Pliki: `api/settings/board-image`
      (operator, typ sprawdzany po sygnaturze, zdjęcie do 8 MB, logo do 2 MB, SVG bez skryptów).
      Panel posiedzenia -> "Ekran prezentacyjny": "Pokaż planszę" / "Ukryj planszę" + stan.
      `Meeting.displayBoardVisible` - tylko tryb wyświetlania (nie zmienia trybu prezentacji ani obrad).
      Renderowanie: `components/presentation/RepresentationBoard.tsx` (warstwy CSS, jednostki kontenera,
      dopasowanie długiego tekstu) - ten sam komponent w podglądzie i na prezentacji; nie na transmisji.
- [x] `/api/uploads` (logo i obrazy planszy) dostępne bez logowania - wcześniej niezalogowany ekran
      sali nie pobierał nawet logo nagłówka. Serwowanie z `nosniff` i CSP `sandbox`.
- Sprawdzone (build produkcyjny): 52 sprawdzenia (ustawienia i podgląd, upload i uprawnienia,
  pokaż/ukryj na osobnym ekranie, odświeżenie, głosowanie w tle, powrót do aktualnego stanu, brak
  zdjęcia/logo, uszkodzone pliki, długi tekst, jasny kolor, 1920x1080 i 1280x720, zapisy i priorytet,
  okna i dymki, zero natywnych okien) + `tests/e2e/booth-mode.spec.ts` 7/7.

## AAU. Załączniki rozpatrywanego punktu w panelu radnego

- [x] Karta "Rozpatrywany punkt": pod nazwą punktu lista jego załączników (ikona, nazwa, typ
      i rozmiar) - każdy element to link do istniejącego `/api/attachments/[id]/download` (te same
      uprawnienia: uczestnik posiedzenia, pliki "widoczne dla uczestników"). Bez załączników - bez
      sekcji. Długie nazwy się zawijają; element ma min. 44 px wysokości; od 960 px dwie kolumny.
- [x] Dane w `/api/me/session` (`currentAgendaItem.attachments`) - aktualizacja jak reszta panelu
      (SSE + odpytywanie co 3 s). Wgranie, usunięcie i zmiana widoczności załącznika wysyłają
      zdarzenie SSE, więc lista zmienia się od razu, także po zmianie rozpatrywanego punktu.
- [x] Pobieranie: nagłówek `Content-Disposition` zgodny z RFC 6266 (`filename*=UTF-8''...` +
      zapasowa nazwa ASCII) - wcześniej nazwa była wstawiana zakodowana procentowo w `filename`.
- Sprawdzone (build produkcyjny): 16 sprawdzeń - brak sekcji bez plików, pojawienie się i zniknięcie
  bez odświeżania, ukryte pliki niewidoczne i niepobieralne (404), zmiana punktu, zawijanie na
  390 px, cel dotykowy, pobranie. Nazwy pobranego pliku z polskimi znakami nie dało się sprawdzić
  w testowej przeglądarce bez okna (podaje "download" dla każdego nie-ASCII wariantu nagłówka).

## AAV. Poprawki bezpieczeństwa po audycie (SECURITY_AUDIT.md)

Decyzje: SA-02 i SA-03 - zaakceptowane ryzyko (bez zmian); BR-1 - funkcja wstrzymywania wyników
usunięta; BR-2 - jawne jest jawne; BR-3 - jedna osoba może głosować w kilku posiedzeniach;
BR-4 - uprawnienia operatora do głosów jawnych bez zmian; BR-5 - przewodniczący tylko w posiedzeniu.

- [x] **Tajność rozkładu (SA-01)**: w KAŻDYM głosowaniu tajnym (zwykłym i kotarkowym) do zamknięcia
      serwer nie zwraca ZA/PRZECIW/WSTRZ/nieważnych, głosów na kandydatów ani pozycji pakietu - także
      operatorowi (`lib/secretTally.ts`; `counter`, `/api/display`, raporty, CSV). Zostaje liczba
      oddanych kart oraz informacja kto oddał / nie oddał (operator: `votedUserIds`, przewodniczący:
      "nie głosowali"). Wynik od razu po zamknięciu. Panel operatora: "Rozkład głosów tajnych będzie
      dostępny po zamknięciu głosowania".
- [x] **Zerowanie głosu tajnego** (operator, zgłoszona pomyłka): panel "Zeruj głos uczestnika
      (pomyłka)" w trwającym tajnym głosowaniu. Treść głosu zapisywana przy markerze ZASZYFROWANA
      (`SecretBallotMarker.resetPayload`, `lib/secretReset.ts`) wyłącznie na czas głosowania -
      zamknięcie, przerwanie i anulowanie ją usuwają. Treść nie jest nikomu pokazywana; wpis
      `VOTE_BALLOT_RESET` w dzienniku (bez treści). Uczestnik może zagłosować ponownie.
- [x] **Sesje (SA-04)**: rejestr sesji `UserSession` (token niesie `sid`), weryfikacja przy każdym
      żądaniu (middleware w runtime Node.js). Dezaktywacja, zmiana roli, reset hasła i wylogowanie
      działają natychmiast; zmiana własnego hasła kończy pozostałe sesje. Limit bezczynności
      (Ustawienia, domyślnie 240 min) liczy tylko aktywność użytkownika (`SessionKeeper`,
      `/api/session/activity`), nie SSE ani odpytywanie. Opcja "Wyloguj radnych po zamknięciu
      posiedzenia" (domyślnie wyłączona) - nie dotyczy osób w innym trwającym posiedzeniu.
- [x] **Logowanie (SA-05)**: limity nieudanych prób konto+IP (8), konto (30), IP (150) w 15 min -
      poprawne logowania wielu radnych z jednego IP sali nie są liczone. Stały czas odpowiedzi
      (hash-atrapa), dziennik prób `LoginAttempt`, wpis `LOGIN_LOCKED`. Hasła min. 8 znaków;
      hasło nadane przez operatora = hasło startowe -> wymuszona zmiana na stronie konta.
- [x] **Przekierowanie po logowaniu (SA-06)**: tylko ścieżki wewnętrzne.
- [x] **Ekran i nakładka (SA-07)**: token ekranu `Meeting.displayToken` w linkach z panelu
      (`?t=`, zapamiętywany w ciasteczku HttpOnly); bez tokenu tylko operator / uczestnik
      posiedzenia. "Nowy link ekranu (unieważnij stary)". PIN na ekranie bez zmian. Cache
      odpowiedzi 1 s, czyszczony każdym zdarzeniem posiedzenia, `no-store`; limit 900/min/IP.
- [x] SA-08 (`formal-motions` tylko uczestnik/prowadzący, bez zapisu w GET), SA-09 (kod
      instalacyjny kreatora, atomowy setup, logo sprawdzane po treści), SA-10 (błędy bez szczegółów
      technicznych), SA-11 (hasło SMTP szyfrowane `APP_ENCRYPTION_KEY`, nie trafia do przeglądarki
      ani dziennika; stare wpisy dziennika oczyszczone), SA-12 (audyt zmian kont, usunięcia
      uczestnika, sprawdzenia obecności, blokad logowania).
- [x] **Migracja (SA-13)**: `scripts/migrate.sh` - migracje danych przed/po `prisma db push` BEZ
      `--accept-data-loss` (start zatrzymuje się, jeśli zmiana usuwałaby dane).
- [x] **BR-1**: usunięte `holdResults`/publikacja wyników (UI, API `/votes/[id]/publish`, logika);
      kolumny zostają w bazie jako dane historyczne (bez użycia).
- [x] **BR-3**: otwarcie głosowania i zamknięcie posiedzenia pod blokadą wiersza posiedzenia
      (jedno otwarte głosowanie w posiedzeniu; głosowanie tylko w posiedzeniu otwartym / w toku /
      przerwanym); "Utwórz i otwórz" idzie tą samą ścieżką co "Otwórz" (migawka składu).
- [x] **BR-5**: rola konta CHAIRPERSON usunięta (migracja kont do PARTICIPANT, przypisania
      przewodniczących w posiedzeniach bez zmian).
- [x] **Utwardzenie**: CSP i nagłówki (Next + Caddy), sprawdzanie Origin dla zmian stanu, limit
      połączeń SSE, CSV bez formuł, e-maile z escapowaniem, adres w e-mailach z `NEXTAUTH_URL`,
      retencja dzienników (Ustawienia, domyślnie bez usuwania), szyfrowane kopie
      (`scripts/backup.sh`, `scripts/restore.sh`), Node 22 w obrazie, `npm ci`, sumy fontów
      (`scripts/pin-fonts.sh`), wymagane hasła w docker-compose, CI (`.github/workflows/ci.yml`).
- [x] Zależności: Next 15.5.27, next-auth 5.0.0-beta.32, nodemailer 10.0.14 (override),
      usunięte nieużywane jspdf / jspdf-autotable / html2canvas.
- Sprawdzone: `tests/security/audit-probes.mjs` 43/43, `tests/e2e/booth-mode.spec.ts` 7/7,
  eksporty PDF/DOCX/CSV i ekrany bez naruszeń CSP, migracja stanu sprzed zmian i instalacja od zera,
  odtworzenie szyfrowanej kopii. Szczegóły: SECURITY_AUDIT.md, rozdz. 8.

## AAW. Kolor planszy, łagodny gong, nowe czcionki prezentacji

- [x] **Plansza reprezentacyjna**: własny kolor (`Settings.boardColor`, `#RRGGBB`; puste = kolor nagłówka
      prezentacji) - Ustawienia, sekcja planszy: „Kolor nagłówka prezentacji” / „Własny kolor”. Kontrast
      tekstu pilnowany jak dotąd (`boardBackgroundColor`).
- [x] **Gong po przekroczeniu czasu**: łagodny gong z dwóch współbrzmiących tonów (C5 + G4), trzy uderzenia co 1,1 s
      (zastąpił wcześniejszy dwuton E5 -> C5: miękkie wejście 30 ms, wybrzmienie,
      filtr dolnoprzepustowy, bez przesterowania), ok. 1,3 s do wyciszenia.
- [x] **Czcionki prezentacji i transmisji** (`src/lib/presentationFonts.ts`, wspólna lista): Clarity City,
      Barlow, Public Sans, Arimo, Nunito Sans, Titillium Web, Zalando Sans, Manrope, Mona Sans,
      Instrument Sans, Rethink Sans, Ubuntu Sans, Archivo, Familjen Grotesk, Poppins (Google Fonts)
      oraz Tahoma (systemowa Windows, poza Windows zamienniki).
- Sprawdzone w przeglądarce: kolor planszy na ekranie sali, ładowanie każdej z 15 czcionek z Google Fonts,
  obwiednia gongu (OfflineAudioContext: szczyt 0,39, wybrzmienie do -40 dB po 1,37 s).

## AAX. Przygotowanie do publicznego udostępnienia

- [x] **Porządki**: usunięte pliki z danymi konkretnej instalacji lub nieaktualne (`DEPLOY.md`, `PLAN.md`,
      `INSTRUKCJA-DEPLOY.md`, `clean-seed.sql`, `reset-data.sql`, `migrate-remove-formal.sql` - logika
      przeniesiona idempotentnie do `pre-push.sql`, `scripts/pin-fonts.sh`, nieaktualny
      `tests/e2e/operator-flow.spec.ts`); `.gitignore` i nowy `.dockerignore` (bez `.env`, kopii, kluczy).
- [x] **Fonty Lato w repozytorium** (`public/fonts/`, OFL) - obraz nie pobiera niczego w czasie budowy.
- [x] **Konfiguracja**: `.env.example` z opisem każdej zmiennej; `scripts/check-env.sh` (host: wartości
      przykładowe, zgodność `NEXTAUTH_URL`/`DOMAIN`, znaki hasła bazy, zgodność z działającą bazą,
      uprawnienia `.env`) i `scripts/check-env.mjs` (start kontenera - błąd = czytelny komunikat, bez
      wypisywania sekretów); `docker-compose.yml` wymaga `NEXTAUTH_URL`; healthcheck `/api/health`;
      `docker-compose.dev.yml` (baza tylko dla `npm run dev`); `migrate.sh` czyta `.env` poza kontenerem.
- [x] **Aktualizacja jednym poleceniem**: `scripts/update.sh` (kontrola .env -> szyfrowana kopia ->
      `git pull --ff-only` -> budowa -> oczekiwanie na gotowość; przerywa przy lokalnych zmianach plików).
      `scripts/adopt-existing.sh` przenosi instalację z paczki na git z zachowaniem wolumenów (nowa wersja
      budowana, gdy stara działa - przerwa ok. 40 s).
      `restore.sh` odtwarza pliki bez działającej aplikacji (`docker compose run`).
- [x] `instrumentation.ts` + `instrumentation-node.ts` - `next dev` bez błędu kompilacji edge (`crypto`).
- [x] **Dokumentacja**: nowy `README.md`, `INSTALACJA.md` (jedna ścieżka krok po kroku z wynikami
      i sprawdzeniami, próba lokalna, aktualizacja, kopie i odtworzenie, logi, klucze, problemy,
      operacje usuwające dane), `SECURITY.md`, `CONTRIBUTING.md`, `THIRD-PARTY-NOTICES.md`, szablon
      zgłoszenia błędu; `docs/OPERATOR.md` poprawiony (głosowanie tajne, typy głosowań, hasła, bez
      nieistniejących bloków i listy skrótów); notatki z adresem serwera i domeną usunięte z repozytorium.
- [x] `tests/smoke/fresh-install.mjs` - test dymny świeżej instalacji; CI sprawdza też skrypty powłoki
      i plik compose.
- Sprawdzone w Docker Compose pod adresem innym niż produkcyjny (`http://obrady.test` przez Caddy), na
      świeżym klonie wg INSTALACJA.md: kroki 3-7, test dymny 24/24 (kreator z kodem, logowanie,
      ciasteczko HttpOnly, wymuszona zmiana hasła, karta głosowania w czasie rzeczywistym, głosowanie
      jawne i tajne z ukrytym rozkładem, załączniki z kontrolą dostępu, logo w wolumenie, ekran z tokenem,
      unieważnienie sesji), kopia i odtworzenie wg instrukcji, `update.sh` z `git pull` (dane zachowane,
      ochrona przed lokalnymi zmianami), `adopt-existing.sh` na symulowanej starej instalacji (te same
      wolumeny, logowanie istniejącym kontem), wykrywanie niezgodności `.env`, `npm run dev`.
- Niesprawdzone: krok `apk add` w `Dockerfile` (serwery pakietów Alpine zablokowane w środowisku testowym
  - budowano wariant bez tej linii), HTTPS / Let's Encrypt (brak domeny publicznej), cron.

## AAY. Przełącznik limitu czasu wystąpień

- [x] **Lista mówców w punkcie**: przełącznik „Limit / Bez limitu” w nagłówku listy - dotyczy całej listy
      (oczekujący i przemawiający), stan zapamiętywany na całe posiedzenie (`Meeting.speechLimitEnabled`),
      więc kolejne punkty startują z tym samym ustawieniem.
- [x] **Wnioski formalne**: taki sam przełącznik dla kolejki (`Meeting.formalMotionLimitEnabled`), niezależny
      od listy w punkcie.
- [x] **Każde wystąpienie**: własny przełącznik (`SpeakerListEntry.limitEnabled`), domyślnie równy
      przełącznikowi listy; działa także w trakcie wystąpienia. Wyłączony limit = `timeLimitSec` puste,
      wartość czeka w `savedLimitSec` i wraca po ponownym włączeniu.
- [x] Bez limitu czas liczy się w górę: panel operatora, ekran sali, widok przewodniczącego, panel radnego
      i nakładka transmisji (dotąd bez limitu nie pokazywała zegara). Gong tylko przy limicie.
- Sprawdzone (serwer deweloperski, dane syntetyczne): stan domyślny, wyłączenie listy, dziedziczenie przez
  nowe wpisy, włączenie pojedynczego wpisu, powrót wartości limitu, pamięć w następnym punkcie, kolejka
  wniosków niezależna od listy, liczenie w górę na ekranie sali i w panelu operatora.

## AAZ. Plansza w trybach prezentacji, białe logo, czcionki, planowane limity, poprawki

- [x] **Plansza reprezentacyjna jako tryb**: pozycja „Plansza reprezentacyjna” na liście trybów ekranu
      (zamiast osobnego pola z przyciskami). Wybranie innego trybu (także „Wróć do trybu auto”) ją zdejmuje,
      ponowne kliknięcie wraca do poprzedniego widoku.
- [x] **Osobna czcionka planszy** (`Settings.boardFont`, puste = czcionka prezentacji) i **Myriad Pro**
      na liście czcionek (gdy nie ma jej na komputerze ekranu - Inter).
- [x] **Logo na planszy ograniczone także szerokością**: maks. 17,2% szerokości ekranu (wzór: logo
      330 px przy 1920 px, czyli ok. 266 px przy ekranie szerokości ok. 1549 px) i jak dotąd 22% wysokości,
      z zachowaniem proporcji.
- [x] **Białe logo** (`Settings.presentationLogoLightUrl`, Ustawienia - „Logo białe (na ciemne tła)”):
      używane automatycznie na ciemnym tle - nagłówek w ciemnym kolorze, przerwa, komunikat w stylu
      transmisji, plansza (tryb „logo organizacji”), ekrany przerwy i komunikatu na transmisji.
      Bez tego pliku wszędzie logo domyślne. Niezależne od osobnego logo planszy.
- [x] **Planowane limity wypowiedzi w punktach** (`AgendaItem.speechLimitSec`, edytor porządku obrad -
      „Limit wypowiedzi”): lista mówców punktu startuje z tym limitem; zmiana planu obejmuje oczekujące
      wystąpienia; zmiana limitu listy w panelu aktualizuje plan punktu.
- [x] **Błąd: zmiana punktu z numerem na bez numeru** - API edycji punktu nie znało pola „bez numeru”
      i wymagało niepustego numeru. Poprawione (czytelny komunikat, gdy numerowany punkt nie ma numeru).
- [x] **Błąd: edycja punktu w panelu posiedzenia czyściła opinię komisji** - pole nie trafiało do edytora.
- [x] **Ekran sali / transmisja odporne na stan przeglądarki** (zgłoszenie: plansza głosowania nie
      pojawiła się w zwykłym oknie, w incognito tak). Serwer wysyła obu oknom te same dane, więc przyczyna
      leżała w przeglądarce: stary kod strony w karcie otwartej przed aktualizacją, automatyczne
      tłumaczenie strony albo rozszerzenie zmieniające treść. Zmiany: ekran przeładowuje się sam po
      aktualizacji serwera (`appVersion` w API ekranu), po błędzie rysowania samonaprawia się po 5 s
      (`ScreenGuard`), tłumaczenie przeglądarki jest wyłączone (`notranslate`).
- Sprawdzone (serwer deweloperski, dane syntetyczne): wszystkie powyższe scenariusze przez API i w przeglądarce
  (logo 1000x200 na planszy 1920x1080 -> 330x66 px, białe logo w ciemnym nagłówku i na planszy, czcionki),
  build produkcyjny.

## ABA. Instalacja na serwerze z inną aplikacją

- [x] `docker-compose.external-proxy.yml` (włączany w `.env`: `COMPOSE_FILE=docker-compose.yml:docker-compose.external-proxy.yml`):
      bez własnego Caddy, aplikacja tylko na `172.17.0.1:3100` (adres wewnętrzny Dockera; `APP_BIND`, `APP_PORT`).
      Ruch dla domeny iOBRADY przekazuje istniejący serwer WWW - blok Caddyfile i kroki: INSTALACJA.md,
      „Serwer z inną aplikacją”. Bez wspólnej sieci Dockera (obie aplikacje mają usługę `app` - wspólna sieć
      mieszałaby ruch). `./scripts/update.sh` działa bez zmian.
- Sprawdzone: symulacja serwera z drugą aplikacją i jej Caddy na porcie 80 - instalacja z czystej kopii,
  blok w cudzym Caddyfile, `caddy reload` bez przerwy drugiej aplikacji, test dymny 24/24 przez wspólny
  Caddy (w tym czas rzeczywisty), druga aplikacja odpowiada bez zmian. CI sprawdza obie konfiguracje compose.
