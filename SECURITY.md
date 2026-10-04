# Zgłaszanie podatności

Jeśli znajdziesz błąd bezpieczeństwa (np. dostęp do danych bez uprawnień, ujawnienie głosu tajnego,
przejęcie sesji), **nie opisuj go w publicznym zgłoszeniu (issue)**.

## Jak zgłosić

1. Na stronie repozytorium w GitHubie wejdź w zakładkę **Security** i wybierz
   **Report a vulnerability** (prywatne zgłoszenie widoczne tylko dla opiekunów projektu).
2. Jeśli ta opcja nie jest dostępna, załóż zwykłe zgłoszenie z tytułem „Prośba o kontakt w sprawie
   bezpieczeństwa” - **bez szczegółów podatności**. Opiekun odpowie w zgłoszeniu i wskaże prywatny kanał.

## Co podać

- wersję (`git rev-parse --short HEAD` w katalogu aplikacji) i sposób uruchomienia,
- kroki odtworzenia, oczekiwany i faktyczny wynik,
- wpływ: kto (rola) może co zrobić, czego nie powinien,
- czy podatność jest wykorzystywana lub znana publicznie.

Nie dołączaj danych osobowych, haseł ani kopii baz z prawdziwych instalacji - wystarczą dane testowe.

## Zasady

- Testuj wyłącznie na własnej instalacji z danymi testowymi; nie testuj cudzych instalacji.
- Zgłoszenie zostanie potwierdzone, a o terminie poprawki i publikacji informacji zdecydujemy wspólnie
  ze zgłaszającym.
- Poprawki trafiają do gałęzi `main`; instalacje aktualizuje się poleceniem `./scripts/update.sh`.

## Ryzyka zaakceptowane świadomie

Poniższe zachowania są decyzją projektową, a nie podatnością (uzasadnienie w `SECURITY_AUDIT.md`):

- PIN głosowania ma 4 cyfry, nie ma limitu prób i jest wyświetlany na ekranie sali,
- operator może oddać lub wyzerować głos w imieniu uczestnika w głosowaniu jawnym bez dodatkowego wpisu
  w dzienniku, z pominięciem zasady „pierwszy głos ostateczny”.
