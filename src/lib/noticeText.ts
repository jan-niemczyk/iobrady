/**
 * Treść zawiadomień: ograniczone formatowanie i bezpieczne znaczniki danych. Wspólne dla edytora,
 * podglądu i generatora DOCX (ten sam model = podgląd odpowiada dokumentowi).
 *
 * Zapis (zwykły tekst, czytelny także bez edytora):
 *   - akapit = wiersz tekstu (pusty wiersz = odstęp między akapitami),
 *   - **pogrubienie**, _kursywa_,
 *   - „- " na początku wiersza = punkt listy, „1. " = lista numerowana,
 *   - wyrównanie akapitu: prefiks [do-srodka], [do-prawej], [wyjustuj].
 * Znaczniki {{nazwa}} są podstawiane jako tekst - nigdy nie są wykonywane jako kod.
 */

export type Align = "left" | "center" | "right" | "justify";
export interface Run { text: string; bold?: boolean; italic?: boolean }
export interface Block { type: "p" | "ul" | "ol"; align: Align; runs: Run[]; number?: number }

const ALIGN_PREFIX: [string, Align][] = [["[do-srodka]", "center"], ["[do-prawej]", "right"], ["[wyjustuj]", "justify"]];

export function parseInline(line: string): Run[] {
  const runs: Run[] = [];
  // Tokeny **...** i _..._ (bez zagnieżdżania - ograniczony edytor).
  const re = /\*\*([^*]+)\*\*|_([^_]+)_/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else runs.push({ text: m[2], italic: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last) });
  return runs.length ? runs : [{ text: "" }];
}

export function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  let olCounter = 0;
  for (const raw of (src ?? "").replace(/\r\n/g, "\n").split("\n")) {
    let line = raw;
    let align: Align = "left";
    for (const [p, a] of ALIGN_PREFIX) if (line.startsWith(p)) { align = a; line = line.slice(p.length).trimStart(); }
    const ul = /^[-\u2022]\s+(.*)$/.exec(line);
    const ol = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (ul) { out.push({ type: "ul", align, runs: parseInline(ul[1]) }); olCounter = 0; continue; }
    if (ol) { olCounter++; out.push({ type: "ol", align, runs: parseInline(ol[2]), number: Number(ol[1]) || olCounter }); continue; }
    olCounter = 0;
    out.push({ type: "p", align, runs: parseInline(line) });
  }
  return out;
}

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "organ", label: "Nazwa organu (jednostki lub grupy posiedzenia)" },
  { key: "nazwa_posiedzenia", label: "Nazwa posiedzenia" },
  { key: "numer_posiedzenia", label: "Numer posiedzenia" },
  { key: "data_posiedzenia", label: "Data posiedzenia (np. 7 sierpnia 2026 r.)" },
  { key: "godzina", label: "Godzina rozpoczęcia" },
  { key: "miejsce", label: "Miejsce posiedzenia" },
  { key: "adresat", label: "Adresat (w dokumencie spersonalizowanym)" },
  { key: "zwrot", label: "Zwrot grzecznościowy adresata" },
  { key: "podpisujacy", label: "Osoba podpisująca" },
  { key: "data_pisma", label: "Data pisma" },
  { key: "miejscowosc", label: "Miejscowość" },
];
const KNOWN = new Set(PLACEHOLDERS.map((p) => p.key));

/** Podstawia znaczniki; zwraca tekst i listę nierozwiązanych (nieznanych albo bez wartości). */
export function fillPlaceholders(text: string, values: Record<string, string | null | undefined>): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const out = (text ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, k: string) => {
    const key = k.toLowerCase();
    const v = values[key];
    if (!KNOWN.has(key) || v === undefined || v === null || v === "") { unresolved.push(key); return whole; }
    return v;
  });
  return { text: out, unresolved };
}

export interface NoticeContent {
  unitName: string;
  unitDetails: string;
  useLogo: boolean;
  place: string;
  letterDate: string;
  caseRef: string;
  title: string;
  intro: string;
  agendaLabel: string;
  agendaPosition: "after-intro" | "none";
  outro: string;
  signature: string;
  signer: string;
  footer: string;
  footerPageNumbers: boolean;
  letterhead: string;
}

