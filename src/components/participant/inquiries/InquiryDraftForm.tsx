"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { IconArrowLeft } from "@/components/ui/Icon";
import { RichEditor } from "@/components/RichEditor";

type Person = { id: string; name: string; sortName: string };
export type DraftValue = { kind: string; title: string; body: string; addressees: { name: string; institution: string }[]; coAuthorUserIds: string[]; orgUnitId: string };


/**
 * Szkic interpelacji / zapytania: tytuł, adresaci, treść z akapitami i numerowanymi pytaniami,
 * współautorzy (zaproszeni - autorami stają się po własnym potwierdzeniu). „Zapisz szkic” nie
 * składa pisma; „Złóż” utrwala datę i treść.
 */
export function InquiryDraftForm({ initialKind, existing }: { initialKind?: string; existing?: { id: string; value: DraftValue } }) {
  const router = useRouter();
  const [v, setV] = useState<DraftValue>(existing?.value ?? { kind: initialKind ?? "INTERPELLATION", title: "", body: "", addressees: [{ name: "", institution: "" }], coAuthorUserIds: [], orgUnitId: "" });
  const [people, setPeople] = useState<Person[]>([]);
  const [scopes, setScopes] = useState<{ id: string | null; name: string }[]>([]);
  const [canSubmit, setCanSubmit] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<DraftValue>) => setV((x) => ({ ...x, ...p }));

  useEffect(() => {
    fetch("/api/inquiries/me", { cache: "no-store" }).then((r) => r.json()).then((d) => { setCanSubmit(d.canSubmit); setScopes(d.scopes ?? []); }).catch(() => setCanSubmit(false));
    fetch("/api/inquiries/people", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then(setPeople).catch(() => {});
  }, []);
  // Wybrani na górze listy, potem pozostali (filtr po nazwisku lub imieniu).
  const candidates = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = people.filter((p) => !n || p.name.toLowerCase().includes(n));
    return [...list.filter((p) => v.coAuthorUserIds.includes(p.id)), ...list.filter((p) => !v.coAuthorUserIds.includes(p.id))];
  }, [people, q, v.coAuthorUserIds]);
  const unitScopes = scopes.filter((s) => s.id);

  const payload = () => ({ kind: v.kind, title: v.title, body: v.body, addressees: v.addressees.filter((a) => a.name.trim()), coAuthorUserIds: v.coAuthorUserIds, orgUnitId: v.orgUnitId || null });

  async function save(submit: boolean) {
    if (!v.title.trim()) { notify.warning("Podaj tytuł."); return; }
    if (submit && !(await ask({ title: "Złożyć pismo?", message: "Złożenie utrwala datę i treść. Późniejsze zmiany będą możliwe wyłącznie jako jawna korekta lub uzupełnienie.", confirmLabel: "Złóż" }))) return;
    setBusy(true);
    let id = existing?.id;
    const r = id
      ? await fetch(`/api/inquiries/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) })
      : await fetch("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
    if (!r.ok) { setBusy(false); await notifyFailure(r); return; }
    if (!id) id = (await r.json()).id;
    if (submit) {
      const s = await fetch(`/api/inquiries/${id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
      setBusy(false);
      if (!s.ok) { await notifyFailure(s); router.push(`/session/interpelacje/${id}`); return; }
      notify.success("Złożono.");
    } else {
      setBusy(false);
      notify.success("Zapisano szkic.");
    }
    if (existing) router.refresh();
    router.push(`/session/interpelacje/${id}`);
  }

  if (canSubmit === false && !existing) {
    return <div className="pt-page"><section className="pt-panel"><div className="pt-empty">Nie masz nadanego prawa składania interpelacji i zapytań albo moduł jest wyłączony.</div></section></div>;
  }

  return (
    <div className={existing ? "" : "pt-page"}>
      {!existing && <Link href="/session/interpelacje" className="pt-back-link"><IconArrowLeft size={14} /> Moje sprawy</Link>}
      {!existing && <header className="pt-page-header"><div className="pt-kicker">Nowy szkic</div><h1 className="pt-h1">{v.kind === "QUESTION" ? "Zapytanie" : "Interpelacja"}</h1></header>}
      <section className="pt-panel"><div className="pt-panel-body pt-form">
        <div className="pt-field">
          <span className="pt-label" id="df-kind-l">Rodzaj</span>
          <div className="pt-btn-group" role="radiogroup" aria-labelledby="df-kind-l">
            {[["INTERPELLATION", "Interpelacja"], ["QUESTION", "Zapytanie"]].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={v.kind === k} className={`pt-btn pt-btn-sm${v.kind === k ? " pt-btn-primary" : ""}`} onClick={() => set({ kind: k })}>{l}</button>
            ))}
          </div>
        </div>
        <label className="pt-field"><span className="pt-label">Tytuł</span><input className="pt-field-input" maxLength={500} value={v.title} onChange={(e) => set({ title: e.target.value })} /></label>
        {unitScopes.length > 0 && (
          <label className="pt-field"><span className="pt-label">Organ</span>
            <select className="pt-field-input" value={v.orgUnitId} onChange={(e) => set({ orgUnitId: e.target.value })}>
              {scopes.some((s) => !s.id) && <option value="">Cała jednostka</option>}
              {unitScopes.map((s) => <option key={s.id!} value={s.id!}>{s.name}</option>)}
            </select></label>
        )}
        <fieldset className="pt-field">
          <legend className="pt-label">Adresaci</legend>
          {v.addressees.map((a, i) => (
            <div key={i} className="pt-inq-row">
              <input className="pt-field-input" aria-label={`Adresat ${i + 1}`} placeholder="np. Burmistrz Miasta" value={a.name} onChange={(e) => set({ addressees: v.addressees.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className="pt-field-input" aria-label={`Adresat ${i + 1}: instytucja`} placeholder="Instytucja (opcjonalnie)" value={a.institution} onChange={(e) => set({ addressees: v.addressees.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)) })} />
              {v.addressees.length > 1 && <button type="button" className="pt-btn pt-btn-sm" onClick={() => set({ addressees: v.addressees.filter((_, j) => j !== i) })}>Usuń<span className="sr-only"> adresata {i + 1}</span></button>}
            </div>
          ))}
          <button type="button" className="pt-btn pt-btn-sm" onClick={() => set({ addressees: [...v.addressees, { name: "", institution: "" }] })}>Dodaj adresata</button>
        </fieldset>
        <RichEditor id="df-body" label="Treść" value={v.body} onChange={(b) => set({ body: b })} minHeight={320} variant="app" />
        <fieldset className="pt-field">
          <legend className="pt-label">Współautorzy{v.coAuthorUserIds.length ? ` (${v.coAuthorUserIds.length})` : ""}</legend>
          <input className="pt-field-input" type="search" placeholder="Szukaj radnego" aria-label="Szukaj współautora" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="pt-inq-people" aria-label="Radni">
            {candidates.map((p) => (
              <li key={p.id}>
                <label className="pt-inq-person">
                  <input type="checkbox" checked={v.coAuthorUserIds.includes(p.id)}
                    onChange={(e) => set({ coAuthorUserIds: e.target.checked ? [...v.coAuthorUserIds, p.id] : v.coAuthorUserIds.filter((x) => x !== p.id) })} />
                  <span>{p.sortName}</span>
                </label>
              </li>
            ))}
            {candidates.length === 0 && <li className="pt-muted" style={{ padding: "10px 12px" }}>Brak osób.</li>}
          </ul>
        </fieldset>
        <div className="pt-btn-group">
          <button type="button" className="pt-btn" disabled={busy} onClick={() => save(false)}>Zapisz szkic</button>
          <button type="button" className="pt-btn pt-btn-primary" disabled={busy} onClick={() => save(true)}>Złóż</button>
        </div>
      </div></section>
    </div>
  );
}
