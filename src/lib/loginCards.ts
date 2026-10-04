// Generator PDF z odcinkami logowania dla uczestników.
// Każdy odcinek: imię i nazwisko, login (e-mail), hasło, adres strony logowania i kod QR (adres).
// Uwaga: hasła da się wydrukować tylko w momencie ich nadania/zresetowania (system trzyma hash).

import QRCode from "qrcode";

export interface LoginCard {
  name: string;      // imię i nazwisko
  email: string;     // login
  password: string;  // hasło (jawne - tylko w chwili nadania)
}

async function loadPdfMake() {
  const mod = await import("pdfmake/build/pdfmake");
  const pdfMake = mod.default;
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const LATO = "/fonts";
  pdfMake.fonts = {
    Lato: {
      normal: `${base}${LATO}/Lato-Regular.ttf`,
      bold: `${base}${LATO}/Lato-Bold.ttf`,
      italics: `${base}${LATO}/Lato-Italic.ttf`,
      bolditalics: `${base}${LATO}/Lato-BoldItalic.ttf`,
    },
  };
  return pdfMake;
}

/**
 * Buduje i pobiera PDF z odcinkami logowania.
 * @param cards lista kont (imię, email, hasło)
 * @param loginUrl adres strony logowania (trafia do QR i na odcinek)
 * @param fileName nazwa pliku bez rozszerzenia
 */
export async function downloadLoginCards(cards: LoginCard[], loginUrl: string, fileName = "odcinki-logowania") {
  const pdfMake = await loadPdfMake();

  // QR (ten sam adres dla wszystkich) - generujemy raz jako dataURL.
  const qrDataUrl = await QRCode.toDataURL(loginUrl, { margin: 1, width: 240 });

  const FS = 10;
  const cardBlocks = cards.map((c) => ({
    // Jeden odcinek jako tabela z jedną komórką (ramka) - trzymany w całości.
    table: {
      widths: ["*", "auto"],
      body: [[
        {
          stack: [
            { text: c.name, fontSize: FS + 3, bold: true, margin: [0, 0, 0, 4] },
            { text: `Login (e-mail): ${c.email}`, fontSize: FS, margin: [0, 0, 0, 2] },
            { text: `Hasło: ${c.password}`, fontSize: FS, bold: true, margin: [0, 0, 0, 2] },
            { text: `Strona logowania: ${loginUrl}`, fontSize: FS - 1, color: "#333", margin: [0, 2, 0, 0] },
            { text: "Zeskanuj kod QR, aby otworzyć stronę logowania.", fontSize: FS - 2, color: "#666", margin: [0, 4, 0, 0] },
          ],
          margin: [8, 8, 8, 8],
          border: [true, true, true, true],
        },
        {
          stack: [{ image: qrDataUrl, width: 90, height: 90 }],
          alignment: "center",
          margin: [8, 8, 8, 8],
          border: [true, true, true, true],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0.7,
      vLineWidth: () => 0.7,
      hLineColor: () => "#000",
      vLineColor: () => "#000",
    },
    unbreakable: true,
    margin: [0, 0, 0, 12] as [number, number, number, number],
  }));

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    content: [
      { text: "Dane do logowania", fontSize: FS + 5, bold: true, margin: [0, 0, 0, 12] as [number, number, number, number] },
      ...cardBlocks,
    ],
    defaultStyle: { font: "Lato" },
  };

  pdfMake.createPdf(docDefinition as unknown as Parameters<typeof pdfMake.createPdf>[0]).download(`${fileName}.pdf`);
}
