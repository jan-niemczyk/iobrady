import type { Prisma } from "@prisma/client";

type Item = { id: string; number: string; isSubItem: boolean; unnumbered: boolean };

/**
 * Nowe numery punktów wg kolejności: zwykłe 1, 2, 3…, podpunkty 3.1, 3.2…, punkty bez numeru
 * pomijane (pusty numer, nie zmieniają licznika). Zwraca tylko zmiany.
 */
export function computeAgendaNumbers(items: Item[]): { id: string; number: string }[] {
  let main = 0, sub = 0;
  const updates: { id: string; number: string }[] = [];
  for (const it of items) {
    if (it.unnumbered) {
      if (it.number !== "") updates.push({ id: it.id, number: "" });
      continue;
    }
    let n: string;
    if (it.isSubItem && main > 0) { sub++; n = `${main}.${sub}`; }
    else { main++; sub = 0; n = String(main); }
    if (n !== it.number) updates.push({ id: it.id, number: n });
  }
  return updates;
}

/**
 * Czy porządek jest numerowany automatycznie (same liczby 1, 2… i podpunkty 2.1…), a nie ręcznie
 * (np. "3a", "IV"). Tylko wtedy po przesunięciu punktu odświeżamy numery - ręcznej numeracji nie ruszamy.
 * Punkty bez numeru nie przeszkadzają.
 */
export function isAutoNumbered(items: Item[]): boolean {
  return items.filter((i) => !i.unnumbered).every((i) => /^\d+(\.\d+)?$/.test(i.number));
}

export async function renumberIfAuto(tx: Prisma.TransactionClient, meetingId: string, wasAuto: boolean) {
  if (!wasAuto) return;
  const all = await tx.agendaItem.findMany({ where: { meetingId }, orderBy: { order: "asc" } });
  for (const u of computeAgendaNumbers(all)) {
    await tx.agendaItem.update({ where: { id: u.id }, data: { number: u.number } });
  }
}
