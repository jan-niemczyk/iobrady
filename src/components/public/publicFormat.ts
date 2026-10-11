import type { PublicPerson, PublicPersonStatus, PublicVoteSummary } from "@/lib/publicMeeting";

/** Formatowanie publicznego widoku posiedzenia - bez zależności od serwera (także w komponentach klienta). */

const TZ = "Europe/Warsaw";

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}
export function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";
}
export function fmtDateTimeShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
export function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Liczebnik: 1 głos, 2 głosy, 5 głosów. */
export function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10, t = n % 100;
  if (n === 1) return one;
  if (d >= 2 && d <= 4 && !(t >= 12 && t <= 14)) return few;
  return many;
}

export const TYPE_LABEL: Record<PublicVoteSummary["type"], string> = {
  STANDARD: "zwykłe",
  LIST: "wybór kandydatów",
  QUORUM: "sprawdzenie kworum",
  PACKAGE: "pakietowe",
};

/** Wynik w jednym wierszu (lista głosowań). */
export function resultShort(v: PublicVoteSummary): string {
  if (v.status === "OPEN") return "Głosowanie trwa";
  if (v.status === "CANCELLED") return "Głosowanie anulowane";
  if (v.status === "INTERRUPTED") return "Głosowanie przerwane";
  if (v.status === "IRRELEVANT") return "Bezprzedmiotowe";
  const r = v.result;
  if (!r) return "";
  if (v.type === "STANDARD") {
    const parts = [`za ${r.yes ?? 0}`, `przeciw ${r.no ?? 0}`, `wstrz. ${r.abstain ?? 0}`];
    if (r.invalid) parts.push(`nieważne ${r.invalid}`);
    return parts.join(", ");
  }
  if (v.type === "QUORUM") return `obecnych ${r.cast}${r.eligible != null ? ` z ${r.eligible}` : ""}`;
  if (v.type === "LIST") {
    const opts = r.options ?? [];
    const top = [...opts].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 3);
    return `głosowało ${r.cast}; ${top.map((o) => `${o.label}: ${o.count ?? 0}`).join(", ")}${opts.length > 3 ? "…" : ""}`;
  }
  const n = r.options?.length ?? 0;
  return `głosowało ${r.cast}; ${n} ${plural(n, "pozycja", "pozycje", "pozycji")}`;
}

/** Status osoby w wynikach - z formą żeńską, gdy ustawiona. */
export function personStatusLabel(p: PublicPerson): string {
  const f = !!p.female;
  const labels: Record<PublicPersonStatus, string> = {
    YES: "Za",
    NO: "Przeciw",
    ABSTAIN: f ? "Wstrzymała się" : "Wstrzymał się",
    VOTED: f ? "Oddała głos" : "Oddał głos",
    NOT_VOTED: f ? "Nie oddała głosu" : "Nie oddał głosu",
    ABSENT: f ? "Nieobecna" : "Nieobecny",
  };
  return labels[p.status];
}

/** Klasa Bootstrapa statusu - kolor uzupełnia tekst, nigdy go nie zastępuje. */
export function personStatusClass(s: PublicPersonStatus): string {
  return s === "YES" ? "text-success-emphasis fw-semibold"
    : s === "NO" ? "text-danger-emphasis fw-semibold"
    : s === "ABSTAIN" ? "text-warning-emphasis fw-semibold"
    : s === "ABSENT" ? "text-body-secondary"
    : s === "NOT_VOTED" ? "text-body-secondary fst-italic"
    : "";
}

export const NO_CLUB = "Bez przynależności";
