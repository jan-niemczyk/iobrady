import { useEffect } from "react";

export interface Hotkey {
  /** Klawisz (e.key), np. "z", "Enter", "ArrowLeft", "+". Porównanie bez rozróżniania wielkości liter. */
  key: string;
  /** Wymagany Shift (domyślnie: obojętne = false). */
  shift?: boolean;
  /** Akcja do wykonania. */
  action: () => void;
  /** Krótki opis (do panelu pomocy / aria). */
  description?: string;
  /** Czy skrót jest aktualnie aktywny (np. tylko gdy trwa głosowanie). */
  enabled?: boolean;
}

/**
 * Rejestruje skróty klawiszowe w sposób bezpieczny:
 *  - skróty NIE działają, gdy fokus jest w polu tekstowym / textarea / select / contentEditable
 *    (żeby nie kolidowały z pisaniem),
 *  - dopasowanie klawisza jest niewrażliwe na wielkość liter,
 *  - modyfikatory Ctrl/Meta/Alt są ignorowane (skróty aplikacji nie przechwytują skrótów przeglądarki).
 */
export function useHotkeys(hotkeys: Hotkey[], deps: unknown[] = []) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Nie przechwytuj, gdy użytkownik pisze w polu.
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return;
      }
      // Nie kolidujemy ze skrótami przeglądarki/systemu.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      for (const h of hotkeys) {
        if (h.enabled === false) continue;
        if (e.key.toLowerCase() !== h.key.toLowerCase()) continue;
        if (h.shift !== undefined && h.shift !== e.shiftKey) continue;
        // Domyślnie ignorujemy Shift TYLKO dla klawiszy literowych (Shift+Z byłby przypadkowy).
        // Dla znaków jak "+", "=", "?" Shift bywa częścią ich wpisania, więc nie blokujemy.
        const isLetter = h.key.length === 1 && /[a-z]/i.test(h.key);
        if (h.shift === undefined && isLetter && e.shiftKey) continue;
        e.preventDefault();
        h.action();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
