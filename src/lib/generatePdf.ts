"use client";

import type { ReportData, ReportGroup } from "@/lib/reportTypes";
import { withDateText } from "@/lib/meetingName";

const LATO = "/fonts";
const FS = 9;

// Czarno-białe, cienkie linie poziome między wierszami (zamiast szarych domyślnych).
const BW_LINES = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
  vLineWidth: () => 0,
  hLineColor: () => "#000000",
  paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2,
};

// Wiersz podsumy głównej: pozycje rozdzielone większym odstępem (kolumny).
function summaryRow(parts: string[]): Record<string, unknown> {
  return {
    columns: parts.map((t) => ({ text: t, fontSize: FS, bold: true, width: "auto" })),
    columnGap: 18,
    margin: [0, 2, 0, 2],
  };
}

// Nagłówek bloku klubowego - jeden wiersz tekstu z odstępami (spacje).
function groupHead(g: ReportGroup, isListLike: boolean, isQuorum: boolean): Record<string, unknown> {
  const SEP = "\u00A0\u00A0\u00A0\u00A0"; // 4 niełamiące spacje jako odstęp
  let parts: string[];
  if (isQuorum) {
    parts = [`${g.shortName} (${g.membersCount})`, `OBECNYCH - ${g.participated}`, `NIEOBECNI - ${g.absent}`];
  } else {
    parts = [`${g.shortName} (${g.membersCount})`, `GŁOSOWAŁO - ${g.participated}`];
    // ZA/PRZECIW/WSTRZYM. tylko dla zwykłych głosowań. Lista i pakiet mają wyniki per pozycja/kandydat.
    if (!isListLike) {
      parts.push(`ZA - ${g.yes ?? 0}`);
      parts.push(`PRZECIW - ${g.no ?? 0}`);
      parts.push(`WSTRZYMAŁO SIĘ - ${g.abstain ?? 0}`);
    }
    parts.push(`NIE GŁOSOWAŁO - ${g.notVoted}`);
    parts.push(`NIEOBECNI - ${g.absent}`);
  }
  return { text: parts.join(SEP), fontSize: FS, bold: true, margin: [0, 8, 0, 4] };
}

