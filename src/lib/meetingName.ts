// Formatowanie nazwy posiedzenia z datą w formie "… w dniu 15 marca 2026 r."
// Używane WSZĘDZIE poza nagłówkiem prezentacji (raporty, wydruki, ekrany).

const MONTHS_GEN = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

/** Zwraca datę w formie dopełniaczowej: "15 marca 2026". Bez "r." na końcu. */
export function formatPlDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Nazwa posiedzenia z dopiskiem daty: "II sesja Rady w dniu 15 marca 2026 r."
 * Gdy brak daty - zwraca samą nazwę. Nie duplikuje, jeśli nazwa już zawiera "w dniu".
 */
export function meetingNameWithDate(name: string, date: Date | string | null | undefined): string {
  const dt = formatPlDate(date);
  if (!dt) return name;
  if (/w dniu/i.test(name)) return name;
  return `${name} w dniu ${dt} r.`;
}

/**
 * Skleja nazwę z GOTOWYM tekstem daty (już sformatowanym, np. "15 marca 2026"), dodając
 * "w dniu ... r." tylko jeśli nazwa jeszcze tego nie zawiera. Chroni przed podwójnym "w dniu"
 * w miejscach, które mają osobno nazwę i dateText (raporty, protokoły).
 */
export function withDateText(name: string, dateText: string | null | undefined): string {
  if (!dateText) return name;
  if (/w dniu/i.test(name)) return name;
  return `${name} w dniu ${dateText} r.`;
}
