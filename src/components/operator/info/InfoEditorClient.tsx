"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CardHeader, PageContainer, PageHeader } from "../ui";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { INFO_CATEGORIES, INFO_STATUS_LABEL } from "@/lib/infoLabels";
import { RichTextField } from "../notices/RichTextField";
import { RichTextView } from "@/components/RichTextView";
import { IconArrowLeft, IconDownload, IconTrash } from "@/components/ui/Icon";

type Unit = { id: string; name: string; members: number };
type UserOpt = { id: string; name: string; functionTitle: string };
type Form = {
  title: string; body: string; category: string; kind: "NEWS" | "DOCUMENT"; pinned: boolean; important: boolean;
  eventAt: string; expiresAt: string; links: { label: string; url: string }[];
  audienceAll: boolean; audienceOrgUnitIds: string[]; audienceUserIds: string[];
};
type Loaded = Form & {
  id: string; status: string; version: number; publishedAt: string | null; author: string | null; editor: string | null;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
  versions: { version: number; createdAt: string; editor: string | null }[];
};
type ReadRow = { userId: string; name: string; club: string | null; current: boolean; readCurrent: boolean; firstOpenedAt: string | null; lastOpenedAt: string | null; openCount: number; earlierVersions: number[] };

const EMPTY: Form = { title: "", body: "", category: "Komunikat", kind: "NEWS", pinned: false, important: false, eventAt: "", expiresAt: "", links: [], audienceAll: true, audienceOrgUnitIds: [], audienceUserIds: [] };
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "-");
/** ISO -> wartość pola datetime-local w czasie lokalnym przeglądarki. */
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const sizeLabel = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/**
 * Edycja komunikatu / dokumentu stałego: treść, odbiorcy (wszyscy radni, grupy, wybrane osoby -
 * osoba w kilku grupach dostaje komunikat raz), załączniki, publikacja, wersje i zestawienie otwarć.
 */
