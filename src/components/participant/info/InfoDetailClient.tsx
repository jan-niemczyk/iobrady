"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RichTextView } from "@/components/RichTextView";
import { FileList } from "@/components/participant/FileList";
import { IconArrowLeft, IconExternal } from "@/components/ui/Icon";

type Post = {
  id: string; title: string; body: string; category: string; kind: string; pinned: boolean; important: boolean;
  publishedAt: string | null; eventAt: string | null; expiresAt: string | null; version: number; updatedAt: string;
  links: { label: string; url: string }[]; attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
  author: string | null; editor: string | null; versions: { version: number; createdAt: string; editor: string | null }[];
  unread: boolean; changed: boolean;
};

const TZ = "Europe/Warsaw";
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });

/**
 * Treść informacji. Otwarcie tego widoku zapisuje otwarcie bieżącej wersji (pierwsze i ostatnie)
 * - w osobnym, jawnym żądaniu, po wczytaniu treści.
 */
export function InfoDetailClient({ id }: { id: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch(`/api/info/${id}`, { cache: "no-store" }).catch(() => null);
      if (!alive) return;
      if (!r) { setState("error"); return; }
      if (r.status === 404) { setState("missing"); return; }
      if (!r.ok) { setState("error"); return; }
      const p: Post = await r.json();
      if (!alive) return;
      setPost(p);
      setState("ok");
      await fetch(`/api/info/${id}/read`, { method: "POST" }).catch(() => {});
    })();
    return () => { alive = false; };
  }, [id]);

  const back = <Link href="/session/informacje" className="pt-back-link"><IconArrowLeft size={14} /> Wszystkie informacje</Link>;
  if (state !== "ok" || !post) {
    return (
      <div className="pt-page">
        {back}
        <section className="pt-panel"><div className="pt-empty">
          {state === "loading" ? "Wczytywanie…" : state === "missing" ? "Ta informacja nie jest dostępna - mogła zostać wycofana albo nie jesteś jej odbiorcą." : "Nie udało się wczytać informacji. Odśwież stronę."}
        </div></section>
      </div>
    );
  }
  return (
    <div className="pt-page pt-info-page">
      {back}
      <header className="pt-page-header">
        <div className="pt-kicker">{post.kind === "DOCUMENT" ? "Dokument stały" : post.category}</div>
        <h1 className="pt-h1">{post.title}</h1>
        <div className="pt-btn-group" style={{ marginTop: 6 }}>
          {post.important && <span className="pt-badge pt-badge-no">Ważne</span>}
          {post.changed && <span className="pt-badge pt-badge-warn">Zmieniono od Twojego poprzedniego otwarcia (wersja {post.version})</span>}
        </div>
      </header>
      <section className="pt-panel">
        <div className="pt-panel-body">
          <dl className="pt-info-meta">
            {post.publishedAt && <div><dt>Opublikowano</dt><dd>{fmtDateTime(post.publishedAt)}</dd></div>}
            {post.author && <div><dt>Autor</dt><dd>{post.author}{post.editor && post.editor !== post.author ? ` (ostatnia zmiana: ${post.editor})` : ""}</dd></div>}
            {post.version > 1 && <div><dt>Wersja</dt><dd>{post.version}, z {fmtDateTime(post.versions[0]?.createdAt ?? post.updatedAt)}</dd></div>}
            {post.eventAt && <div><dt>Termin wydarzenia</dt><dd>{fmtDateTime(post.eventAt)}</dd></div>}
            {post.expiresAt && <div><dt>Dostępne do</dt><dd>{fmtDate(post.expiresAt)}</dd></div>}
          </dl>
          <RichTextView text={post.body} className="pt-info-body" />
          {post.links.length > 0 && (
            <>
              <h2 className="pt-h2">Odnośniki</h2>
              <ul className="pt-info-links">
                {post.links.map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} <IconExternal size={13} /><span className="sr-only"> (nowa karta)</span></a></li>)}
              </ul>
            </>
          )}
          {post.attachments.length > 0 && (
            <>
              <h2 className="pt-h2">Załączniki ({post.attachments.length})</h2>
              <FileList files={post.attachments} label="Załączniki" href={(a) => `/api/info/attachments/${a}`} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
