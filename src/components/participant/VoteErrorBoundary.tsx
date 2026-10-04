"use client";

import { Component, type ReactNode } from "react";

/**
 * Granica błędów wokół karty do głosowania (nakładka głosowań, widok mini).
 *
 * Karta wysyła głos w transakcji Reacta; przy zerwanym połączeniu `fetch` rzuca wyjątek,
 * który React 19 przekazuje do najbliższej granicy błędów - bez niej znikała cała strona.
 * Tu błąd zostaje przechwycony: pokazujemy neutralny komunikat (bez sugerowania sukcesu)
 * i po chwili montujemy kartę od nowa - ona sama pobiera stan z serwera. Jeśli głos został
 * przyjęty, karta już się nie pojawi; jeśli nie, wraca i można ponowić wysłanie.
 * Ponowienie jest bezpieczne: serwer przyjmuje co najwyżej jeden głos danej osoby.
 */
export class VoteErrorBoundary extends Component<
  { children: ReactNode; onRecover?: () => void; fullScreen?: boolean },
  { failed: boolean; generation: number }
> {
  state = { failed: false, generation: 0 };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.setState((s) => ({ failed: false, generation: s.generation + 1 }));
      this.props.onRecover?.();
    }, 2000);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    if (this.state.failed) {
      const box = (
        <div className="pt-panel" role="status" aria-live="polite">
          <div className="pt-panel-body pt-booth">
            <p className="pt-booth-msg">Brak potwierdzenia z serwera</p>
            <p className="pt-booth-sub">Połączenie zostało przerwane. Sprawdzam, czy głos został przyjęty…</p>
          </div>
        </div>
      );
      if (!this.props.fullScreen) return box;
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--color-paper)", overflowY: "auto", padding: "20px 16px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>{box}</div>
        </div>
      );
    }
    // Nowy klucz po błędzie = świeży montaż karty i ponowne pobranie stanu z serwera.
    return <div key={this.state.generation} style={{ display: "contents" }}>{this.props.children}</div>;
  }
}
