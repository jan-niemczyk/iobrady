-- Usuwa dane utworzone przez seed (testowe), zachowując konta OPERATOR.
-- Bezpieczne: kasuje konkretne testowe posiedzenie, radnych i gościa po emailach seeda.
BEGIN;

-- Posiedzenie inauguracyjne z seeda (kaskadowo: agenda, głosowania, uczestnicy, listy)
DELETE FROM "Meeting" WHERE name = 'I sesja Rady Miasta';

-- Testowi radni i gość z seeda (po wzorcu email @esog.local, oprócz operatora)
DELETE FROM "User"
WHERE email LIKE '%@esog.local'
  AND role <> 'OPERATOR';

-- Testowe kluby z seeda (tylko jeśli nie mają już żadnych użytkowników)
DELETE FROM "Group"
WHERE name IN ('Klub Niezależnych', 'Klub Mieszkańców')
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."groupId" = "Group".id);

COMMIT;

SELECT 'Konta' AS co, COUNT(*) FROM "User"
UNION ALL SELECT 'Posiedzenia', COUNT(*) FROM "Meeting"
UNION ALL SELECT 'Grupy', COUNT(*) FROM "Group";
