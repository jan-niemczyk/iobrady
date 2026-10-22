"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CardHeader, PageContainer, PageHeader } from "../ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL } from "@/lib/inquiryLabels";
import { RichEditor } from "@/components/RichEditor";
import { IconDownload, IconTrash } from "@/components/ui/Icon";

type Person = { id: string; name: string; sortName: string };
type Row = {
  id: string; kind: string; status: string; number: string | null; title: string; published: boolean;
  submittedAt: string | null; receivedAt: string | null; registeredAt: string | null;
  authors: string[]; addressees: string[]; overdue: boolean; newAnswer: boolean; nearestDue: string | null; answers: number;
};
type Grant = { id: string; userId: string; name: string; active: boolean; orgUnit: { id: string; name: string } | null; createdAt: string; grantedBy: string | null };
type Tab = "registry" | "external" | "grants" | "responders";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "-");
const FILTER_KEYS = ["rodzaj", "status", "numer", "okres", "autor", "adresat", "q", "od", "do", "oczekujace", "po_terminie", "nowe_odpowiedzi"] as const;
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/**
 * Rejestr interpelacji i zapytań (operator): filtry, sprawy oczekujące/po terminie/z nowymi
 * odpowiedziami, eksport XLSX/PDF, wprowadzenie pisma otrzymanego poza aplikacją i prawa składania.
 */
export function InquiriesRegistryClient({ enabled, publicArchive, units, users }: { enabled: boolean; publicArchive: boolean; units: { id: string; name: string }[]; users: Person[] }) {
  const [tab, setTab] = useState<Tab>("registry");
  return (
    <PageContainer size="xl">
      <PageHeader title="Interpelacje i zapytania"
        description={enabled
          ? `Rejestr spraw, przekazania, odpowiedzi i publikacja.${publicArchive ? " Publiczny rejestr: /public/interpelacje." : " Publiczny rejestr jest wyłączony w Ustawieniach."}`
          : "Moduł jest wyłączony w Ustawieniach - nowe sprawy i czynności są zablokowane. Odczyt i eksport archiwum pozostają dostępne."} />
      {!enabled && <div className="alert alert-warning">Moduł wyłączony. Włączysz go w <Link href="/settings">Ustawieniach</Link>.</div>}
      <ul className="nav nav-tabs mb-3">
        {([["registry", "Rejestr"], ["external", "Wprowadź pismo"], ["grants", "Prawo składania"], ["responders", "Konta odpowiadających"]] as [Tab, string][]).map(([k, l]) => (
          <li key={k} className="nav-item"><button type="button" className={`nav-link${tab === k ? " active" : ""}`} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{l}</button></li>
        ))}
      </ul>
      {tab === "registry" && <Registry />}
      {tab === "external" && <ExternalForm enabled={enabled} units={units} users={users} />}
      {tab === "grants" && <Grants units={units} users={users} />}
      {tab === "responders" && <Responders />}
    </PageContainer>
  );
}

