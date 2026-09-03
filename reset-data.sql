-- ════════════════════════════════════════════════════════════════
-- eSOG - czyszczenie danych przed produkcją
-- Zostawia: konto(a) z rolą OPERATOR i globalne Settings.
-- Kasuje: posiedzenia (kaskadowo: agendy, głosowania, ballots, listy
--          mówców, obecności, komunikaty), konta radnych/gości, grupy,
--          dziennik audytu.
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Wszystkie posiedzenia → kaskadowo usuwa powiązane dane
DELETE FROM "Meeting";

-- 2. Dziennik audytu (czyścimy w całości - świeży start)
DELETE FROM "AuditLog";

-- 3. Konta inne niż OPERATOR (radni, goście, przewodniczący)
DELETE FROM "User" WHERE "role" <> 'OPERATOR';

-- 4. Grupy (kluby) - po usunięciu radnych nie są już potrzebne
DELETE FROM "Group";

COMMIT;

-- Podsumowanie
SELECT 'Pozostałe konta:' AS info, COUNT(*) AS liczba FROM "User"
UNION ALL
SELECT 'Pozostałe posiedzenia:', COUNT(*) FROM "Meeting"
UNION ALL
SELECT 'Pozostałe grupy:', COUNT(*) FROM "Group";
