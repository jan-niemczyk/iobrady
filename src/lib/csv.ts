/**
 * Generator CSV bez zewnętrznych zależności.
 *
 * Cudzysłowy w wartościach są podwajane, każda wartość jest cudzysłowowana,
 * separator to średnik (";") - domyślny dla polskiego MS Excel.
 * Dodawany jest BOM UTF-8, żeby Excel poprawnie wczytał polskie znaki.
 * Wartości tekstowe zaczynające się od znaku formuły są neutralizowane apostrofem.
 */

export function toCsv(rows: (string | number | null | undefined | boolean)[][]): string {
  const escape = (v: string | number | null | undefined | boolean): string => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "boolean" ? (v ? "tak" : "nie") : String(v);
    // Neutralizacja formuł (CSV injection): tekst zaczynający się od = + - @ tab CR
    // jest poprzedzany apostrofem, by arkusz nie wykonał go jako formuły. Liczby bez zmian.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const body = rows.map((r) => r.map(escape).join(";")).join("\r\n");
  return "\uFEFF" + body;
}

export function csvResponse(filename: string, content: string): Response {
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
