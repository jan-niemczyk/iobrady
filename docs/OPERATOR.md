# Podręcznik operatora eSOG

Ten dokument opisuje typową ścieżkę pracy operatora podczas posiedzenia organu kolegialnego.

## Spis treści

1. [Przygotowanie posiedzenia](#1-przygotowanie-posiedzenia)
2. [Uruchomienie posiedzenia](#2-uruchomienie-posiedzenia)
3. [Lista obecności](#3-lista-obecności)
4. [Prowadzenie obrad](#4-prowadzenie-obrad)
5. [Głosowania](#5-głosowania)
6. [Listy mówców i pomiar czasu](#6-listy-mówców-i-pomiar-czasu)
7. [Komunikaty operatora](#7-komunikaty-operatora)
8. [Zamknięcie posiedzenia i raporty](#8-zamknięcie-posiedzenia-i-raporty)
9. [Sytuacje awaryjne](#9-sytuacje-awaryjne)

---

## 1. Przygotowanie posiedzenia

### 1.1 Utworzenie posiedzenia

Menu → **Posiedzenia** → **+ Nowe posiedzenie**. Wypełnij:
- **Numer** (np. `XII/2025`) - krótka sygnatura do raportów,
- **Nazwa** (np. `XII sesja Rady Miasta`),
- **Typ** (opcjonalnie, np. `sesja zwyczajna`, `komisja rewizyjna`),
- **Termin planowany**,
- **Tryb listy obecności**:
  - **Operator ręcznie** - sekretarz odhacza listę,
  - **Samodzielne potwierdzenie** - uczestnicy potwierdzają obecność z własnych urządzeń (rekomendowane dla większych ciał).

Po zapisie posiedzenie ma status **PRZYGOTOWANE**.

### 1.2 Dodanie uczestników

W panelu posiedzenia → sekcja **Lista obecności** → przycisk **Uczestnicy**. Albo bezpośrednio: `/meetings/[id]/participants`.

- W kolumnie **Dostępni** zaznacz osoby (możesz użyć **Zaznacz wszystkich widocznych**).
- Kliknij **+ Dodaj z prawem głosu** (radni, członkowie komisji) lub **+ Dodaj jako gości** (osoby zaproszone do udziału bez prawa głosu).
- Później przy każdej osobie możesz w kolumnie **Głos** / **Gość** zmienić jej status pojedynczym kliknięciem checkboxa.

**Uwaga:** Konta użytkowników (loginy i hasła) zakłada się w menu **Uczestnicy** (`/participants`). Tam też zarządzasz klubami i kołami.

### 1.3 Porządek obrad

W panelu posiedzenia → sekcja **Porządek obrad** → **Edytuj**. Otworzy się dedykowany edytor (`/meetings/[id]/agenda`):

- **+ Dodaj punkt** - wpisz numer (np. `3a`), tytuł, opcjonalnie referenta i opis.
- Strzałki **↑** / **↓** zmieniają kolejność.
- **Pomiń** ukrywa punkt jako pominięty (z możliwością przywrócenia przez edycję).
- **Usuń** możliwy tylko dla punktu o statusie *Oczekuje*.

---

## 2. Uruchomienie posiedzenia

W panelu posiedzenia kliknij **Otwórz posiedzenie**. Status zmieni się na **W TOKU**, a uczestnicy widzą posiedzenie w swoich panelach (`/session`).

---

## 3. Lista obecności

### 3.1 Tryb operatorski

Każda obecność: prawa kolumna → **Oznacz obecność**. Hurtowo: **Wszyscy obecni** lub **Wszyscy nieobecni** (dla wszystkich z prawem głosu).

Filtr klubowy nad listą pozwala szybko oznaczyć obecność wybranego klubu.

### 3.2 Tryb samodzielnego potwierdzania

1. Sekcja **Lista obecności** → **Otwórz listę**.
2. Uczestnicy w swoich panelach klikają **Potwierdzam obecność**.
3. Po zakończeniu - **Zamknij listę**.

Wskaźnik **Kworum** w górnym pasku stale pokazuje stan (zielone = spełnione, czerwone = niespełnione) z regułą obliczania pod spodem.

---

## 4. Prowadzenie obrad

W sekcji **Porządek obrad** kliknij **Rozpocznij** przy odpowiednim punkcie. Punkt staje się aktualnie rozpatrywanym (sekcja **Aktualny punkt** w lewej kolumnie).

Aby zakończyć punkt: **Zakończ punkt** w sekcji *Aktualny punkt*. System automatycznie zamyka poprzedni punkt CURRENT przy rozpoczynaniu kolejnego - nie musisz domykać ręcznie.

---

## 5. Głosowania

### 5.1 Utworzenie głosowania

Przy rozpatrywanym punkcie kliknij **+ Głosowanie do tego punktu** (lub w sekcji *Głosowanie* → **+ Nowe ad hoc**).

W formularzu:
- **Tytuł** - domyślnie pobierany z tytułu punktu, edytowalny,
- **Typ**:
  - **Standard** - za / przeciw / wstrzymuję się,
  - **Formalny** - jak Standard, oznaczony jako wniosek formalny,
  - **Lista kandydatów** - wybór jednego lub wielu z listy,
  - **Kworum** - głosowanie sprawdzające obecność (bez za/przeciw),
- **Widoczność**:
  - **Jawne** - z imienną historią głosów po zamknięciu,
  - **Tajne** - agregaty tylko, identyfikatory są anonimizowane przy zamknięciu,
- **Tryb większości** - 8 wariantów (zwykła, bezwzględna, 2/3, 3/5, od głosujących/obecnych/pełnego składu, własna).

**Dla listy kandydatów:**
- Podaj nazwiska kandydatów (po jednej w polu, **+ Dodaj** rozszerza listę).
- **Co najmniej / co najwyżej zaznaczeń** - limity wyboru.
- **Niezaznaczenie kandydata = głos PRZECIW** - taka jest semantyka, zgodna z praktyką Sejmu RP.

**Wyłączenia** (np. konflikt interesów):
- Sekcja **Wyłącz osoby z tego głosowania (N)** - rozwiń i zaznacz osoby.
- Wyłączeni są pomijani w snapshocie uprawnionych i w mianowniku liczenia większości.

**Bloki:**
- Sekcja **Przypisz do bloku** - gdy chcesz zgromadzić kilka głosowań razem (poprawki, kandydaci) z sekwencyjnym otwieraniem z `/meetings/[id]/blocks`.

**Otwórz od razu** - domyślnie zaznaczone; gdy odznaczysz, głosowanie utworzy się ze statusem PRZYGOTOWANE.

### 5.2 W trakcie głosowania

- **Pasek postępu** pokazuje liczbę oddanych kart vs liczbę obecnych z prawem głosu.
- Liczniki **Za / Przeciw / Wstrzymał się** aktualizują się w czasie rzeczywistym (co ~1,5s), **nigdy nie ujawniając** kto jak głosował.
- Uczestnicy mogą **zmieniać głos** do zamknięcia.

### 5.3 Zamknięcie głosowania

- **Zamknij głosowanie** - oblicza wynik, snapshotuje, anonimizuje dla SECRET.
- **Przerwij** - wstrzymuje (status PRZERWANE, można potraktować jako niepełne).
- **Anuluj** - odrzuca wynik (status ANULOWANE).

Po zamknięciu w liście **Ostatnie głosowania** pojawia się odznaka *Przyjęto* / *Odrzucono* oraz przyciski **Raport** (HTML w stylu wydruku Sejmu RP) i **CSV**.

### 5.4 Bloki głosowań

`/meetings/[id]/blocks`:

1. **+ Utwórz blok** - podaj nazwę (np. *Poprawki do § 4*) i ewentualnie przypisz do punktu.
2. W composerze nowego głosowania wybierz utworzony blok w sekcji **Przypisz do bloku**.
3. W widoku bloków: **Otwórz kolejne głosowanie →** otwiera następne nieotwarte głosowanie z bloku.

Bloki świetnie sprawdzają się przy serii poprawek, gdzie operator chce zachować rytm i nie musi za każdym razem otwierać composera.

---

## 6. Listy mówców i pomiar czasu

W panelu posiedzenia → środkowa kolumna → sekcja **Lista mówców**. Dostępna tylko gdy jest aktualnie rozpatrywany punkt.

### 6.1 Utworzenie listy

Dwa warianty:
- **Utwórz listę (operator dodaje)** - tylko operator zapisuje mówców,
- **Utwórz z zapisami uczestników** - uczestnicy zapisują się sami z `/session`.

### 6.2 Dodawanie mówców

Pole **- wybierz uczestnika -** → wybierz osobę → **+ Dopisz**. Lista uzupełnia się automatycznie.

### 6.3 Limit czasu

- W nagłówku listy: pole **Limit (s)** - domyślny limit w sekundach dla nowych zapisów.
- Format prezentacji: `HH:MM:SS` (countdown).
- Po przekroczeniu limitu licznik schodzi w minus (`-00:00:42`) i zmienia kolor na bordowy.

### 6.4 Sterowanie wystąpieniami

- **Start** - uruchamia stoper dla wybranego oczekującego (automatycznie domyka inne aktywne wystąpienie).
- **Zakończ** - kończy wystąpienie i zapisuje czas zużycia.
- **↑ / ↓** - przesuwanie w kolejce.
- **Usuń** - usuwa wpis (poza statusem SPEAKING).

---

## 7. Komunikaty operatora

Sekcja **Komunikaty** w prawej kolumnie:
- Wpisz treść → **Opublikuj**.
- Komunikat pojawia się natychmiast u wszystkich uczestników (z burgundową obwódką) i w historii.

Komunikat zostaje na stałe w protokole posiedzenia.

---

## 8. Zamknięcie posiedzenia i raporty

### 8.1 Zamknięcie

W górnym pasku → **Zamknij posiedzenie**. Status zmienia się na **ZAKOŃCZONE**.

### 8.2 Raporty

Menu **Raporty ▾** w nagłówku panelu posiedzenia:

| Raport | Format | Zawartość |
|---|---|---|
| **Protokół posiedzenia** | HTML do druku | Pełen oficjalny dokument: uczestnicy, kworum, agenda, wszystkie głosowania, mówcy, komunikaty, miejsce na podpisy. Eksport do PDF: `Ctrl + P` → **Zapisz jako PDF** |
| **Lista obecności** | CSV | Imię, nazwisko, klub, status obecności, czas potwierdzenia, źródło |
| **Zestawienie głosowań** | CSV | Wszystkie głosowania z wynikami i sumami |
| **Rejestr czynności** | CSV | Wszystkie akcje formalne (otwarcia, zamknięcia, głosowania, wyłączenia) |

Dodatkowo dla pojedynczego głosowania: w liście *Ostatnie głosowania* przycisk **CSV** - imienne głosy w układzie zbliżonym do wydruków Sejmu RP.

### 8.3 Archiwum

Menu główne → **Archiwum** - wszystkie zakończone posiedzenia z możliwością otwarcia panelu i pobrania raportów.

### 8.4 Rejestr czynności

Menu główne → **Rejestr** - chronologiczna lista wszystkich akcji formalnych w systemie. Każdy wpis zawiera: czas, akcję, opis, użytkownika, posiedzenie. Można filtrować po posiedzeniu (`?meeting=ID`) i eksportować do CSV.

---

## 9. Sytuacje awaryjne

### 9.1 Przeciążenie sieci u uczestnika

System używa SSE (Server-Sent Events) z automatycznym reconnect. Krótka utrata łączności u uczestnika nie powoduje utraty oddanego głosu - głos jest zapisany na serwerze i widoczny po reconnect.

### 9.2 Operator stracił połączenie w trakcie głosowania

Stan głosowania jest na serwerze - po reconnect panel pokazuje aktualny stan. Liczniki kart przeładują się automatycznie.

### 9.3 Awaria stopera mówcy

Czas wystąpienia jest server-authoritative (`startedAt` z bazy). Restart przeglądarki nie wpływa na pomiar. Stoper po prostu pokazuje `now() - startedAt`.

### 9.4 Pomyłka przy otwarciu głosowania

- Głosowanie z niepoprawnym tytułem / opcjami: **Anuluj** w trakcie głosowania, utwórz nowe.
- Pomyłka w wyłączeniach: nie da się zmienić wyłączeń po otwarciu - anuluj i utwórz na nowo.

### 9.5 Konieczność cofnięcia rozstrzygnięcia

Wyniki głosowania są niezmienne - nie ma operacji "edycji wyników". Konieczne ponowne głosowanie, jeśli walne organy stwierdzą wadliwość pierwszego.

### 9.6 Hasło użytkownika

Operator: menu **Uczestnicy** → **Edytuj** → pole **Nowe hasło**. Zmiana hasła wymaga minimum 6 znaków. Zmiana hasła operatora przez innego operatora - to samo działanie.

---

## Skróty klawiszowe (planowane w iteracji 7+)

Obecnie wszystkie akcje są dostępne myszką. Skróty klawiszowe operatora są w planach na kolejną iterację:

- `Ctrl+G` - nowe głosowanie do bieżącego punktu,
- `Ctrl+M` - nowy komunikat,
- `Spacja` - start/koniec wystąpienia mówcy,
- `Esc` - zamknięcie aktywnego modala.

---

*Dokument odpowiada wersji eSOG zawierającej iteracje 1-6.*
