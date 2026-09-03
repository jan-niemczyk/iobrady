-- Migracja: usunięcie typu FORMAL z głosowań (punkt 16)
-- Zamienia istniejące głosowania FORMAL na STANDARD przed zmianą enuma.
-- Uruchom PRZED prisma db push (inaczej push odrzuci nieznaną wartość enuma).
UPDATE "Vote" SET "type" = 'STANDARD' WHERE "type" = 'FORMAL';
