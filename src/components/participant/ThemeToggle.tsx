"use client";

import { useEffect, useState } from "react";

const KEY = "iobrady-theme";

/**
 * Przełącznik trybu czarnego dla aplikacji uczestnika.
 * Ustawia atrybut data-theme="dark" na <html> i zapamiętuje wybór w przeglądarce.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    window.localStorage.setItem(KEY, next ? "dark" : "light");
  }

  return (
    <button
      type="button" className="btn" onClick={toggle}
      title={dark ? "Przełącz na tryb jasny" : "Przełącz na tryb czarny"}
      aria-pressed={dark}
      style={{ padding: "6px 10px", fontSize: 12 }}
    >
      {dark ? "Tryb jasny" : "Tryb czarny"}
    </button>
  );
}
