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
      `reset-data.sql` (esog/eSOG -> iobrady/iOBRADY/example.local). `CLAUDE.md`/`DEPLOY.md` z
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
