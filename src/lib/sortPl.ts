/**
 * Sortowanie po polsku z uwzględnieniem znaków diakrytycznych.
 * Postgres bez polskiego collation umieszcza Ł/Ó/Ż za literą Z (kolejność bajtowa UTF-8),
 * przez co np. "Łuszczyk" trafia na koniec listy zamiast po "Lis".
 * Ten collator daje poprawną kolejność alfabetyczną polską.
 */
const collator = new Intl.Collator("pl", { sensitivity: "base" });

export function comparePl(a: string, b: string): number {
  return collator.compare(a ?? "", b ?? "");
}

/** Sortuje po nazwisku, potem imieniu (po polsku). */
export function sortByName<T extends { lastName?: string; firstName?: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const byLast = comparePl(a.lastName ?? "", b.lastName ?? "");
    return byLast !== 0 ? byLast : comparePl(a.firstName ?? "", b.firstName ?? "");
  });
}
