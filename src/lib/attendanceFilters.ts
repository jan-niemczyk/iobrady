import type { SummaryFilters } from "@/lib/attendanceReport";

/** Filtry raportu zbiorczego z parametrów adresu (widok i eksport używają tych samych). */
export function filtersFrom(sp: URLSearchParams): SummaryFilters {
  const d = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    from: d(sp.get("od")), to: d(sp.get("do")),
    orgUnitIds: sp.getAll("grupa").filter((x) => /^[a-z0-9]{10,40}$/i.test(x)).slice(0, 20),
    userId: sp.get("osoba")?.slice(0, 64) || null,
    meetingType: sp.get("rodzaj")?.slice(0, 100) || null,
    includeOngoing: sp.get("trwajace") === "1",
  };
}