// Dzieli tablicę na porcje po n.
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function reportContent(data: ReportData): Record<string, unknown>[] {
  const c: Record<string, unknown>[] = [];
  const showClub = data.groupsEnabled !== false;

  // Nazwa organu i nazwa posiedzenia - osobne linie (zwykły tekst, bez pogrubienia i kursywy)
  if (data.organizationName) c.push({ text: data.organizationName, fontSize: FS, margin: [0, 0, 0, 2] });
  if (data.meetingTitle) c.push({ text: data.meetingTitle, fontSize: FS, margin: [0, 0, 0, 4] });

  // Posiedzenie nr X - głosowanie nr Y (data z sekundami) - pogrubione, bez kursywy
  c.push({ text: `Posiedzenie nr ${data.meetingNumber} - głosowanie nr ${data.voteNumber} (${data.timestamp})`, fontSize: FS, bold: true, margin: [0, 0, 0, 8] });

  if (data.isSecret) c.push({ text: "Głosowanie tajne", fontSize: FS, bold: true, margin: [0, 0, 0, 6] });

  // Kontekst (Pkt / nazwa posiedzenia / tekst ad hoc)
  c.push({ text: data.contextLabel, fontSize: FS, margin: [0, 0, 0, 6] });
  if (data.voteTitle && data.voteTitle !== data.contextLabel) c.push({ text: data.voteTitle, fontSize: FS, margin: [0, 0, 0, 6] });
  if (data.description) c.push({ text: data.description, fontSize: FS, margin: [0, 0, 0, 6] });
  if (data.isList && data.candidatesCount) c.push({ text: `${data.candidatesCount} kandydatów`, fontSize: FS, margin: [0, 0, 0, 6] });

  // Zbiorcza podsuma. Zwykłe głosowania: ZA/PRZECIW/WSTRZYM. Lista: frekwencja
  // (GŁOSOWAŁO / NIE GŁOSOWAŁO / NIEOBECNI) - jak w dawnym układzie. Pakiet: własny nagłówek niżej.
  if (!data.isPackage) {
    if (data.summaryParts && data.summaryParts.length) {
      c.push(summaryRow(data.summaryParts));
    } else {
      c.push({ text: data.summaryLine, fontSize: FS, bold: true, margin: [0, 2, 0, 2] });
    }
    if (data.majorityPart) c.push({ text: data.majorityPart, fontSize: FS, bold: true, margin: [0, 2, 0, 8] });
    else c.push({ text: "", margin: [0, 0, 0, 6] });
  }

  // Lista kandydatów - w kilku kolumnach
  if (data.isList && data.candidates && data.candidates.length > 0) {
    c.push({ text: "Kandydaci według kolejności na liście:", fontSize: FS, margin: [0, 2, 0, 3] });
    const cols = 3;
    const perCol = Math.ceil(data.candidates.length / cols);
    const columns = chunk(data.candidates.map((cand, i) => `${i + 1}. ${cand}`), perCol)
      .map((col) => ({ stack: col.map((t) => ({ text: t, fontSize: FS, margin: [0, 0.5, 0, 0.5] })), width: "*" }));
    c.push({ columns, columnGap: 16, margin: [0, 0, 0, 8] });
  }

  // NOWY styl wydruku pakietu: każda pozycja jak osobne zwykłe głosowanie.
  if (data.isPackage && data.packagePositions && data.packagePositions.length > 0) {
    const requireAll = data.requireAllPositions !== false;
    const allPeople = (data.groups ?? []).flatMap((g) => g.people).filter((p) => p.mark !== "wykl.");

    // Globalne podsumowanie (gdy wymóg głosowania na WSZYSTKIE pozycje) - w nagłówku raportu.
    if (requireAll) {
      const glosowalo = allPeople.filter((p) => p.present && p.mark === "ob.").length;
      const nieGlosowalo = allPeople.filter((p) => p.present && p.mark !== "ob.").length;
      const nieobecni = allPeople.filter((p) => !p.present).length;
      c.push(summaryRow([`GŁOSOWAŁO - ${glosowalo}`, `NIE GŁOSOWAŁO - ${nieGlosowalo}`, `NIEOBECNI - ${nieobecni}`]));
      c.push({ text: "", margin: [0, 0, 0, 4] });
    }

    const MARK_LABEL: Record<string, string> = { za: "za", "pr.": "pr.", "ws.": "ws.", "ng.": "ng.", "nb.": "nb." };

    // TAJNY pakiet: per pozycja tylko liczby (bez nazwisk), a na końcu JEDNA zbiorcza lista
    // uczestników z oznaczeniem obecności (ob./nb.), posortowana obecni->nieobecni, potem nazwisko.
    if (data.isSecret) {
      data.packagePositions.forEach((pos, pi) => {
        const zaTxt = `ZA - ${pos.yes}`, przTxt = `PRZECIW - ${pos.no}`, wsTxt = `WSTRZYMAŁO SIĘ - ${pos.abstain}`;
        const line: Record<string, unknown>[] = [{ text: `${pi + 1}. ${pos.label}`, fontSize: FS, bold: true, margin: [0, 4, 0, 2] }];
        if (requireAll) {
          line.push(summaryRow([zaTxt, przTxt, wsTxt]));
        } else {
          const glosowalo = pos.yes + pos.no + pos.abstain;
          line.push({ text: `GŁOSOWAŁO - ${glosowalo}   ${zaTxt}   ${przTxt}   ${wsTxt}`, fontSize: FS, bold: true, margin: [0, 2, 0, 2] });
        }
        c.push({ stack: line, unbreakable: true });
      });
      // Zbiorcza lista obecności (jak w tajnej liście): dwie kolumny nazwisk z ob./nb.
      c.push({ text: "Obecni / nieobecni:", fontSize: FS, bold: true, margin: [0, 6, 0, 4] });
      const cells = allPeople.map((p) => ({
        columns: [
          { text: `${p.lastName} ${p.firstName}`.toUpperCase(), fontSize: FS, width: "*" },
          { text: p.present ? "ob." : "nb.", fontSize: FS, width: 26, alignment: "right" },
        ],
        columnGap: 6, margin: [0, 0.6, 0, 0.6],
      }));
      const half = Math.ceil(cells.length / 2);
      c.push({
        columns: [{ stack: cells.slice(0, half), width: "*" }, { stack: cells.slice(half), width: "*" }],
        columnGap: 28, margin: [0, 2, 0, 8],
      });
      return c;
    }

    data.packagePositions.forEach((pos, pi) => {
      const head: Record<string, unknown>[] = [];
      head.push({ text: `${pi + 1}. ${pos.label}`, fontSize: FS, bold: true, margin: [0, 4, 0, 2] });

      const zaTxt = `ZA - ${pos.yes}`, przTxt = `PRZECIW - ${pos.no}`, wsTxt = `WSTRZYMAŁO SIĘ - ${pos.abstain}`;
      if (requireAll) {
        head.push(summaryRow([zaTxt, przTxt, wsTxt]));
      } else {
        const glosowalo = pos.yes + pos.no + pos.abstain;
        const nieobecni = allPeople.filter((p) => !p.present).length;
        const nieGlosowalo = allPeople.filter((p) => p.present && (p.perPosition?.[pi] ?? "ng.") === "ng.").length;
        head.push({
          text: `GŁOSOWAŁO - ${glosowalo}    ${zaTxt}   ${przTxt}   ${wsTxt}    NIE GŁOSOWAŁO - ${nieGlosowalo}   NIEOBECNI - ${nieobecni}`,
          fontSize: FS, bold: true, margin: [0, 2, 0, 2],
        });
      }

      const withClub = data.groupsEnabled;
      const nameCell = (p: typeof allPeople[number]) => ({
        columns: [
          { text: `${p.lastName} ${p.firstName}`.toUpperCase(), fontSize: FS, width: "*" },
          { text: p.present ? (MARK_LABEL[p.perPosition?.[pi] ?? "ng."] ?? "") : "nb.", fontSize: FS, width: 30, alignment: "right" },
        ],
        columnGap: 6,
        margin: [0, 0.6, 0, 0.6],
      });
      const twoCols = (people: typeof allPeople) => {
        const cells = people.map(nameCell);
        const half = Math.ceil(cells.length / 2);
        return {
          columns: [{ stack: cells.slice(0, half), width: "*" }, { stack: cells.slice(half), width: "*" }],
          columnGap: 28, margin: [0, 2, 0, 8],
        };
      };

      const body: Record<string, unknown>[] = [];
      if (withClub && data.groups && data.groups.length > 0) {
        // Nazwiska w podziale na kluby (nagłówek klubu + podsuma klubu dla tej pozycji + dwie kolumny nazwisk).
        for (const g of data.groups) {
          const people = g.people.filter((p) => p.mark !== "wykl.");
          if (people.length === 0) continue;
          // Podsuma klubu dla bieżącej pozycji pakietu.
          const gy = people.filter((p) => p.present && (p.perPosition?.[pi] ?? "") === "za").length;
          const gn = people.filter((p) => p.present && (p.perPosition?.[pi] ?? "") === "pr.").length;
          const ga = people.filter((p) => p.present && (p.perPosition?.[pi] ?? "") === "ws.").length;
          body.push({
            columns: [
              { text: `${g.shortName} (${g.membersCount})`, fontSize: FS, bold: true, width: "*" },
              { text: `ZA ${gy}  PRZECIW ${gn}  WSTRZ. ${ga}`, fontSize: FS - 1, alignment: "right", width: "auto" },
            ],
            margin: [0, 3, 0, 1],
          });
          body.push(twoCols(people));
        }
      } else {
        body.push(twoCols(allPeople));
      }

      const manyPeople = allPeople.length > 40;
      if (data.groupsEnabled || !manyPeople) {
        c.push({ stack: [...head, ...body], unbreakable: true });
      } else {
        for (const h of head) c.push(h);
        for (const b of body) c.push(b);
      }
    });

    return c;
  }

  // Bloki (kluby lub jeden zbiorczy). Dla tajnych - lista obecnych/nieobecnych.
  if (data.groups && data.groups.length > 0) {
    if (data.isSecret) c.push({ text: "Obecni:", fontSize: FS, bold: true, margin: [0, 2, 0, 4] });
    for (const g of data.groups) {
      // Cały blok klubu (nagłówek + osoby) trzymamy razem - nie dzieli się między strony.
      const blockParts: Record<string, unknown>[] = [];
      if (showClub) blockParts.push(groupHead(g, !!data.isList || !!data.isPackage, data.isQuorum || data.isSecret));

      if (data.isList && !data.isSecret) {
        // TABELA GŁOSUJĄCYCH: wyłącznie osoby, które oddały głos (mają perCandidate).
        // Niegłosujący (ng.) i nieobecni (nb.) trafiają do osobnej tabeli pod spodem.
        const voters = g.people.filter((p) => p.perCandidate && p.perCandidate.length > 0 && p.mark !== "nb." && p.mark !== "ng.");
        const nCand = data.candidatesCount ?? (g.people.find((p) => p.perCandidate)?.perCandidate?.length ?? 0);
        const candIndexes = Array.from({ length: nCand }, (_, i) => i);
        if (voters.length > 0) {
          for (const candChunk of chunk(candIndexes, 15)) {
            const header = [
              { text: "Lp.", fontSize: FS, bold: true },
              { text: "Nazwisko i imię", fontSize: FS, bold: true },
              ...candChunk.map((ci) => ({ text: String(ci + 1), fontSize: FS, bold: true, alignment: "center" })),
            ];
            const rows = voters.map((p, idx) => [
              { text: String(idx + 1), fontSize: FS },
              { text: `${p.lastName} ${p.firstName}`.toUpperCase(), fontSize: FS },
              ...candChunk.map((ci) => ({ text: p.perCandidate?.[ci] ?? "", fontSize: FS, alignment: "center" })),
            ]);
            blockParts.push({ table: { headerRows: 1, widths: ["auto", "*", ...candChunk.map(() => "auto")], body: [header, ...rows] }, layout: BW_LINES, margin: [0, 0, 0, 6] });
          }
        }
      } else if (data.isPackage && !data.isSecret) {
        const perKey = "perPosition";
        const nCand = data.packagePositions?.length ?? (g.people.find((p) => p.perPosition)?.perPosition?.length ?? 0);
        const candIndexes = Array.from({ length: nCand }, (_, i) => i);
        for (const candChunk of chunk(candIndexes, 15)) {
          const header = [
            { text: "Lp.", fontSize: FS, bold: true },
            { text: "Nazwisko i imię", fontSize: FS, bold: true },
            ...candChunk.map((ci) => ({ text: String(ci + 1), fontSize: FS, bold: true, alignment: "center" })),
          ];
          const rows = g.people.map((p, idx) => [
            { text: String(idx + 1), fontSize: FS },
            { text: `${p.lastName} ${p.firstName}`.toUpperCase(), fontSize: FS },
            ...candChunk.map((ci) => ({ text: (p[perKey as "perPosition"]?.[ci]) ?? p.mark ?? "", fontSize: FS, alignment: "center" })),
          ]);
          blockParts.push({ table: { headerRows: 1, widths: ["auto", "*", ...candChunk.map(() => "auto")], body: [header, ...rows] }, layout: BW_LINES, margin: [0, 0, 0, 6] });
        }
      } else {
        // Dla TAJNEJ LISTY pokazujemy w bloku klubu tylko OBECNYCH (nieobecni trafiają do
        // osobnej tabeli "Nieobecni" niżej). Dla pozostałych (kworum) - wszyscy z marką.
        const peopleHere = (data.isSecret && data.isList) ? g.people.filter((p) => p.present) : g.people;
        const cells = peopleHere.map((p) => ({
          columns: [
            { text: `${p.lastName} ${p.firstName}`.toUpperCase(), fontSize: FS, width: "*" },
            { text: (data.isSecret && data.isList) ? "ob." : (p.mark ?? ""), fontSize: FS, width: 26, alignment: "right" },
          ],
          columnGap: 6,
          margin: [0, 0.6, 0, 0.6],
        }));
        const half = Math.ceil(cells.length / 2);
        blockParts.push({
          columns: [
            { stack: cells.slice(0, half), width: "*" },
            { stack: cells.slice(half), width: "*" },
          ],
          columnGap: 28,
          margin: [0, 0, 0, 6],
        });
      }

      // Reguła łamania:
      // - Lista/pakiet (TABELE): NIE zawijamy w unbreakable - pdfmake sam dzieli tabelę między
      //   strony (headerRows powtarza nagłówek), dzięki czemu nic nie znika przy dużych klubach.
      // - Zwykłe głosowania (kolumny nazwisk): przy WŁĄCZONYCH klubach trzymamy klub razem;
      //   przy wyłączonych (jedna wielka lista) pozwalamy naturalne łamanie.
      const isTableBlock = (data.isList || data.isPackage) && !data.isSecret;
      if (isTableBlock) {
        // nagłówek klubu trzymamy z pierwszą tabelą, reszta łamie się naturalnie
        for (const part of blockParts) c.push(part);
      } else if (data.groupsEnabled) {
        c.push({ stack: blockParts, unbreakable: true });
      } else {
        for (const part of blockParts) c.push(part);
      }
    }
  }

  // LISTA - dodatki pod tabelami głosujących (F):
  if (data.isList) {
    // Osobna tabela "Niegłosujący i nieobecni".
    // Jawna: rozpoznajemy po marce/perCandidate. Tajna: nie znamy kto głosował imiennie,
    // więc do tej tabeli trafiają NIEOBECNI (present=false); obecni-niegłosujący nie są ujawniani.
    const allPeople = (data.groups ?? []).flatMap((g) => g.people).filter((p) => p.mark !== "wykl.");
    const nonVoting = data.isSecret
      ? allPeople.filter((p) => !p.present)
      : allPeople.filter((p) => p.mark === "ng." || p.mark === "nb." || !p.perCandidate || p.perCandidate.length === 0);
    // sort: ng. (1) przed nb. (2); w obrębie alfabetycznie
    const rank = (m?: string) => (m === "nb." ? 2 : 1);
    nonVoting.sort((a, b) => {
      const ra = rank(a.mark), rb = rank(b.mark);
      if (ra !== rb) return ra - rb;
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "pl");
    });
    if (nonVoting.length > 0) {
      c.push({ text: data.isSecret ? "Nieobecni" : "Niegłosujący i nieobecni", fontSize: FS, bold: true, margin: [0, 8, 0, 3] });
      // 1-3 kolumny zależnie od liczby osób
      const perCol = nonVoting.length <= 12 ? nonVoting.length : Math.ceil(nonVoting.length / (nonVoting.length <= 30 ? 2 : 3));
      const colChunks = chunk(nonVoting, perCol || 1);
      const makeTable = (people: typeof nonVoting, startLp: number) => ({
        table: {
          headerRows: 1,
          widths: ["auto", "*", "auto"],
          body: [
            [{ text: "Lp.", fontSize: FS, bold: true }, { text: "Nazwisko i imię", fontSize: FS, bold: true }, { text: "", fontSize: FS, bold: true }],
            ...people.map((p, i) => [
              { text: String(startLp + i), fontSize: FS },
              { text: `${p.lastName} ${p.firstName}`.toUpperCase(), fontSize: FS },
              { text: p.mark === "nb." || !p.present ? "nb." : "ng.", fontSize: FS, alignment: "center" },
            ]),
          ],
        },
        layout: BW_LINES,
        width: "*",
      });
      let lp = 1;
      const cols = colChunks.map((ch) => { const t = makeTable(ch, lp); lp += ch.length; return t; });
      c.push({ columns: cols, columnGap: 12, margin: [0, 0, 0, 8] });
    }

    // Podsuma "Wynik głosowania" na końcu (jak w jawnej).
    c.push({ text: "Wynik głosowania", fontSize: FS, bold: true, margin: [0, 6, 0, 3] });
    if (data.summaryParts && data.summaryParts.length) c.push(summaryRow(data.summaryParts));
    if (data.majorityPart) c.push({ text: data.majorityPart, fontSize: FS, bold: true, margin: [0, 2, 0, 2] });

    // Zdanie o osobach przeciw wszystkim kandydaturom (tylko jawna - w tajnej nie znamy).
    if (!data.isSecret && data.againstAllCount != null && data.againstAllCount > 0) {
      const n = data.againstAllCount;
      // Odmiana: 1 -> "osoba nie poparła"; 2-4 (poza 12-14) -> "osoby nie poparły"; reszta -> "osób nie poparło".
      const lastTwo = n % 100;
      const last = n % 10;
      const isFew = last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
      const noun = n === 1 ? "osoba" : isFew ? "osoby" : "osób";
      const verb = n === 1 ? "nie poparła" : isFew ? "nie poparły" : "nie poparło";
      c.push({ text: `Żadnej kandydatury ${verb} ${n} ${noun}.`, fontSize: FS, margin: [0, 4, 0, 2] });
    }
  }

  if (data.isPackage && data.packagePositions && data.packagePositions.length > 0) {
    c.push({ text: "Wyniki poszczególnych pozycji", fontSize: FS, bold: true, margin: [0, 6, 0, 4] });
    const showGl = data.requireAllPositions === false;
    const header = [
      { text: "Nr", fontSize: FS, bold: true },
      { text: "Pozycja", fontSize: FS, bold: true },
      ...(showGl ? [{ text: "Głosowało", fontSize: FS, bold: true, alignment: "center" }] : []),
      { text: "Za", fontSize: FS, bold: true, alignment: "center" },
      { text: "Przeciw", fontSize: FS, bold: true, alignment: "center" },
      { text: "Wstrzym.", fontSize: FS, bold: true, alignment: "center" },
    ];
    const rows = data.packagePositions.map((p) => [
      { text: p.positionNumber, fontSize: FS },
      { text: p.label, fontSize: FS },
      ...(showGl ? [{ text: String(p.glosowalo), fontSize: FS, alignment: "center" }] : []),
      { text: String(p.yes), fontSize: FS, alignment: "center" },
      { text: String(p.no), fontSize: FS, alignment: "center" },
      { text: String(p.abstain), fontSize: FS, alignment: "center" },
    ]);
    c.push({
      table: {
        headerRows: 1,
        widths: showGl ? ["auto", "*", "auto", "auto", "auto", "auto"] : ["auto", "*", "auto", "auto", "auto"],
        body: [header, ...rows],
      },
      layout: BW_LINES,
      margin: [0, 0, 0, 8],
    });
  }

  // Wynik listy - łączne wyniki (po naszemu): tabela kandydat / głosów.
  // Nagłówek "Wynik głosowania" wypisuje już blok podsumy powyżej (F), więc tu go nie powtarzamy.
  if (data.isList && data.candidatesSummary && data.candidatesSummary.length > 0) {
    const sorted = [...data.candidatesSummary].sort((a, b) => a.label.localeCompare(b.label, "pl"));
    const body = [
      [{ text: "Kandydat", fontSize: FS, bold: true }, { text: "Głosów", fontSize: FS, bold: true, alignment: "right" }],
      ...sorted.map((s) => [{ text: s.label, fontSize: FS }, { text: String(s.yesCount), fontSize: FS, alignment: "right" }]),
    ];
    c.push({ table: { headerRows: 1, widths: ["*", "auto"], body }, layout: BW_LINES, margin: [0, 0, 0, 4] });
  }

  // Wykluczeni z posiedzenia - osobna lista na końcu raportu.
  if (data.excludedList && data.excludedList.length > 0) {
    c.push({ text: "Wykluczeni z posiedzenia:", fontSize: FS, bold: true, margin: [0, 10, 0, 4] });
    data.excludedList.forEach((p, i) => {
      const club = p.groupShort ? ` (${p.groupShort})` : "";
      c.push({ text: `${i + 1}. ${p.lastName} ${p.firstName}${club}`, fontSize: FS, margin: [0, 0, 0, 2] });
    });
  }

  return c;
}

