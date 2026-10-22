/**
 * Układy tabel pdfmake w czerni. Wbudowany „lightHorizontalLines” rysuje linie szare (#aaa) -
 * wydruki są wyłącznie czarno-białe, więc zamiast niego ten sam rytm linii w czerni.
 */
export const BW_HORIZONTAL_LINES = {
  hLineWidth: (i: number, node: { table: { body: unknown[]; headerRows?: number } }) =>
    i === 0 || i === node.table.body.length ? 0 : i === (node.table.headerRows ?? 0) ? 1 : 0.5,
  vLineWidth: () => 0,
  hLineColor: () => "#000000",
  paddingLeft: (i: number) => (i === 0 ? 0 : 8),
  paddingRight: (i: number, node: { table: { widths?: unknown[] } }) => (i === (node.table.widths?.length ?? 1) - 1 ? 0 : 8),
};
