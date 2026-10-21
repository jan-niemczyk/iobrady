import path from "path";

/**
 * Generowanie PDF po stronie serwera (pdfmake, czcionka Lato z public/fonts) - dla dokumentów,
 * których bezpośredni adres pobrania musi egzekwować uprawnienia (raporty, interpelacje).
 */
type DocDefinition = Record<string, unknown>;

export async function renderPdf(doc: DocDefinition): Promise<Buffer> {
  // pdfmake ładowany dynamicznie (pakiet zewnętrzny serwera - next.config serverExternalPackages).
  const mod = await import("pdfmake");
  const PdfPrinter = (mod as unknown as { default: new (fonts: unknown) => { createPdfKitDocument: (d: unknown) => NodeJS.ReadableStream & { end: () => void } } }).default;
  const dir = path.join(process.cwd(), "public", "fonts");
  const printer = new PdfPrinter({
    Lato: {
      normal: path.join(dir, "Lato-Regular.ttf"),
      bold: path.join(dir, "Lato-Bold.ttf"),
      italics: path.join(dir, "Lato-Italic.ttf"),
      bolditalics: path.join(dir, "Lato-BoldItalic.ttf"),
    },
  });
  const pdf = printer.createPdfKitDocument({ defaultStyle: { font: "Lato", fontSize: 10 }, ...doc });
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.end();
  });
}

/** Odpowiedź z plikiem do pobrania (nazwa z polskimi znakami wg RFC 6266). */
export function fileResponse(buf: Buffer, fileName: string, contentType: string): Response {
  const ascii = fileName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/[^A-Za-z0-9._ ()-]/g, "_");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};
