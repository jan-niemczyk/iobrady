"use client";

import { Component, type ReactNode } from "react";

/**
 * Osłona ekranów bez obsługi (ekran sali, nakładka transmisji).
 * - Błąd rysowania (np. tłumaczenie strony przez przeglądarkę, rozszerzenie zmieniające treść,
 *   nietypowe dane) nie zostawia zamrożonego ani pustego ekranu: po kilku sekundach strona
 *   przeładowuje się sama i pokazuje aktualny stan.
 * - `translate="no"` wyłącza automatyczne tłumaczenie treści ekranu (podmiana tekstu przez
 *   przeglądarkę psuje aktualizacje widoku).
 */
export class ScreenGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[ekran] błąd widoku - przeładowanie za 5 s", error);
    if (!this.timer) this.timer = setTimeout(() => window.location.reload(), 5000);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    return (
      <div translate="no" className="notranslate" style={{ display: "contents" }}>
        {this.state.failed ? null : this.props.children}
      </div>
    );
  }
}

/**
 * Wersja aplikacji z odpowiedzi API ekranu: gdy serwer zostanie zaktualizowany, otwarta od dawna
 * karta ekranu przeładowuje się sama (nowy kod strony zamiast starego, niezgodnego z API).
 */
let firstVersion: string | null = null;
export function reloadOnNewVersion(version: unknown) {
  if (typeof version !== "string" || !version) return;
  if (firstVersion === null) { firstVersion = version; return; }
  if (version !== firstVersion) window.location.reload();
}