async function loadPdfMake() {
  const mod = await import("pdfmake/build/pdfmake");
  const pdfMake = mod.default;
  const base = typeof window !== "undefined" ? window.location.origin : "";
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

// Buduje docDefinition dla jednego raportu (własny licznik stron „X z Y" tego głosowania).
function singleDocDefinition(r: ReportData, fileName: string) {
  return {
    content: reportContent(r),
    defaultStyle: { font: "Lato", fontSize: FS },
    pageMargins: [40, 48, 40, 40],
    header: (currentPage: number, pageCount: number) => ({
      margin: [40, 20, 40, 0],
      columns: [
        { text: `Posiedzenie nr ${r.meetingNumber} - głosowanie nr ${r.voteNumber}`, fontSize: 8 },
        { text: `Strona ${currentPage} z ${pageCount}`, fontSize: 8, alignment: "right" },
      ],
    }),
    info: { title: fileName },
  };
}

/** Generuje i pobiera PDF z jednym lub wieloma raportami w JEDNYM pliku (globalny licznik stron). */
export async function downloadReportsPdf(reports: ReportData[], fileName: string) {
  if (reports.length === 0) return;
  const pdfMake = await loadPdfMake();

  // Pojedynczy raport - własny licznik „X z Y" tego głosowania.
  if (reports.length === 1) {
    pdfMake.createPdf(singleDocDefinition(reports[0], fileName)).download(`${fileName}.pdf`);
    return;
  }

  const content: Record<string, unknown>[] = [];
  reports.forEach((r, i) => {
    if (i > 0) content.push({ text: "", pageBreak: "before" });
    content.push(...reportContent(r));
  });

  const first = reports[0];
  const docDefinition = {
    content,
    defaultStyle: { font: "Lato", fontSize: FS },
    pageMargins: [40, 48, 40, 40],
    // Nagłówek z numerem posiedzenia + globalny licznik stron całego pliku.
    header: (currentPage: number, pageCount: number) => ({
      margin: [40, 20, 40, 0],
      columns: [
        { text: `Posiedzenie nr ${first.meetingNumber}`, fontSize: 8 },
        { text: `Strona ${currentPage} z ${pageCount}`, fontSize: 8, alignment: "right" },
      ],
    }),
    info: { title: fileName },
  };

  pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
}

/**
 * Lista obecności DO PODPISU: metryczka + tabela Lp. | Nazwisko i imię | (Klub) | Podpis.
 * Pusta kolumna „Podpis" na odręczny podpis.
 */
export async function downloadSignatureList(data: {
  organization: string;
  meetingName: string;
  meetingNumber: string;
  dateText?: string | null;
  groupsEnabled: boolean;
  people: { lastName: string; firstName: string; groupShort?: string | null }[];
}, fileName: string) {
  const pdfMake = await loadPdfMake();
  const withClub = data.groupsEnabled;
  const FS_TABLE = 12;
  const PER_PAGE = 20;
  // A4 = 842 pt. Marginesy góra 60 + dół 40 = 100. Tytuł/nagłówki dokumentu ~70.
  // Pozostaje ~672 pt na tabelę. Nagłówek tabeli ~1 wiersz + 20 wierszy danych = 21.
  // Wysokość wiersza dobrana tak, by 20 dużych wierszy wypełniło stronę i NIE ucinało się w połowie.
  const ROW_HEIGHT = 30;

  const makeHeader = () => [
    { text: "Lp.", bold: true, fontSize: FS_TABLE, alignment: "center", margin: [0, 8, 0, 0] },
    { text: "Nazwisko i imię", bold: true, fontSize: FS_TABLE, margin: [0, 8, 0, 0] },
    ...(withClub ? [{ text: "Klub", bold: true, fontSize: FS_TABLE, margin: [0, 8, 0, 0] }] : []),
    { text: "Podpis", bold: true, fontSize: FS_TABLE, margin: [0, 8, 0, 0] },
  ];
  const makeRow = (p: { lastName: string; firstName: string; groupShort?: string | null }, i: number) => [
    { text: String(i + 1), fontSize: FS_TABLE, alignment: "center", margin: [0, 9, 0, 0] },
    { text: `${p.lastName} ${p.firstName}`, fontSize: FS_TABLE, margin: [0, 9, 0, 0] },
    ...(withClub ? [{ text: p.groupShort ?? "", fontSize: FS_TABLE, margin: [0, 9, 0, 0] }] : []),
    { text: "", margin: [0, 9, 0, 0] },
  ];

  const widths = withClub ? ["auto", "*", "auto", 180] : ["auto", "*", 200];
  const tableLayout = {
    hLineWidth: () => 0.8, vLineWidth: () => 0.8,
    hLineColor: () => "#000000", vLineColor: () => "#000000",
    paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 0, paddingBottom: () => 0,
  };

  // Jawny podział na strony po 20 osób - wiersze o stałej, dużej wysokości wypełniają całą stronę.
  const pages = chunk(data.people, PER_PAGE);
  const content: Record<string, unknown>[] = [];
  pages.forEach((pagePeople, pageIdx) => {
    if (pageIdx > 0) content.push({ text: "", pageBreak: "before" });
    // wysokości: nagłówek tabeli 24, każdy wiersz ROW_HEIGHT (stała) - gwarantuje wypełnienie strony
    const heights = (row: number) => (row === 0 ? 24 : ROW_HEIGHT);
    content.push(
      { text: data.organization, fontSize: FS + 1, bold: true, alignment: "center" },
      { text: "Lista obecności", fontSize: FS + 3, bold: true, alignment: "center", margin: [0, 4, 0, 2] },
      { text: `${withDateText(data.meetingName, data.dateText)}`, fontSize: FS, alignment: "center", margin: [0, 0, 0, 12] },
      {
        table: { headerRows: 1, widths, heights, body: [makeHeader(), ...pagePeople.map((p, i) => makeRow(p, pageIdx * PER_PAGE + i))], dontBreakRows: true, keepWithHeaderRows: 1 },
        layout: tableLayout,
      },
    );
  });

  const docDefinition = {
    content,
    defaultStyle: { font: "Lato", fontSize: FS },
    pageMargins: [40, 60, 40, 40] as [number, number, number, number],
    header: (currentPage: number, pageCount: number) => ({
      margin: [40, 18, 40, 0],
      columns: [
        { text: `Posiedzenie nr ${data.meetingNumber} - lista obecności`, fontSize: 8 },
        { text: `Strona ${currentPage} z ${pageCount}`, fontSize: 8, alignment: "right" },
      ],
    }),
    info: { title: fileName },
  };

  pdfMake.createPdf(docDefinition).download(`${fileName}.pdf`);
}

type MetaBlock = { organization: string; meetingName: string; meetingNumber: string; dateText?: string | null };

/** B2: lista obecności całego posiedzenia (kto był / kogo nie było) - stan bieżący. */
export async function downloadAttendanceMergedList(data: MetaBlock & {
  groupsEnabled: boolean;
  mergedList: { lastName: string; firstName: string; groupShort?: string | null; present: boolean }[];
}, fileName: string) {
  const pdfMake = await loadPdfMake();
  const withClub = data.groupsEnabled;
  const presentCount = data.mergedList.filter((p) => p.present).length;
  const absentCount = data.mergedList.length - presentCount;

  const header = [
    { text: "Lp.", bold: true, fontSize: FS, alignment: "center" },
    { text: "Nazwisko i imię", bold: true, fontSize: FS },
    ...(withClub ? [{ text: "Klub", bold: true, fontSize: FS }] : []),
    { text: "Obecność", bold: true, fontSize: FS, alignment: "center" },
  ];
  const rows = data.mergedList.map((p, i) => [
    { text: String(i + 1), fontSize: FS, alignment: "center" },
    { text: `${p.lastName} ${p.firstName}`, fontSize: FS },
    ...(withClub ? [{ text: p.groupShort ?? "", fontSize: FS }] : []),
    { text: p.present ? "obecny" : "nieobecny", fontSize: FS, alignment: "center" },
  ]);

  const content: Record<string, unknown>[] = [
    { text: data.organization, fontSize: FS + 1, bold: true, alignment: "center" },
    { text: `${withDateText(`Lista obecności - posiedzenie nr ${data.meetingNumber}`, data.dateText)}`, fontSize: FS + 3, bold: true, alignment: "center", margin: [0, 4, 0, 2] },
    { text: data.meetingName, fontSize: FS, alignment: "center", margin: [0, 0, 0, 12] },
    {
      table: { headerRows: 1, widths: withClub ? ["auto", "*", "auto", "auto"] : ["auto", "*", "auto"], body: [header, ...rows] },
      layout: BW_LINES,
    },
    { text: `Obecnych: ${presentCount}    Nieobecnych: ${absentCount}    Uprawnionych: ${data.mergedList.length}`, fontSize: FS, bold: true, margin: [0, 12, 0, 0] },
  ];

  pdfMake.createPdf({
    content,
    defaultStyle: { font: "Lato", fontSize: FS },
    pageMargins: [40, 44, 40, 40],
    header: (cp: number, pc: number) => ({ margin: [40, 18, 40, 0], columns: [
      { text: `Posiedzenie nr ${data.meetingNumber} - lista obecności`, fontSize: 8 },
      { text: `Strona ${cp} z ${pc}`, fontSize: 8, alignment: "right" },
    ] }),
    info: { title: fileName },
  }).download(`${fileName}.pdf`);
}

/** B1: raport obecności - tabela (wiersze: radni, kolumny: kolejne sprawdzenia). */
export async function downloadAttendanceLog(data: MetaBlock & {
  groupsEnabled: boolean;
  columns: { id: string; kind: string; time: string; presentCount: number; eligibleCount: number }[];
  matrix: { lastName: string; firstName: string; groupShort?: string | null; cells: (boolean | null)[] }[];
}, fileName: string) {
  const pdfMake = await loadPdfMake();
  const withClub = data.groupsEnabled;
  const COLS_PER_TABLE = 8; // racjonalna liczba kolumn na jedną tabelę

  const content: Record<string, unknown>[] = [
    { text: data.organization, fontSize: FS + 1, bold: true, alignment: "center" },
    { text: `${withDateText(`Raport obecności - posiedzenie nr ${data.meetingNumber}`, data.dateText)}`, fontSize: FS + 3, bold: true, alignment: "center", margin: [0, 4, 0, 2] },
    { text: data.meetingName, fontSize: FS, alignment: "center", margin: [0, 0, 0, 12] },
  ];

  if (data.columns.length === 0) {
    content.push({ text: "Brak zarejestrowanych sprawdzeń obecności.", fontSize: FS, italics: true });
  }

  // Dzielimy kolumny (sprawdzenia) na porcje po COLS_PER_TABLE - każda porcja to osobna tabela.
  for (let start = 0; start < data.columns.length; start += COLS_PER_TABLE) {
    const chunk = data.columns.slice(start, start + COLS_PER_TABLE);
    const nameCols: string[] = withClub ? ["auto", "*", "auto"] : ["auto", "*"];
    const widths = [...nameCols, ...chunk.map(() => "auto")];

    const head1 = [
      { text: "Lp.", bold: true, fontSize: FS - 1, alignment: "center" },
      { text: "Nazwisko i imię", bold: true, fontSize: FS - 1 },
      ...(withClub ? [{ text: "Klub", bold: true, fontSize: FS - 1 }] : []),
      ...chunk.map((c) => ({ text: `${c.kind}\n${c.time}\n(${c.presentCount}/${c.eligibleCount})`, bold: true, fontSize: FS - 3, alignment: "center" })),
    ];
    const body = data.matrix.map((row, i) => [
      { text: String(i + 1), fontSize: FS - 1, alignment: "center" },
      { text: `${row.lastName} ${row.firstName}`, fontSize: FS - 1 },
      ...(withClub ? [{ text: row.groupShort ?? "", fontSize: FS - 1 }] : []),
      ...chunk.map((c, ci) => {
        const v = row.cells[start + ci];
        return { text: v === null ? "-" : v ? "ob." : "nb.", fontSize: FS - 1, alignment: "center" };
      }),
    ]);

    if (start > 0) content.push({ text: "", margin: [0, 8, 0, 0] });
    content.push({
      table: { headerRows: 1, widths, body: [head1, ...body], dontBreakRows: true },
      layout: BW_LINES,
    });
  }

  content.push({ text: "ob. - obecny, nb. - nieobecny, - brak w danym sprawdzeniu", fontSize: FS - 2, margin: [0, 8, 0, 0] });

  pdfMake.createPdf({
    content,
    defaultStyle: { font: "Lato", fontSize: FS },
    pageMargins: [40, 44, 40, 40],
    header: (cp: number, pc: number) => ({ margin: [40, 18, 40, 0], columns: [
      { text: `Posiedzenie nr ${data.meetingNumber} - raport obecności`, fontSize: 8 },
      { text: `Strona ${cp} z ${pc}`, fontSize: 8, alignment: "right" },
    ] }),
    info: { title: fileName },
  }).download(`${fileName}.pdf`);
}

/** K5: raport pojedynczego sprawdzenia obecności - bez decyzji o kworum, dostosowany do sprawdzania. */
export async function downloadCheckReportPdf(data: {
  organization: string; meetingName: string; meetingNumber: string; dateText: string;
  kindLabel: string; timeText: string;
  presentCount: number; absentCount: number; eligibleCount: number;
  groupsEnabled: boolean;
  present: { lastName: string; firstName: string; groupShort?: string | null; markedAt?: string | null }[];
  absent: { lastName: string; firstName: string; groupShort?: string | null }[];
}, fileName: string) {
  const pdfMake = await loadPdfMake();
  const club = (g?: string | null) => (data.groupsEnabled && g ? ` (${g})` : "");

  const all = [
    ...data.present.map((p) => ({ name: `${p.lastName} ${p.firstName}${club(p.groupShort)}`, mark: "ob." })),
    ...data.absent.map((p) => ({ name: `${p.lastName} ${p.firstName}${club(p.groupShort)}`, mark: "nb." })),
  ].sort((a, b) => a.name.localeCompare(b.name, "pl"));

  const cells = all.map((p) => ({
    columns: [
      { text: p.name.toUpperCase(), fontSize: FS, width: "*" },
      { text: p.mark, fontSize: FS, width: 26, alignment: "right" },
    ],
    columnGap: 6,
    margin: [0, 0.6, 0, 0.6],
  }));
  const half = Math.ceil(cells.length / 2);

  const content: Record<string, unknown>[] = [
    { text: data.organization, fontSize: FS + 1, bold: true, alignment: "center" },
    { text: `${withDateText(`${data.kindLabel} - posiedzenie nr ${data.meetingNumber}`, data.dateText)}`, fontSize: FS + 3, bold: true, alignment: "center", margin: [0, 4, 0, 2] },
    { text: data.meetingName, fontSize: FS, alignment: "center", margin: [0, 0, 0, 2] },
    { text: `Czas: ${data.timeText}`, fontSize: FS - 1, alignment: "center", margin: [0, 0, 0, 10] },
    { text: `Obecni: ${data.presentCount}    Nieobecni: ${data.absentCount}    Uprawnieni: ${data.eligibleCount}`, fontSize: FS, bold: true, margin: [0, 0, 0, 10] },
    {
      columns: [
        { stack: cells.slice(0, half), width: "*" },
        { stack: cells.slice(half), width: "*" },
      ],
      columnGap: 28,
    },
    { text: "ob. - obecny, nb. - nieobecny", fontSize: FS - 2, margin: [0, 10, 0, 0] },
  ];

  pdfMake.createPdf({
    content,
    defaultStyle: { font: "Lato", fontSize: FS },
    pageMargins: [40, 44, 40, 40],
    header: (cp: number, pc: number) => ({ margin: [40, 18, 40, 0], columns: [
      { text: `Posiedzenie nr ${data.meetingNumber} - ${data.kindLabel.toLowerCase()}`, fontSize: 8 },
      { text: `Strona ${cp} z ${pc}`, fontSize: 8, alignment: "right" },
    ] }),
    info: { title: fileName },
  }).download(`${fileName}.pdf`);
}

/** Generuje ZIP z osobnym plikiem PDF dla każdego głosowania (każdy z własnym licznikiem „X z Y"). */
export async function downloadReportsZip(reports: ReportData[], zipName: string) {
  if (reports.length === 0) return;
  const pdfMake = await loadPdfMake();
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const r of reports) {
    const name = `glosowanie-${r.voteNumber}`;
    const blob: Blob = await new Promise((resolve) => {
      pdfMake.createPdf(singleDocDefinition(r, name)).getBlob((b: Blob) => resolve(b));
    });
    zip.file(`${name}.pdf`, blob);
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
