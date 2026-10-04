# Zgłaszanie błędów i zmian

## Błąd

Załóż zgłoszenie (issue) na GitHubie. Podaj:

- wersję (`git rev-parse --short HEAD`) i sposób uruchomienia (instalacja wg INSTALACJA.md, próba lokalna, `npm run dev`),
- rolę (operator, uczestnik, przewodniczący, ekran sali, nakładka) i przeglądarkę,
- kroki odtworzenia, oczekiwany i faktyczny wynik,
- fragment logów, jeśli dotyczy: `docker compose logs app --tail=200`.

Przed wklejeniem logów usuń adresy e-mail, nazwiska, adresy IP i domenę instalacji.
Nie wklejaj zawartości `.env`. Błędy bezpieczeństwa zgłaszaj zgodnie z [SECURITY.md](SECURITY.md).

## Zmiana w kodzie

- Język interfejsu, komunikatów i komentarzy: polski. Bez myślników typograficznych - zwykły dywiz `-`.
- Komunikaty dla użytkownika przez `@/lib/feedback` (bez `alert`/`confirm`/`prompt`).
- Zmiany schematu bazy: nowe pola z wartością domyślną albo opcjonalne; zmiany usuwające dane tylko jako
  jawna migracja w `prisma/data-migrations/pre-push.sql`.
- Przed wysłaniem: `npx tsc --noEmit`, `npm run build`; przy zmianach uprawnień i głosowań także
  `npm run test:security` i `npx playwright test` (opis w README.md, sekcja „Praca nad kodem”).
- Do testów używaj wyłącznie danych syntetycznych.
