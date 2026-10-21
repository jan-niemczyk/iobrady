"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ask, notify, notifyFailure } from "@/lib/feedback";
import { IconArrowLeft } from "@/components/ui/Icon";

type Person = { id: string; name: string; sortName: string };
export type DraftValue = { kind: string; title: string; body: string; addressees: { name: string; institution: string }[]; coAuthorUserIds: string[]; orgUnitId: string };

const HINT = "Każdy wiersz to akapit. Pytania numerowane: „1. ”, „2. ” na początku wiersza; lista: „- ”; **pogrubienie**, _kursywa_.";

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
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? people.filter((p) => p.name.toLowerCase().includes(n) && !v.coAuthorUserIds.includes(p.id)).slice(0, 8) : [];
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
        <label className="pt-field"><span className="pt-label">Tytuł</span><input className="pt-input" maxLength={500} value={v.title} onChange={(e) => set({ title: e.target.value })} /></label>
        {unitScopes.length > 0 && (
          <label className="pt-field"><span className="pt-label">Organ</span>
            <select className="pt-input" value={v.orgUnitId} onChange={(e) => set({ orgUnitId: e.target.value })}>
              {scopes.some((s) => !s.id) && <option value="">Cała jednostka</option>}
              {unitScopes.map((s) => <option key={s.id!} value={s.id!}>{s.name}</option>)}
            </select></label>
        )}
        <fieldset className="pt-field">
          <legend className="pt-label">Adresaci</legend>
          {v.addressees.map((a, i) => (
            <div key={i} className="pt-inq-row">
              <input className="pt-input" aria-label={`Adresat ${i + 1}`} placeholder="np. Burmistrz Miasta" value={a.name} onChange={(e) => set({ addressees: v.addressees.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className="pt-input" aria-label={`Adresat ${i + 1}: instytucja`} placeholder="Instytucja (opcjonalnie)" value={a.institution} onChange={(e) => set({ addressees: v.addressees.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)) })} />
              {v.addressees.length > 1 && <button type="button" className="pt-btn pt-btn-sm" onClick={() => set({ addressees: v.addressees.filter((_, j) => j !== i) })}>Usuń<span className="sr-only"> adresata {i + 1}</span></button>}
            </div>
          ))}
          <button type="button" className="pt-btn pt-btn-sm" onClick={() => set({ addressees: [...v.addressees, { name: "", institution: "" }] })}>Dodaj adresata</button>
        </fieldset>
        <label className="pt-field"><span className="pt-label">Treść</span>
          <textarea className="pt-input pt-textarea" rows={14} maxLength={200000} value={v.body} onChange={(e) => set({ body: e.target.value })} aria-describedby="df-hint" />
          <span id="df-hint" className="pt-muted" style={{ fontSize: 13 }}>{HINT}</span></label>
        <fieldset className="pt-field">
          <legend className="pt-label">Współautorzy (zaproszenie - wymaga ich potwierdzenia)</legend>
          <div className="pt-btn-group">
            {v.coAuthorUserIds.map((id) => { const p = people.find((x) => x.id === id); return <button key={id} type="button" className="pt-btn pt-btn-sm" onClick={() => set({ coAuthorUserIds: v.coAuthorUserIds.filter((x) => x !== id) })}>{p?.name ?? "osoba"} ×<span className="sr-only"> usuń</span></button>; })}
          </div>
          <input className="pt-input" type="search" placeholder="Szukaj radnego" aria-label="Szukaj współautora" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length > 0 && (
            <ul className="pt-inq-suggest">
              {matches.map((p) => <li key={p.id}><button type="button" className="pt-btn pt-btn-sm" onClick={() => { set({ coAuthorUserIds: [...v.coAuthorUserIds, p.id] }); setQ(""); }}>{p.name}</button></li>)}
            </ul>
          )}
        </fieldset>
        <div className="pt-btn-group">
          <button type="button" className="pt-btn" disabled={busy} onClick={() => save(false)}>Zapisz szkic</button>
          <button type="button" className="pt-btn pt-btn-primary" disabled={busy} onClick={() => save(true)}>Złóż</button>
        </div>
      </div></section>
    </div>
  );
}
