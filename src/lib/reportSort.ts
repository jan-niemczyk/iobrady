import { comparePl } from "@/lib/sortPl";
import type { ReportMark, ReportPerson } from "@/lib/reportTypes";

/**
 * Porządek imiennych list w raportach głosowań: najpierw według kategorii głosu, potem
 * alfabetycznie po nazwisku i imieniu (polska kolejność liter), a przy identycznym imieniu
 * i nazwisku - według stałego numeru porządkowego osoby (`seq`), więc wynik jest powtarzalny.
 *
 * Kategorie: za, przeciw, wstrzymało się, brak głosu (ng.), nieobecność (nb.); osoby wyłączone
 * (wykl.) zawsze na końcu, jako osobna kategoria raportu.
 */
export const MARK_RANK: Record<string, number> = { "za": 1, "pr.": 2, "ws.": 3, "ng.": 4, "ob.": 4, "nb.": 5, "nieob.": 5, "wykl.": 6 };

export function compareByName(a: ReportPerson, b: ReportPerson): number {
  return comparePl(a.lastName, b.lastName) || comparePl(a.firstName, b.firstName) || (a.seq ?? 0) - (b.seq ?? 0);
}

/** Kategoria osoby przy pozycji pakietu `pi`: głos oddany na TĘ pozycję, a nie znacznik całego pakietu. */
export function markAtPosition(p: ReportPerson, pi: number): ReportMark {
  if (p.mark === "wykl.") return "wykl.";
  if (!p.present || p.mark === "nb.") return "nb.";
  return p.perPosition?.[pi] ?? "ng.";
}

/**
 * Lista osób dla jednej pozycji pakietu: osobno dla każdej pozycji według głosu na nią
 * (osoba może być „za" przy pierwszej i „przeciw" przy drugiej). Sortowanie nie zmienia
 * przypisania głosów, numeracji pozycji ani wyników liczbowych.
 */
export function sortForPosition(people: ReportPerson[], pi: number): ReportPerson[] {
  return [...people].sort((a, b) =>
    (MARK_RANK[markAtPosition(a, pi)] ?? 9) - (MARK_RANK[markAtPosition(b, pi)] ?? 9) || compareByName(a, b));
}
