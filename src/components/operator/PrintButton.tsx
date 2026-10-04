"use client";

import { useState } from "react";

// Znacznik głosu w tabeli imiennej - skróty jak w oryginalnych wydrukach.
export type PdfMark = "za" | "pr." | "ws." | "ng." | "ob.";

export interface PdfPerson {
  lastName: string;
  firstName: string;
  mark?: PdfMark;          // głosowanie standardowe
  perCandidate?: PdfMark[]; // głosowanie na listę (po jednym znaczniku na kandydata)
}

export interface PdfGroup {
  shortName: string;
  membersCount: number;
  participated: number;
  yes?: number;
  no?: number;
  abstain?: number;
  notVoted: number;
  people: PdfPerson[];
}

export interface PdfCandidate {
  label: string;
  yesCount: number;
}

// Dane raportu w układzie zbliżonym do wydruków Kancelarii Sejmu RP.
export interface PdfReportData {
  organizationName?: string;
  meetingTitle?: string;
  meetingNumber: string;
  voteNumber: number | string;
  timestamp: string;
  contextLabel: string;   // Pkt N. … / nazwa posiedzenia / kontekst ad hoc
  voteTitle: string;
  description?: string;
  summaryLine: string;    // GŁOSOWAŁO - 4 ZA - 4 …
  isList?: boolean;
  isSecret?: boolean;
  candidatesCount?: number;
  candidates?: string[];        // etykiety kandydatów (dla listy)
  candidatesSummary?: PdfCandidate[]; // wynik malejąco (dla listy)
  groups?: PdfGroup[];          // podział klubowy z imienną listą
  noSupport?: number;           // „Żadnej kandydatury nie poparło: N osób" (lista)
}

const LATO = "/fonts";

