"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normSearch } from "@/components/public/publicFormat";
import { IconPin, IconSearch } from "@/components/ui/Icon";

type Item = {
  id: string; title: string; category: string; kind: string; pinned: boolean; important: boolean;
  publishedAt: string | null; eventAt: string | null; expiresAt: string | null; version: number;
  author: string | null; attachments: number; unread: boolean; changed: boolean; excerpt: string;
};
type View = "all" | "unread" | "documents";

const TZ = "Europe/Warsaw";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const VIEWS: [View, string][] = [["all", "Wszystkie"], ["unread", "Nieprzeczytane"], ["documents", "Dokumenty stałe"]];
const VIEW_PARAM: Record<View, string> = { all: "", unread: "nieprzeczytane", documents: "dokumenty" };

/**
 * Lista informacji radnego. Pobranie listy nie oznacza przeczytania - odczyt zapisuje się dopiero
 * przy otwarciu treści. Przypięte i ważne na górze, pozostałe od najnowszych.
 */
export function InfoListClient({ initialView }: { initialView: View }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<View>(initialView);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/info", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (alive) setItems(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  const categories = useMemo(() => [...new Set((items ?? []).map((i) => i.category))].sort((a, b) => a.localeCompare(b, "pl")), [items]);
  const shown = useMemo(() => {
    const nq = normSearch(q.trim());
    return (items ?? []).filter((i) =>
      (view !== "unread" || i.unread) && (view !== "documents" || i.kind === "DOCUMENT")
      && (!cat || i.category === cat)
      && (!nq || normSearch(`${i.title} ${i.excerpt} ${i.category} ${i.author ?? ""}`).includes(nq)));
  }, [items, view, q, cat]);
  const unreadCount = (items ?? []).filter((i) => i.unread).length;

  const choose = (v: View) => {
    setView(v);
    router.replace(VIEW_PARAM[v] ? `/session/informacje?widok=${VIEW_PARAM[v]}` : "/session/informacje", { scroll: false });
  };

  return (
    <div className="pt-page">
      <header className="pt-page-header">
        <div className="pt-kicker">Informacje</div>
        <h1 className="pt-h1">Komunikaty i dokumenty</h1>
      </header>

      <div className="pt-info-toolbar">
        <div className="pt-btn-group" role="group" aria-label="Widok">
          {VIEWS.map(([v, l]) => (
            <button key={v} type="button" className={`pt-btn pt-btn-sm${view === v ? " pt-btn-primary" : ""}`} aria-pressed={view === v} onClick={() => choose(v)}>
              {l}{v === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          ))}
        </div>
        <label className="pt-info-search">
          <span className="sr-only">Szukaj w informacjach</span>
          <IconSearch size={16} />
          <input type="search" className="pt-field-input" placeholder="Szukaj" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {categories.length > 1 && (
          <label>
            <span className="sr-only">Kategoria</span>
            <select className="pt-field-input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Wszystkie kategorie</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>

      <section className="pt-panel" aria-live="polite">
        {error ? <div className="pt-empty">Nie udało się wczytać informacji. Odśwież stronę.</div>
          : items === null ? <div className="pt-empty">Wczytywanie…</div>
          : shown.length === 0 ? <div className="pt-empty">{view === "unread" ? "Brak nieprzeczytanych informacji." : "Brak informacji."}</div>
          : (
            <ul className="pt-list">
              {shown.map((i) => (
                <li key={i.id} style={{ padding: 0 }}>
                  <Link href={`/session/informacje/${i.id}`} className={`pt-row-link pt-info-row${i.unread ? " is-unread" : ""}`}>
                    <span className="pt-grow">
                      <span className="pt-row-title">
                        {i.pinned && <IconPin size={14} />} {i.title}
                        {i.unread && <span className="pt-badge pt-badge-warn" style={{ marginLeft: 8 }}>{i.changed ? "Zmieniono" : "Nowe"}</span>}
                        {i.important && <span className="pt-badge pt-badge-no" style={{ marginLeft: 8 }}>Ważne</span>}
                      </span>
                      <span className="pt-label">
                        {i.kind === "DOCUMENT" ? "Dokument stały" : i.category}
                        {i.publishedAt ? ` - ${fmtDate(i.publishedAt)}` : ""}
                        {i.author ? ` - ${i.author}` : ""}
                        {i.eventAt ? ` - wydarzenie: ${fmtDateTime(i.eventAt)}` : ""}
                        {i.attachments > 0 ? ` - załączniki: ${i.attachments}` : ""}
                      </span>
                      {i.excerpt && <span className="pt-info-excerpt">{i.excerpt}</span>}
                    </span>
                    <span className="pt-muted" aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
