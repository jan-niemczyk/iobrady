/**
 * Tajność rozkładu głosów (SA-01).
 *
 * W głosowaniu TAJNYM rozkład (ZA/PRZECIW/WSTRZ/nieważne, głosy na kandydatów, wyniki pozycji pakietu)
 * jest dostępny wyłącznie po ZAMKNIĘCIU głosowania - także dla operatora. Wcześniej (otwarte,
 * przerwane, anulowane, przygotowane) serwer zwraca tylko łączną liczbę oddanych kart oraz
 * informację, kto oddał / nie oddał głosu (sam fakt oddania nie jest tajny).
 *
 * Przyrost licznika przy znanej osobie, która właśnie zagłosowała, zdradzałby jej wybór -
 * dlatego maskowanie dotyczy KAŻDEGO głosowania tajnego, nie tylko trybu kotarkowego.
 * Głosowania jawne nie podlegają maskowaniu (głosowanie jawne jest jawne).
 */
export function secretTallyHidden(v: { visibility: string; status: string }): boolean {
  return v.visibility === "SECRET" && v.status !== "CLOSED";
}