export const EMPTY_CONTENT: NoticeContent = {
  unitName: "", unitDetails: "", useLogo: false, place: "", letterDate: "", caseRef: "",
  title: "ZAWIADOMIENIE", intro: "", agendaLabel: "Proponowany porządek obrad:", agendaPosition: "after-intro",
  outro: "", signature: "", signer: "", footer: "", footerPageNumbers: true, letterhead: "",
};

export function normalizeContent(raw: unknown): NoticeContent {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: keyof NoticeContent, max = 20000) => (typeof o[k] === "string" ? (o[k] as string).slice(0, max) : (EMPTY_CONTENT[k] as string));
  return {
    unitName: s("unitName", 300), unitDetails: s("unitDetails", 2000), useLogo: o.useLogo === true,
    place: s("place", 120), letterDate: s("letterDate", 20), caseRef: s("caseRef", 120), title: s("title", 300),
    intro: s("intro"), agendaLabel: s("agendaLabel", 300), agendaPosition: o.agendaPosition === "none" ? "none" : "after-intro",
    outro: s("outro"), signature: s("signature", 2000), signer: s("signer", 300), footer: s("footer", 2000),
    footerPageNumbers: o.footerPageNumbers !== false, letterhead: s("letterhead", 2000),
  };
}

export interface NoticeAgendaItem { key: string; number: string; title: string; level: 0 | 1; unnumbered?: boolean }

export function normalizeAgenda(raw: unknown): NoticeAgendaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 500).map((x, i) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return {
      key: typeof o.key === "string" ? o.key.slice(0, 64) : `k${i}`,
      number: typeof o.number === "string" ? o.number.slice(0, 20) : "",
      title: typeof o.title === "string" ? o.title.slice(0, 2000) : "",
      level: o.level === 1 ? 1 : 0,
      unnumbered: o.unnumbered === true,
    };
  });
}

/** Numeracja automatyczna: punkty 1, 2, 3...; podpunkty 1.1, 1.2 (pozycje bez numeru zostają bez). */
export function renumber(items: NoticeAgendaItem[]): NoticeAgendaItem[] {
  let main = 0, sub = 0;
  return items.map((it) => {
    if (it.unnumbered) return { ...it, number: "" };
    if (it.level === 0) { main++; sub = 0; return { ...it, number: `${main}` }; }
    sub++; return { ...it, number: main ? `${main}.${sub}` : `${sub}` };
  });
}

export interface NoticeRecipient {
  key: string;
  source: "user" | "guest" | "contact" | "manual";
  name: string;
  functionTitle: string;
  institution: string;
  address: string;
  salutation: string;
}

export function normalizeRecipients(raw: unknown): NoticeRecipient[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: NoticeRecipient[] = [];
  for (const x of raw.slice(0, 1000)) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const str = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).slice(0, max) : "");
    const source = (["user", "guest", "contact", "manual"] as const).find((s) => s === o.source) ?? "manual";
    const r: NoticeRecipient = { key: str("key", 80) || `manual:${out.length}`, source, name: str("name", 200), functionTitle: str("functionTitle", 200), institution: str("institution", 300), address: str("address", 1000), salutation: str("salutation", 120) };
    if (!r.name.trim()) continue;
    // Usuwanie duplikatów: ten sam klucz źródła albo identyczna nazwa i instytucja (adresat ręczny).
    const dup = r.key;
    const dup2 = `${r.name.trim().toLocaleLowerCase("pl")}|${r.institution.trim().toLocaleLowerCase("pl")}`;
    if (seen.has(dup) || seen.has(dup2)) continue;
    seen.add(dup); seen.add(dup2);
    out.push(r);
  }
  return out;
}

const MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
/** „7 sierpnia 2026 r." (data pisma i posiedzenia w zawiadomieniu). */
export function plDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return `${g("day")} ${MONTHS[g("month") - 1]} ${g("year")} r.`;
}
export function plTime(d: Date): string {
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
}