export function PrintButton({ fileName = "raport-glosowania", data }: { fileName?: string; data?: PdfReportData }) {
  const [busy, setBusy] = useState(false);

  async function generatePdf() {
    if (!data) { window.print(); return; }
    setBusy(true);
    try {
      const pdfMakeMod = await import("pdfmake/build/pdfmake");
      const pdfMake = pdfMakeMod.default;

      // pdfmake wymaga absolutnego URL - budujemy z origin bieżącej strony.
      const base = typeof window !== "undefined" ? window.location.origin : "";
      pdfMake.fonts = {
        Lato: {
          normal: `${base}${LATO}/Lato-Regular.ttf`,
          bold: `${base}${LATO}/Lato-Bold.ttf`,
          italics: `${base}${LATO}/Lato-Italic.ttf`,
          bolditalics: `${base}${LATO}/Lato-BoldItalic.ttf`,
        },
      };

      const FS = 9; // jeden rozmiar czcionki w całym dokumencie
      const content: Record<string, unknown>[] = [];

      // Nazwa organu / kadencja na górze (jak „X kadencja Sejmu RP")
      if (data.organizationName) content.push({ text: data.organizationName, fontSize: FS, margin: [0, 0, 0, 2] });
      // Tytuł (jak w oryginale: Posiedzenie X - głosowanie nr Y (data))
      content.push({ text: `Posiedzenie ${data.meetingNumber} - głosowanie nr ${data.voteNumber} (${data.timestamp})`, fontSize: FS, bold: true, margin: [0, 0, 0, 2] });
      // Punkt / kontekst
      content.push({ text: data.contextLabel, fontSize: FS, margin: [0, 2, 0, 2] });
      if (data.voteTitle && data.voteTitle !== data.contextLabel)
        content.push({ text: data.voteTitle, fontSize: FS, margin: [0, 0, 0, 2] });
      if (data.description) content.push({ text: data.description, fontSize: FS, margin: [0, 0, 0, 2] });
      if (data.isList && data.candidatesCount) content.push({ text: `${data.candidatesCount} kandydatów`, fontSize: FS, margin: [0, 0, 0, 4] });

      // Podsuma jednowierszowa
      content.push({ text: data.summaryLine, fontSize: FS, bold: true, margin: [0, 2, 0, 6] });

      // Lista kandydatów (dla listy) - „Kandydaci wg kolejności na liście"
      if (data.isList && data.candidates && data.candidates.length > 0) {
        content.push({ text: "Kandydaci według kolejności na liście do głosowania:", fontSize: FS, margin: [0, 2, 0, 2] });
        content.push({
          ol: data.candidates.map((c) => ({ text: c, fontSize: FS })),
          margin: [0, 0, 0, 6],
        });
      }

      // Bloki klubowe z imienną listą
      if (!data.isSecret && data.groups && data.groups.length > 0) {
        for (const g of data.groups) {
          const head = data.isList
            ? `${g.shortName}(${g.membersCount}) GŁOSOWAŁO - ${g.participated} NIE GŁOSOWAŁO - ${g.notVoted}`
            : `${g.shortName}(${g.membersCount}) GŁOSOWAŁO - ${g.participated} ZA - ${g.yes ?? 0} PRZECIW - ${g.no ?? 0} WSTRZYMAŁO SIĘ - ${g.abstain ?? 0} NIE GŁOSOWAŁO - ${g.notVoted}`;
          content.push({ text: head, fontSize: FS, bold: true, margin: [0, 6, 0, 3] });

          if (data.isList) {
            // Tabela: Lp | Nazwisko Imię | kolumny kandydatów 1..N ze znacznikami
            const nCand = data.candidatesCount ?? (g.people[0]?.perCandidate?.length ?? 0);
            const header = [
              { text: "Lp.", fontSize: FS, bold: true },
              { text: "Głosowali", fontSize: FS, bold: true },
              ...Array.from({ length: nCand }, (_, i) => ({ text: String(i + 1), fontSize: FS, bold: true, alignment: "center" })),
            ];
            const rows = g.people.map((p, idx) => [
              { text: String(idx + 1), fontSize: FS },
              { text: `${p.lastName} ${p.firstName}`, fontSize: FS },
              ...Array.from({ length: nCand }, (_, i) => ({ text: p.perCandidate?.[i] ?? "", fontSize: FS, alignment: "center" })),
            ]);
            content.push({
              table: { headerRows: 1, widths: ["auto", "*", ...Array.from({ length: nCand }, () => "auto")], body: [header, ...rows] },
              layout: "lightHorizontalLines",
              margin: [0, 0, 0, 4],
            });
          } else {
            // Układ dwukolumnowy jak w oryginale: NAZWISKO IMIĘ + głos, bez ramek.
            const cells = g.people.map((p) => ({
              columns: [
                { text: `${p.lastName} ${p.firstName}`.toUpperCase(), fontSize: FS, width: "*" },
                { text: p.mark ?? "", fontSize: FS, width: 24, alignment: "right" },
              ],
              columnGap: 4,
              margin: [0, 0.5, 0, 0.5] as [number, number, number, number],
            }));
            // Rozbij na 2 kolumny (lewa/prawa), wierszami z góry na dół.
            const half = Math.ceil(cells.length / 2);
            const left = cells.slice(0, half);
            const right = cells.slice(half);
            content.push({
              columns: [
                { stack: left, width: "*" },
                { stack: right, width: "*" },
              ],
              columnGap: 24,
              margin: [0, 0, 0, 4],
            });
          }
        }
      }

      // Wynik końcowy dla listy - kandydaci malejąco
      if (data.isList && data.candidatesSummary && data.candidatesSummary.length > 0) {
        content.push({ text: "Wynik głosowania", fontSize: FS, bold: true, pageBreak: "before", margin: [0, 0, 0, 4] });
        content.push({ text: data.summaryLine, fontSize: FS, bold: true, margin: [0, 0, 0, 4] });
        const sorted = [...data.candidatesSummary].sort((a, b) => b.yesCount - a.yesCount);
        for (const c of sorted) {
          content.push({ text: `${c.label}  ${c.yesCount} głosów`, fontSize: FS, margin: [0, 0, 0, 1] });
        }
        if (data.noSupport != null)
          content.push({ text: `Żadnej kandydatury nie poparło: ${data.noSupport} osób`, fontSize: FS, margin: [0, 4, 0, 0] });
      }

      const docDefinition = {
        content,
        defaultStyle: { font: "Lato", fontSize: FS },
        pageMargins: [40, 48, 40, 40] as [number, number, number, number],
        // Nagłówek strony jak w oryginale: "Posiedzenie nr X/ głosowanie nr Y   Strona N z M"
        header: (currentPage: number, pageCount: number) => ({
          margin: [40, 20, 40, 0],
          columns: [
            { text: `Posiedzenie nr ${data.meetingNumber}/ głosowanie nr ${data.voteNumber}`, fontSize: 8 },
            { text: `Strona ${currentPage} z ${pageCount}`, fontSize: 8, alignment: "right" },
          ],
        }),
        info: { title: fileName },
      };

      pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
    } catch {
      window.print();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn btn-primary" disabled={busy} onClick={generatePdf}>
      {busy ? "Generowanie…" : "Pobierz PDF"}
    </button>
  );
}