function Registry() {
  const [f, setF] = useState<Filters>({});
  const [applied, setApplied] = useState<Filters>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    for (const k of FILTER_KEYS) if (applied[k]) sp.set(k, applied[k]!);
    return sp.toString();
  }, [applied]);
  useEffect(() => {
    let alive = true;
    setRows(null);
    fetch(`/api/inquiries?${qs}`, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) { await notifyFailure(r); if (alive) setRows([]); return; }
      const d = await r.json();
      if (alive) setRows(d);
    });
    return () => { alive = false; };
  }, [qs]);
  const set = (k: keyof Filters, v: string) => setF((p) => ({ ...p, [k]: v }));
  const quick = (k: "oczekujace" | "po_terminie" | "nowe_odpowiedzi") => { const n = { ...applied, [k]: applied[k] ? "" : "1" }; setF(n); setApplied(n); };

  return (
    <>
      <form className="card mb-3" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <div className="card-body row g-2 align-items-end">
          <div className="col-6 col-md-2"><label className="form-label small" htmlFor="rf-kind">Rodzaj</label>
            <select id="rf-kind" className="form-select form-select-sm" value={f.rodzaj ?? ""} onChange={(e) => set("rodzaj", e.target.value)}><option value="">Wszystkie</option><option value="INTERPELLATION">Interpelacje</option><option value="QUESTION">Zapytania</option></select></div>
          <div className="col-6 col-md-2"><label className="form-label small" htmlFor="rf-status">Status</label>
            <select id="rf-status" className="form-select form-select-sm" value={f.status ?? ""} onChange={(e) => set("status", e.target.value)}><option value="">Wszystkie</option>{Object.entries(INQUIRY_STATUS_LABEL).filter(([k]) => k !== "DRAFT").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="col-4 col-md-1"><label className="form-label small" htmlFor="rf-num">Numer</label><input id="rf-num" className="form-control form-control-sm" value={f.numer ?? ""} onChange={(e) => set("numer", e.target.value)} /></div>
          <div className="col-4 col-md-1"><label className="form-label small" htmlFor="rf-per">Rok / kadencja</label><input id="rf-per" className="form-control form-control-sm" value={f.okres ?? ""} onChange={(e) => set("okres", e.target.value)} /></div>
          <div className="col-4 col-md-2"><label className="form-label small" htmlFor="rf-aut">Autor / współautor</label><input id="rf-aut" className="form-control form-control-sm" value={f.autor ?? ""} onChange={(e) => set("autor", e.target.value)} /></div>
          <div className="col-6 col-md-2"><label className="form-label small" htmlFor="rf-adr">Adresat</label><input id="rf-adr" className="form-control form-control-sm" value={f.adresat ?? ""} onChange={(e) => set("adresat", e.target.value)} /></div>
          <div className="col-6 col-md-2"><label className="form-label small" htmlFor="rf-q">Tytuł lub treść</label><input id="rf-q" className="form-control form-control-sm" value={f.q ?? ""} onChange={(e) => set("q", e.target.value)} /></div>
          <div className="col-6 col-md-2"><label className="form-label small" htmlFor="rf-od">Wpływ od</label><input id="rf-od" type="date" className="form-control form-control-sm" value={f.od ?? ""} onChange={(e) => set("od", e.target.value)} /></div>
          <div className="col-6 col-md-2"><label className="form-label small" htmlFor="rf-do">Wpływ do</label><input id="rf-do" type="date" className="form-control form-control-sm" value={f.do ?? ""} onChange={(e) => set("do", e.target.value)} /></div>
          <div className="col-12 col-md-8 d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-sm btn-primary">Filtruj</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setF({}); setApplied({}); }}>Wyczyść</button>
            <button type="button" className={`btn btn-sm btn-outline-secondary${applied.oczekujace ? " active" : ""}`} aria-pressed={!!applied.oczekujace} onClick={() => quick("oczekujace")}>Oczekujące</button>
            <button type="button" className={`btn btn-sm btn-outline-danger${applied.po_terminie ? " active" : ""}`} aria-pressed={!!applied.po_terminie} onClick={() => quick("po_terminie")}>Po terminie</button>
            <button type="button" className={`btn btn-sm btn-outline-success${applied.nowe_odpowiedzi ? " active" : ""}`} aria-pressed={!!applied.nowe_odpowiedzi} onClick={() => quick("nowe_odpowiedzi")}>Nowe odpowiedzi (14 dni)</button>
            <a className="btn btn-sm btn-outline-secondary ms-md-auto" href={`/api/inquiries/export?format=xlsx&${qs}`}><IconDownload size={14} /> XLSX</a>
            <a className="btn btn-sm btn-outline-secondary" href={`/api/inquiries/export?format=pdf&${qs}`}><IconDownload size={14} /> PDF</a>
          </div>
        </div>
      </form>
      <div className="card">
        <CardHeader title={<>Sprawy <span className="text-body-secondary fw-normal">({rows?.length ?? "…"})</span></>} />
        {rows === null ? <div className="card-body text-body-secondary">Wczytywanie…</div> : rows.length === 0 ? <div className="card-body text-body-secondary">Brak spraw.</div> : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead><tr><th scope="col">Numer</th><th scope="col">Sprawa</th><th scope="col">Autorzy</th><th scope="col">Adresaci</th><th scope="col">Wpływ</th><th scope="col">Status</th><th scope="col">Termin</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-nowrap">{r.number ?? <span className="text-body-secondary">bez numeru</span>}</td>
                    <td><div className="small text-body-secondary">{INQUIRY_KIND_LABEL[r.kind]}{r.published ? " - opublikowana" : ""}</div><Link href={`/inquiries/${r.id}`} className="fw-medium">{r.title}</Link></td>
                    <td className="small">{r.authors.join(", ")}</td>
                    <td className="small">{r.addressees.join("; ")}</td>
                    <td className="small text-nowrap">{fmt(r.receivedAt ?? r.submittedAt)}</td>
                    <td><span className="badge text-bg-light border">{INQUIRY_STATUS_LABEL[r.status]}</span>{r.newAnswer && <span className="badge text-bg-success ms-1">nowa odpowiedź</span>}</td>
                    <td className="small text-nowrap">{r.nearestDue ? fmt(r.nearestDue) : "-"}{r.overdue && <span className="badge text-bg-danger ms-1">po terminie</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ExternalForm({ enabled, units, users }: { enabled: boolean; units: { id: string; name: string }[]; users: Person[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState("INTERPELLATION");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [authors, setAuthors] = useState<{ userId: string; name: string }[]>([{ userId: "", name: "" }]);
  const [addressees, setAddressees] = useState<{ name: string; institution: string }[]>([{ name: "", institution: "" }]);
  const [receivedAt, setReceivedAt] = useState(today);
  const [letterDate, setLetterDate] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [registerNow, setRegisterNow] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const au = authors.map((a) => ({ userId: a.userId || null, name: a.name.trim() || users.find((u) => u.id === a.userId)?.name || "" })).filter((a) => a.name);
    const ad = addressees.filter((a) => a.name.trim());
    if (!title.trim() || !au.length || !ad.length) { notify.warning("Uzupełnij tytuł, autora i adresata."); return; }
    setBusy(true);
    const r = await fetch("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      kind, title, body, authors: au, addressees: ad, receivedAt: new Date(`${receivedAt}T12:00:00`).toISOString(),
      letterDate: letterDate ? new Date(`${letterDate}T12:00:00`).toISOString() : null, orgUnitId: orgUnitId || null, registerNow,
    }) });
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    const d = await r.json();
    notify.success(registerNow ? "Wprowadzono i zarejestrowano pismo." : "Wprowadzono pismo.");
    router.push(`/inquiries/${d.id}`);
  }

  return (
    <div className="card">
      <CardHeader title="Pismo otrzymane poza aplikacją" />
      <div className="card-body row g-3">
        <div className="col-12"><div className="form-text mt-0">Autorem sprawy pozostaje rzeczywisty autor pisma; operator jest zapisywany jako osoba wprowadzająca. To nie jest złożenie w imieniu autora.</div></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="ex-kind">Rodzaj</label><select id="ex-kind" className="form-select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="INTERPELLATION">Interpelacja</option><option value="QUESTION">Zapytanie</option></select></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="ex-rec">Data wpływu</label><input id="ex-rec" type="date" className="form-control" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="ex-ld">Data pisma <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label><input id="ex-ld" type="date" className="form-control" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} /></div>
        <div className="col-6 col-md-3"><label className="form-label" htmlFor="ex-unit">Organ / grupa <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label><select id="ex-unit" className="form-select" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}><option value="">-</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="col-12"><label className="form-label" htmlFor="ex-title">Tytuł</label><input id="ex-title" className="form-control" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="col-12 col-lg-6">
          <fieldset><legend className="form-label fs-6">Autorzy pisma (wspólne pismo - kilka osób)</legend>
            {authors.map((a, i) => (
              <div key={i} className="d-flex gap-2 mb-1">
                <select className="form-select form-select-sm" aria-label={`Autor ${i + 1}: konto`} value={a.userId} onChange={(e) => setAuthors(authors.map((x, j) => (j === i ? { ...x, userId: e.target.value } : x)))}>
                  <option value="">Spoza listy (wpisz nazwę)</option>{users.map((u) => <option key={u.id} value={u.id}>{u.sortName}</option>)}
                </select>
                {!a.userId && <input className="form-control form-control-sm" aria-label={`Autor ${i + 1}: imię i nazwisko`} placeholder="Imię i nazwisko" value={a.name} onChange={(e) => setAuthors(authors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />}
                {authors.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger" aria-label={`Usuń autora ${i + 1}`} onClick={() => setAuthors(authors.filter((_, j) => j !== i))}><IconTrash size={14} /></button>}
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setAuthors([...authors, { userId: "", name: "" }])}>Dodaj autora</button>
          </fieldset>
        </div>
        <div className="col-12 col-lg-6">
          <AddresseesEditor value={addressees} onChange={setAddressees} />
        </div>
        <div className="col-12"><RichEditor id="ex-body" label="Treść pisma" value={body} onChange={setBody} minHeight={200} /></div>
        <div className="col-12 d-flex flex-wrap align-items-center gap-3">
          <div className="form-check"><input className="form-check-input" type="checkbox" id="ex-reg" checked={registerNow} onChange={(e) => setRegisterNow(e.target.checked)} /><label className="form-check-label" htmlFor="ex-reg">Od razu zarejestruj (nadaj kolejny numer)</label></div>
          <button type="button" className="btn btn-primary" disabled={busy || !enabled} onClick={submit}>Wprowadź pismo</button>
        </div>
      </div>
    </div>
  );
}

export function AddresseesEditor({ value, onChange }: { value: { name: string; institution: string }[]; onChange: (v: { name: string; institution: string }[]) => void }) {
  return (
    <fieldset><legend className="form-label fs-6">Adresaci</legend>
      {value.map((a, i) => (
        <div key={i} className="d-flex gap-2 mb-1">
          <input className="form-control form-control-sm" aria-label={`Adresat ${i + 1}: nazwa lub funkcja`} placeholder="np. Burmistrz Miasta" value={a.name} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input className="form-control form-control-sm" aria-label={`Adresat ${i + 1}: instytucja`} placeholder="Instytucja (opcjonalnie)" value={a.institution} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)))} />
          {value.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger" aria-label={`Usuń adresata ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><IconTrash size={14} /></button>}
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onChange([...value, { name: "", institution: "" }])}>Dodaj adresata</button>
    </fieldset>
  );
}

function Grants({ units, users }: { units: { id: string; name: string }[]; users: Person[] }) {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [userId, setUserId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/inquiries/grants", { cache: "no-store" });
    if (!r.ok) { await notifyFailure(r); return; }
    setGrants(await r.json());
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function grant() {
    if (!userId) { notify.warning("Wybierz osobę."); return; }
    const r = await fetch("/api/inquiries/grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, orgUnitId: orgUnitId || null }) });
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Nadano prawo.");
    setUserId("");
    await load();
  }
  async function revoke(g: Grant) {
    if (!(await ask({ title: "Odebrać prawo?", message: `${g.name} - bez możliwości składania nowych pism i potwierdzania współautorstwa (także w otwartej sesji). Dostęp do dotychczasowych spraw zostaje.`, confirmLabel: "Odbierz", danger: true }))) return;
    const r = await fetch(`/api/inquiries/grants/${g.id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Odebrano prawo.");
    await load();
  }
  return (
    <div className="card">
      <CardHeader title="Prawo „Składanie interpelacji i zapytań”" />
      <div className="card-body">
        <p className="small text-body-secondary">Prawo nadaje się indywidualnie. Nie wynika z roli radnego, członkostwa w organie, posiadania konta ani wskazania jako współautor. Nadania i odebrania są zapisywane w dzienniku.</p>
        <div className="row g-2 align-items-end mb-3">
          <div className="col-12 col-md-5"><label className="form-label" htmlFor="gr-user">Osoba</label><select id="gr-user" className="form-select" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Wybierz…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.sortName}</option>)}</select></div>
          <div className="col-12 col-md-4"><label className="form-label" htmlFor="gr-unit">Zakres (organ)</label><select id="gr-unit" className="form-select" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}><option value="">Cała jednostka</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div className="col-12 col-md-3"><button type="button" className="btn btn-primary" onClick={grant}>Nadaj prawo</button></div>
        </div>
        {grants === null ? <div className="text-body-secondary">Wczytywanie…</div> : grants.length === 0 ? <div className="text-body-secondary">Nikt nie ma nadanego prawa.</div> : (
          <ul className="list-group">
            {grants.map((g) => (
              <li key={g.id} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div><span className="fw-medium">{g.name}</span>{!g.active && <span className="badge text-bg-secondary ms-1">konto nieaktywne</span>}
                  <div className="small text-body-secondary">Zakres: {g.orgUnit?.name ?? "cała jednostka"} - nadano {fmt(g.createdAt)}{g.grantedBy ? ` (${g.grantedBy})` : ""}</div></div>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => revoke(g)}>Odbierz</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type Responder = { id: string; email: string; firstName: string; lastName: string; functionTitle: string | null; active: boolean; cases: number };

/**
 * Konta odpowiadających: logowanie wyłącznie do spraw przekazanych przypisanemu adresatowi
 * i składania odpowiedzi. Przypisanie - przy adresacie w karcie sprawy.
 */
function Responders() {
  const [list, setList] = useState<Responder[] | null>(null);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", functionTitle: "" });
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/inquiries/responders", { cache: "no-store" });
    if (!r.ok) { await notifyFailure(r); return; }
    setList(await r.json());
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function create() {
    const r = await fetch("/api/inquiries/responders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    if (!r.ok) { await notifyFailure(r); return; }
    const d = await r.json();
    setCreated({ name: `${f.firstName} ${f.lastName}`, email: f.email, password: d.password });
    setF({ firstName: "", lastName: "", email: "", functionTitle: "" });
    await load();
  }
  async function patch(u: Responder, body: Record<string, unknown>, ok: string) {
    const r = await fetch(`/api/inquiries/responders/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { await notifyFailure(r); return; }
    const d = await r.json();
    if (d.password) setCreated({ name: `${u.firstName} ${u.lastName}`, email: u.email, password: d.password });
    notify.success(ok);
    await load();
  }
  return (
    <div className="card">
      <CardHeader title="Konta odpowiadających" />
      <div className="card-body">
        <div className="row g-2 align-items-end mb-3">
          <div className="col-6 col-md-2"><label className="form-label" htmlFor="rp-fn">Imię</label><input id="rp-fn" className="form-control" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
          <div className="col-6 col-md-3"><label className="form-label" htmlFor="rp-ln">Nazwisko</label><input id="rp-ln" className="form-control" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
          <div className="col-12 col-md-3"><label className="form-label" htmlFor="rp-em">E-mail (login)</label><input id="rp-em" type="email" className="form-control" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="col-12 col-md-2"><label className="form-label" htmlFor="rp-fu">Stanowisko / jednostka</label><input id="rp-fu" className="form-control" value={f.functionTitle} onChange={(e) => setF({ ...f, functionTitle: e.target.value })} /></div>
          <div className="col-12 col-md-2"><button type="button" className="btn btn-primary w-100" onClick={create}>Utwórz konto</button></div>
        </div>
        {created && (
          <div className="alert alert-success d-flex flex-wrap justify-content-between gap-2" role="status">
            <span>{created.name} - login: <strong>{created.email}</strong>, hasło startowe: <strong className="font-monospace">{created.password}</strong>. Hasło jest pokazywane tylko teraz.</span>
            <button type="button" className="btn-close" aria-label="Zamknij" onClick={() => setCreated(null)} />
          </div>
        )}
        {list === null ? <div className="text-body-secondary">Wczytywanie…</div> : list.length === 0 ? <div className="text-body-secondary">Brak kont odpowiadających.</div> : (
          <ul className="list-group">
            {list.map((u) => (
              <li key={u.id} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div><span className="fw-medium">{u.lastName} {u.firstName}</span>{!u.active && <span className="badge text-bg-secondary ms-1">nieaktywne</span>}
                  <div className="small text-body-secondary">{u.email}{u.functionTitle ? ` - ${u.functionTitle}` : ""} - przypisani adresaci: {u.cases}</div></div>
                <div className="dropdown">
                  <button className="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Więcej</button>
                  <ul className="dropdown-menu dropdown-menu-end">
                    <li><button type="button" className="dropdown-item" onClick={() => patch(u, { resetPassword: true }, "Nadano nowe hasło startowe.")}>Nowe hasło startowe</button></li>
                    <li><button type="button" className="dropdown-item" onClick={() => patch(u, { active: !u.active }, u.active ? "Dezaktywowano konto." : "Aktywowano konto.")}>{u.active ? "Dezaktywuj" : "Aktywuj"}</button></li>
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
