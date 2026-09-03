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
