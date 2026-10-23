import Link from "next/link";
import { prisma } from "@/lib/db";
import { attendanceSummary } from "@/lib/attendanceReport";
import { filtersFrom } from "@/lib/attendanceFilters";
import { CardHeader, PageContainer, PageHeader } from "@/components/operator/ui";
import { IconDownload } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const date = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });
const STATUS: Record<string, string> = { PRESENT: "obecny", ABSENT: "nieobecny", NO_DATA: "brak danych" };

/** Raport zbiorczy obecności: filtry w adresie (GET) - te same filtry trafiają do eksportu. */
export default async function AttendanceSummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) for (const x of Array.isArray(v) ? v : [v]) sp.append(k, x);
  const run = sp.size > 0;
  const f = filtersFrom(sp);
  const [units, people, types, summary] = await Promise.all([
    prisma.orgUnit.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } }),
    prisma.user.findMany({ where: { role: "PARTICIPANT" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    prisma.meeting.findMany({ where: { meetingType: { not: null } }, distinct: ["meetingType"], select: { meetingType: true } }),
    run ? attendanceSummary(f) : Promise.resolve(null),
  ]);
  const exp = (fmt: string) => { const q = new URLSearchParams(sp); q.set("format", fmt); return `/api/reports/attendance/export?${q.toString()}`; };

  return (
    <PageContainer size="xl">
      <PageHeader kicker="Raporty" title="Raport zbiorczy obecności" />
      <form className="card mb-3" method="get">
        <div className="card-body row g-3 align-items-end">
          <div className="col-6 col-md-2"><label className="form-label" htmlFor="ra-od">Od</label><input id="ra-od" type="date" name="od" className="form-control" defaultValue={f.from ?? ""} /></div>
          <div className="col-6 col-md-2"><label className="form-label" htmlFor="ra-do">Do</label><input id="ra-do" type="date" name="do" className="form-control" defaultValue={f.to ?? ""} /></div>
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="ra-os">Osoba</label>
            <select id="ra-os" name="osoba" className="form-select" defaultValue={f.userId ?? ""}>
              <option value="">Wszystkie osoby</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="ra-rodz">Rodzaj posiedzenia</label>
            <select id="ra-rodz" name="rodzaj" className="form-select" defaultValue={f.meetingType ?? ""}>
              <option value="">Wszystkie</option>
              {types.map((t) => t.meetingType && <option key={t.meetingType} value={t.meetingType}>{t.meetingType}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-2">
            <div className="form-check"><input className="form-check-input" type="checkbox" id="ra-tr" name="trwajace" value="1" defaultChecked={!!f.includeOngoing} /><label className="form-check-label small" htmlFor="ra-tr">Także trwające (roboczo)</label></div>
          </div>
          {units.length > 0 && (
            <fieldset className="col-12">
              <legend className="form-label fs-6 mb-1">Grupy organizacyjne (organ, komisja, zespół)</legend>
              <div className="d-flex flex-wrap gap-3">
                {units.map((u) => (
                  <div className="form-check" key={u.id}>
                    <input className="form-check-input" type="checkbox" name="grupa" value={u.id} id={`ra-g-${u.id}`} defaultChecked={f.orgUnitIds?.includes(u.id)} />
                    <label className="form-check-label" htmlFor={`ra-g-${u.id}`}>{u.name}{u.active ? "" : " (archiwalna)"}</label>
                  </div>
                ))}
              </div>
            </fieldset>
          )}
          <div className="col-12 d-flex gap-2">
            <button className="btn btn-primary" type="submit" name="pokaz" value="1">Pokaż raport</button>
            {run && <Link className="btn btn-link" href="/reports/attendance">Wyczyść</Link>}
          </div>
        </div>
      </form>

      {!summary ? null : (
        <div className="card">
          <CardHeader
            title={<>Zestawienie <span className="text-body-secondary fw-normal">({summary.rows.length} os., {summary.meetings.length} posiedzeń)</span></>}
            sub={summary.filterLabels.join(" - ")}
            right={<>{(["pdf", "docx", "xlsx"] as const).map((fmt) => <a key={fmt} className="btn btn-sm btn-outline-secondary" href={exp(fmt)}><IconDownload /> {fmt.toUpperCase()}</a>)}</>}
          />
          {summary.rows.length === 0 ? <div className="card-body text-body-secondary">Brak danych dla wybranych filtrów.</div> : (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Osoba</th>
                    <th className="text-end" title="Posiedzenia objęte członkostwem i raportem">Posiedzenia</th>
                    <th className="text-end">Obecności</th>
                    <th className="text-end" title="Obecność przez część posiedzenia (spóźnienie, wcześniejsze wyjście lub przerwa)">w tym część</th>
                    <th className="text-end">Stwierdzone nieobecności</th>
                    <th className="text-end">Brak danych</th>
                    <th className="text-end">Spóźnienia</th>
                    <th className="text-end">Wcześn. wyjścia</th>
                    <th className="text-end">Frekwencja</th>
                    <th className="text-end" title="Udział posiedzeń z ustalonym statusem">Pokrycie danych</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.userId}>
                      <td>
                        <details>
                          <summary className="fw-medium">{r.lastName} {r.firstName}{r.club ? <span className="small text-body-secondary"> ({r.club})</span> : null}</summary>
                          <ul className="small mb-0 mt-1">
                            {r.details.map((d) => (
                              <li key={d.meetingId}>
                                {date(d.date)}, <Link href={`/meetings/${d.meetingId}/attendance`}>nr {d.number}</Link>: {STATUS[d.status]}{d.quality === "PARTIAL" ? " (dane częściowe)" : ""}{d.late ? ", spóźnienie" : ""}{d.early ? ", wcześniejsze wyjście" : ""}{d.partial && d.status === "PRESENT" ? ", przez część posiedzenia" : ""}{d.excused ? ", usprawiedliwiona" : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                      <td className="text-end num">{r.meetings}</td>
                      <td className="text-end num">{r.present}</td>
                      <td className="text-end num">{r.partial}</td>
                      <td className="text-end num">{r.absent}{r.excused ? <span className="small text-body-secondary"> ({r.excused} uspr.)</span> : null}</td>
                      <td className="text-end num">{r.noData}</td>
                      <td className="text-end num">{r.late}</td>
                      <td className="text-end num">{r.early}</td>
                      <td className="text-end num fw-semibold">{pct(r.rate)}</td>
                      <td className="text-end num">{pct(r.coverage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
