/**
 * Generator CSV bez zewnętrznych zależności.
 *
 * Cudzysłowy w wartościach są podwajane, każda wartość jest cudzysłowowana,
 * separator to średnik (";") - domyślny dla polskiego MS Excel.
 * Dodawany jest BOM UTF-8, żeby Excel poprawnie wczytał polskie znaki.
 */

export function toCsv(rows: (string | number | null | undefined | boolean)[][]): string {
  const escape = (v: string | number | null | undefined | boolean): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "boolean" ? (v ? "tak" : "nie") : String(v);
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