export function InfoEditorClient({ id, units, users }: { id: string | null; units: Unit[]; users: UserOpt[] }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [state, setState] = useState<"loading" | "ok" | "error">(id ? "loading" : "ok");
  const [busy, setBusy] = useState(false);
  const [significant, setSignificant] = useState(true);
  const [tab, setTab] = useState<"content" | "reads">("content");
  const [userQuery, setUserQuery] = useState("");
  const [reads, setReads] = useState<{ rows: ReadRow[]; summary: { recipients: number; readCurrent: number } } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await fetch(`/api/info/${id}`, { cache: "no-store" });
    if (!r.ok) { setState("error"); return; }
    const d = await r.json();
    setLoaded(d);
    setForm({
      title: d.title, body: d.body, category: d.category, kind: d.kind, pinned: d.pinned, important: d.important,
      eventAt: toLocal(d.eventAt), expiresAt: toLocal(d.expiresAt), links: d.links,
      audienceAll: d.audienceAll, audienceOrgUnitIds: d.audienceOrgUnitIds, audienceUserIds: d.audienceUserIds,
    });
    setState("ok");
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const loadReads = useCallback(async () => {
    if (!id) return;
    const r = await fetch(`/api/info/${id}/reads`, { cache: "no-store" });
    if (!r.ok) { await notifyFailure(r); return; }
    setReads(await r.json());
  }, [id]);
  useEffect(() => { if (tab === "reads") void loadReads(); }, [tab, loadReads]);

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const payload = () => ({ ...form, eventAt: fromLocal(form.eventAt), expiresAt: fromLocal(form.expiresAt), links: form.links.filter((l) => l.url.trim()) });
  const dirtyContent = loaded && (loaded.title !== form.title || loaded.body !== form.body || JSON.stringify(loaded.links) !== JSON.stringify(form.links.filter((l) => l.url.trim())));

  async function save(action: "save" | "publish" | "archive" | "restore") {
    if (!form.title.trim()) { notify.warning("Podaj tytuł."); return; }
    if (action === "publish" && !(await ask({ title: "Opublikować informację?", message: "Odbiorcy zobaczą ją w panelu i dostaną powiadomienie w aplikacji. Informacja nie trafia do widoku publicznego.", confirmLabel: "Opublikuj" }))) return;
    if (action === "archive" && !(await ask({ title: "Przenieść do archiwum?", message: "Odbiorcy przestaną ją widzieć. Historia otwarć zostaje.", confirmLabel: "Do archiwum" }))) return;
    setBusy(true);
    let r: Response;
    if (!id) {
      r = await fetch("/api/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      if (r.ok) {
        const d = await r.json();
        if (action === "publish") {
          const p = await fetch(`/api/info/${d.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish" }) });
          if (!p.ok) await notifyFailure(p);
        }
        setBusy(false);
        notify.success(action === "publish" ? "Opublikowano informację." : "Zapisano szkic.");
        router.replace(`/info/${d.id}`);
        return;
      }
    } else {
      const body = action === "archive" || action === "restore" ? { action } : { ...payload(), action, significant: loaded?.status === "PUBLISHED" ? significant : undefined };
      r = await fetch(`/api/info/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setBusy(false);
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success({ save: "Zapisano.", publish: "Opublikowano informację.", archive: "Przeniesiono do archiwum.", restore: "Przywrócono informację." }[action]);
    await load();
    if (tab === "reads") await loadReads();
  }

  async function remove() {
    if (!id || !(await ask({ title: "Usunąć szkic?", message: "Szkic i jego załączniki zostaną usunięte.", confirmLabel: "Usuń", danger: true }))) return;
    const r = await fetch(`/api/info/${id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    notify.success("Usunięto szkic.");
    router.push("/info");
  }

  async function upload(files: FileList | null) {
    if (!id || !files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(`/api/info/${id}/attachments`, { method: "POST", body: fd });
      if (!r.ok) await notifyFailure(r);
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
    await load();
  }

  async function removeAttachment(a: { id: string; fileName: string }) {
    if (!(await ask({ title: "Usunąć załącznik?", message: a.fileName, confirmLabel: "Usuń", danger: true }))) return;
    const r = await fetch(`/api/info/attachments/${a.id}`, { method: "DELETE" });
    if (!r.ok) { await notifyFailure(r); return; }
    await load();
  }

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const userMatches = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return q ? users.filter((u) => `${u.name} ${u.functionTitle}`.toLowerCase().includes(q)).slice(0, 30) : [];
  }, [users, userQuery]);
  const chosenUsers = users.filter((u) => form.audienceUserIds.includes(u.id));

  if (state === "loading") return <PageContainer size="lg"><div className="text-body-secondary py-4">Wczytywanie…</div></PageContainer>;
  if (state === "error") return <PageContainer size="lg"><div className="alert alert-danger mt-4">Nie znaleziono informacji. <Link href="/info">Wróć do listy</Link></div></PageContainer>;

  const status = loaded?.status ?? "DRAFT";
  return (
    <PageContainer size="xl">
      <PageHeader
        kicker={<Link href="/info" className="d-inline-flex align-items-center gap-1"><IconArrowLeft size={14} /> Informacje</Link>}
        title={id ? form.title || "Informacja" : "Nowa informacja"}
        description={loaded ? `${INFO_STATUS_LABEL[status]} - wersja ${loaded.version}${loaded.publishedAt ? ` - opublikowano ${dt(loaded.publishedAt)}` : ""}${loaded.author ? ` - autor: ${loaded.author}` : ""}${loaded.editor && loaded.editor !== loaded.author ? `, ostatnia zmiana: ${loaded.editor}` : ""}` : "Szkic nie jest widoczny dla odbiorców do czasu publikacji."}
      />
      {id && (
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item"><button type="button" className={`nav-link${tab === "content" ? " active" : ""}`} aria-current={tab === "content" ? "page" : undefined} onClick={() => setTab("content")}>Treść i odbiorcy</button></li>
          <li className="nav-item"><button type="button" className={`nav-link${tab === "reads" ? " active" : ""}`} aria-current={tab === "reads" ? "page" : undefined} onClick={() => setTab("reads")}>Odbiorcy i otwarcia</button></li>
        </ul>
      )}

      {tab === "reads" && id ? (
        <div className="card">
          <CardHeader title={reads ? <>Otwarcia bieżącej wersji: {reads.summary.readCurrent} z {reads.summary.recipients}</> : "Otwarcia"}
            right={<a className="btn btn-sm btn-outline-secondary" href={`/api/info/${id}/reads?format=xlsx`}><IconDownload size={14} /> Eksport XLSX</a>} />
          <div className="card-body small text-body-secondary pb-0">Zestawienie pokazuje otwarcia treści w aplikacji. Nie jest dowodem zapoznania się ani formalnego doręczenia. Pobranie listy przez radnego nie jest liczone jako otwarcie.</div>
          {!reads ? <div className="card-body text-body-secondary">Wczytywanie…</div> : reads.rows.length === 0 ? <div className="card-body text-body-secondary">Brak odbiorców.</div> : (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead><tr><th scope="col">Osoba</th><th scope="col">Bieżąca wersja</th><th scope="col">Pierwsze otwarcie</th><th scope="col">Ostatnie otwarcie</th><th scope="col">Otwarć</th><th scope="col">Wcześniejsze wersje</th></tr></thead>
                <tbody>
                  {reads.rows.map((r) => (
                    <tr key={r.userId}>
                      <td>{r.name}{r.club ? <span className="text-body-secondary"> ({r.club})</span> : null}{!r.current && <span className="badge text-bg-light border ms-1">poza odbiorcami</span>}</td>
                      <td>{r.readCurrent ? <span className="badge text-bg-success">otwarta</span> : <span className="badge text-bg-secondary">nieotwarta</span>}</td>
                      <td>{dt(r.firstOpenedAt)}</td><td>{dt(r.lastOpenedAt)}</td><td>{r.openCount || "-"}</td>
                      <td>{r.earlierVersions.length ? r.earlierVersions.join(", ") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="row g-3">
          <div className="col-12 col-xxl-7 d-flex flex-column gap-3">
            <div className="card">
              <CardHeader title="Treść" />
              <div className="card-body row g-2">
                <div className="col-12"><label className="form-label" htmlFor="if-title">Tytuł</label><input id="if-title" className="form-control" value={form.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} /></div>
                <div className="col-6 col-md-4"><label className="form-label" htmlFor="if-kind">Rodzaj</label>
                  <select id="if-kind" className="form-select" value={form.kind} onChange={(e) => set({ kind: e.target.value as Form["kind"] })}><option value="NEWS">Komunikat</option><option value="DOCUMENT">Dokument stały</option></select></div>
                <div className="col-6 col-md-4"><label className="form-label" htmlFor="if-cat">Kategoria</label>
                  <input id="if-cat" className="form-control" list="if-cats" value={form.category} maxLength={100} onChange={(e) => set({ category: e.target.value })} />
                  <datalist id="if-cats">{INFO_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></div>
                <div className="col-12 col-md-4 d-flex flex-column justify-content-end gap-1">
                  <div className="form-check"><input className="form-check-input" type="checkbox" id="if-pin" checked={form.pinned} onChange={(e) => set({ pinned: e.target.checked })} /><label className="form-check-label" htmlFor="if-pin">Przypięta na górze</label></div>
                  <div className="form-check"><input className="form-check-input" type="checkbox" id="if-imp" checked={form.important} onChange={(e) => set({ important: e.target.checked })} /><label className="form-check-label" htmlFor="if-imp">Ważna</label></div>
                </div>
                <div className="col-12"><RichTextField id="if-body" label="Treść" value={form.body} onChange={(v) => set({ body: v })} rows={10} placeholders={false} maxLength={100000} /></div>
                <div className="col-6"><label className="form-label" htmlFor="if-event">Termin wydarzenia <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label><input id="if-event" type="datetime-local" className="form-control" value={form.eventAt} onChange={(e) => set({ eventAt: e.target.value })} /></div>
                <div className="col-6"><label className="form-label" htmlFor="if-exp">Widoczna do <span className="text-body-secondary fw-normal">(opcjonalnie)</span></label><input id="if-exp" type="datetime-local" className="form-control" value={form.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
                  <div className="form-text">{form.kind === "DOCUMENT" ? "Dokument stały może pozostać bez terminu końcowego." : "Po tym terminie komunikat znika z listy radnego."}</div></div>
              </div>
            </div>

            <div className="card">
              <CardHeader title="Odnośniki" right={<button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => set({ links: [...form.links, { label: "", url: "" }] })}>Dodaj odnośnik</button>} />
              <div className="card-body">
                {form.links.length === 0 ? <div className="text-body-secondary small">Brak odnośników.</div> : form.links.map((l, i) => (
                  <div key={i} className="row g-2 mb-2 align-items-end">
                    <div className="col-12 col-md-4"><label className="form-label small" htmlFor={`if-ll-${i}`}>Opis</label><input id={`if-ll-${i}`} className="form-control form-control-sm" value={l.label} maxLength={200} onChange={(e) => set({ links: form.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /></div>
                    <div className="col-10 col-md-7"><label className="form-label small" htmlFor={`if-lu-${i}`}>Adres (https://…)</label><input id={`if-lu-${i}`} className="form-control form-control-sm" value={l.url} maxLength={1000} onChange={(e) => set({ links: form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} /></div>
                    <div className="col-2 col-md-1"><button type="button" className="btn btn-sm btn-outline-danger" aria-label={`Usuń odnośnik ${i + 1}`} onClick={() => set({ links: form.links.filter((_, j) => j !== i) })}><IconTrash size={14} /></button></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <CardHeader title={`Załączniki (${loaded?.attachments.length ?? 0})`} />
              <div className="card-body">
                {!id ? <div className="text-body-secondary small">Załączniki można dodać po pierwszym zapisaniu szkicu.</div> : (
                  <>
                    {loaded?.attachments.length ? (
                      <ul className="list-unstyled mb-3">
                        {loaded.attachments.map((a) => (
                          <li key={a.id} className="d-flex align-items-center gap-2 py-1 border-bottom">
                            <a href={`/api/info/attachments/${a.id}`} className="flex-grow-1 text-break">{a.fileName}</a>
                            <span className="small text-body-secondary">{sizeLabel(a.sizeBytes)}</span>
                            <button type="button" className="btn btn-sm btn-outline-danger" aria-label={`Usuń ${a.fileName}`} onClick={() => removeAttachment(a)}><IconTrash size={14} /></button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <label className="form-label" htmlFor="if-file">Dodaj pliki (PDF, DOCX, XLSX, PNG, JPG, WEBP; do 20 MB)</label>
                    <input id="if-file" ref={fileInput} type="file" multiple className="form-control" disabled={busy} accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(e) => upload(e.target.files)} />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="col-12 col-xxl-5 d-flex flex-column gap-3">
            <div className="card">
              <CardHeader title="Odbiorcy" />
              <div className="card-body">
                <div className="form-check mb-2"><input className="form-check-input" type="checkbox" id="if-all" checked={form.audienceAll} onChange={(e) => set({ audienceAll: e.target.checked })} /><label className="form-check-label" htmlFor="if-all">Wszyscy radni (wszystkie aktywne konta uczestników)</label></div>
                <fieldset className="mb-3" disabled={form.audienceAll}>
                  <legend className="fs-6 fw-semibold mb-1">Grupy organizacyjne</legend>
                  <div className="form-text mt-0 mb-1">Widoczność według bieżącego składu - nowy członek widzi aktualne informacje grupy. Osoba w kilku grupach dostaje informację raz.</div>
                  {units.length === 0 ? <div className="small text-body-secondary">Brak grup.</div> : units.map((u) => (
                    <div key={u.id} className="form-check"><input className="form-check-input" type="checkbox" id={`if-u-${u.id}`} checked={form.audienceOrgUnitIds.includes(u.id)} onChange={() => set({ audienceOrgUnitIds: toggle(form.audienceOrgUnitIds, u.id) })} /><label className="form-check-label" htmlFor={`if-u-${u.id}`}>{u.name} <span className="text-body-secondary">({u.members})</span></label></div>
                  ))}
                </fieldset>
                <fieldset disabled={form.audienceAll}>
                  <legend className="fs-6 fw-semibold mb-1">Wybrane osoby</legend>
                  <label className="visually-hidden" htmlFor="if-uq">Szukaj osoby</label>
                  <input id="if-uq" type="search" className="form-control form-control-sm mb-1" placeholder="Szukaj po nazwisku" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
                  {userMatches.length > 0 && (
                    <ul className="list-group mb-2" style={{ maxHeight: 200, overflowY: "auto" }}>
                      {userMatches.map((u) => (
                        <li key={u.id} className="list-group-item py-1"><div className="form-check mb-0"><input className="form-check-input" type="checkbox" id={`if-p-${u.id}`} checked={form.audienceUserIds.includes(u.id)} onChange={() => set({ audienceUserIds: toggle(form.audienceUserIds, u.id) })} /><label className="form-check-label" htmlFor={`if-p-${u.id}`}>{u.name}{u.functionTitle ? <span className="text-body-secondary"> - {u.functionTitle}</span> : null}</label></div></li>
                      ))}
                    </ul>
                  )}
                  {chosenUsers.length > 0 && (
                    <div className="d-flex flex-wrap gap-1">
                      {chosenUsers.map((u) => <button key={u.id} type="button" className="btn btn-sm btn-light border" onClick={() => set({ audienceUserIds: toggle(form.audienceUserIds, u.id) })} aria-label={`Usuń ${u.name} z odbiorców`}>{u.name} ×</button>)}
                    </div>
                  )}
                </fieldset>
              </div>
            </div>

            <div className="card">
              <CardHeader title="Zapis i publikacja" />
              <div className="card-body d-flex flex-column gap-2">
                {status === "PUBLISHED" && dirtyContent && (
                  <div className="form-check"><input className="form-check-input" type="checkbox" id="if-sig" checked={significant} onChange={(e) => setSignificant(e.target.checked)} />
                    <label className="form-check-label" htmlFor="if-sig">Istotna zmiana treści - nowa wersja (odbiorcy zobaczą ją jako nieprzeczytaną; historia otwarć zostaje)</label></div>
                )}
                <div className="d-flex flex-wrap gap-2">
                  {status === "DRAFT" && <button className="btn btn-outline-primary" disabled={busy} onClick={() => save("save")}>Zapisz szkic</button>}
                  {status === "DRAFT" && <button className="btn btn-primary" disabled={busy} onClick={() => save("publish")}>Opublikuj</button>}
                  {status === "PUBLISHED" && <button className="btn btn-primary" disabled={busy} onClick={() => save("save")}>Zapisz zmiany</button>}
                  {status === "PUBLISHED" && <button className="btn btn-outline-secondary" disabled={busy} onClick={() => save("archive")}>Do archiwum</button>}
                  {status === "ARCHIVED" && <button className="btn btn-outline-primary" disabled={busy} onClick={() => save("restore")}>Przywróć</button>}
                  {id && status === "DRAFT" && <button className="btn btn-outline-danger" disabled={busy} onClick={remove}>Usuń szkic</button>}
                </div>
                <div className="form-text">Powiadomienie w aplikacji otrzymują odbiorcy przy publikacji i przy nowej wersji. Informacje nie są publikowane w widoku publicznym.</div>
                {loaded && loaded.versions.length > 0 && (
                  <details><summary className="small">Historia wersji ({loaded.versions.length})</summary>
                    <ul className="small mb-0 mt-1">{loaded.versions.map((v) => <li key={v.version}>Wersja {v.version} - {dt(v.createdAt)}{v.editor ? ` - ${v.editor}` : ""}</li>)}</ul>
                  </details>
                )}
              </div>
            </div>

            <div className="card">
              <CardHeader title="Podgląd treści" />
              <div className="card-body"><h2 className="h5">{form.title || "(bez tytułu)"}</h2><RichTextView text={form.body} /></div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
