"use client";

import { useEffect } from "react";

/**
 * Ładuje JS Bootstrapa (dropdown/collapse/itd. - bez Poppera nie ma poprawnego
 * pozycjonowania menu, m.in. automatycznego przełączania dropdown/dropup wg
 * dostępnego miejsca). Renderowany raz w layoutach, które ładują bootstrap-scoped.css
 * (panel operatora, logowanie, konto, ekran przewodniczącego) - te same trasy, które
 * mają CSS Bootstrapa, dostają teraz też jego JS, więc np. `data-bs-toggle="dropdown"`
 * działa od razu, bez ręcznego pisania logiki otwierania/zamykania.
 */
export function BootstrapJs() {
  useEffect(() => {
    import("bootstrap/dist/js/bootstrap.bundle.min.js");
  }, []);
  return null;
}
