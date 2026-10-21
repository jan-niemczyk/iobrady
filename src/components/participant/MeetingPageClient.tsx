"use client";

import { useEffect, useRef, useState } from "react";
import type { ParticipantMeeting } from "@/lib/participantMeeting";
import { MyAgendaItemNote } from "@/components/participant/MyAgendaItemNote";
import { VoteResultsView } from "@/components/participant/VoteResultsView";
import { PublicViewActions } from "@/components/PublicViewActions";
import { IconDownload, IconExternal, IconFile } from "@/components/ui/Icon";

const TZ = "Europe/Warsaw";
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const STATUS: Record<string, string> = {
  DRAFT: "Projekt", PREPARED: "Przygotowane", OPEN: "Otwarte", IN_PROGRESS: "W toku", PAUSED: "Przerwa",
  CLOSED: "Zakończone", ARCHIVED: "Zarchiwizowane", CANCELLED: "Anulowane",
};

function fileFormat(name: string, mime: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  if (m) return m[1].toUpperCase();
  return mime === "application/pdf" ? "PDF" : "plik";
}
function fileSize(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
/** Czytelna etykieta pliku: nazwa bez rozszerzenia, podkreślenia i myślniki zamienione na spacje. */
function fileLabel(name: string): string {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim() || name;
}
const canOpenInline = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

type File = ParticipantMeeting["meetingAttachments"][number];
type Vote = ParticipantMeeting["looseVotes"][number];
type Item = ParticipantMeeting["items"][number];

function Files({ files, label }: { files: File[]; label: string }) {
  if (files.length === 0) return null;
  return (
    <ul className="pt-files pt-mtg-files" aria-label={label}>
      {files.map((a) => (
        <li key={a.id} className="pt-mtg-file">
          <span className="pt-file-icon" aria-hidden><IconFile size={20} /></span>
          <span className="pt-file-name">{fileLabel(a.fileName)}<span className="pt-file-meta"> {fileFormat(a.fileName, a.mimeType)}, {fileSize(a.sizeBytes)}</span></span>
          <span className="pt-btn-group">
            {canOpenInline(a.mimeType) && (
              <a className="pt-btn pt-btn-sm" href={`/api/attachments/${a.id}/download?inline=1`} target="_blank" rel="noopener noreferrer">
                <IconExternal size={15} /> Otwórz<span className="sr-only"> {a.fileName} w nowej karcie</span>
              </a>
            )}
            <a className="pt-btn pt-btn-sm" href={`/api/attachments/${a.id}/download`} download>
              <IconDownload size={15} /> Pobierz<span className="sr-only"> {a.fileName}</span>
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Votes({ votes, onResults }: { votes: Vote[]; onResults: (id: string, el: HTMLElement) => void }) {
  if (votes.length === 0) return null;
  return (
    <ul className="pt-mtg-votes" aria-label="Głosowania">
      {votes.map((v) => (
        <li key={v.id}>
          <div className="pt-label">Głosowanie nr {v.number ?? "-"}{v.time ? `, godz. ${fmtTime(v.time)}` : ""}{v.secret ? ", tajne" : ""}</div>
          <div className="pt-mtg-vote-subject"><span className="pt-muted">Przedmiot:</span> {v.title}</div>
          <div className="pt-btn-group" style={{ marginTop: 6 }}>
            {v.status === "OPEN" ? <span className="pt-badge pt-badge-warn">Trwa</span> : v.decision && <span className={`pt-badge ${v.decision === "Odrzucono" || v.decision === "Brak kworum" ? "pt-badge-no" : "pt-badge-yes"}`}>{v.decision}</span>}
            {v.status === "CLOSED" && (
              <>
                <button type="button" className="pt-btn pt-btn-sm" onClick={(e) => onResults(v.id, e.currentTarget)}>Wyniki<span className="sr-only"> głosowania nr {v.number}</span></button>
                <a className="pt-btn pt-btn-sm" href={`/session/glosowanie/${v.id}`}>Szczegóły<span className="sr-only"> głosowania nr {v.number}</span></a>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ItemStatus({ it, current }: { it: Item; current: boolean }) {
  if (current) return <span className="pt-badge pt-badge-no">Rozpatrywany teraz</span>;
  if (it.status === "COMPLETED") return <span className="pt-badge">Zakończony{it.startedAt && it.completedAt ? `, ${fmtTime(it.startedAt)} - ${fmtTime(it.completedAt)}` : ""}</span>;
  if (it.status === "PAUSED") return <span className="pt-badge pt-badge-warn">Zawieszony</span>;
  if (it.status === "SKIPPED") return <span className="pt-badge">Pominięty</span>;
  return null;
}

/**
 * Strona posiedzenia radnego. Szeroki ekran: porządek obrad (nawigacja) po lewej, treść punktów
 * z materiałami, głosowaniami i prywatną notatką po prawej. Telefon: jedna kolumna. Bieżący punkt
 * jest oznaczony, ale strona nie przewija się do niego sama - służy do tego przycisk.
 */
export function MeetingPageClient({ m, publicOrigin }: { m: ParticipantMeeting; publicOrigin: string | null }) {
  const [results, setResults] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Podświetlenie pozycji spisu dla punktu widocznego na ekranie (bez przewijania strony).
  useEffect(() => {
    const els = m.items.map((i) => document.getElementById(`pkt-${i.id}`)).filter(Boolean) as HTMLElement[];
    if (!("IntersectionObserver" in window) || els.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActiveId(vis.target.id.slice(4));
    }, { rootMargin: "-20% 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [m.items]);

  const openResults = (id: string, el: HTMLElement) => { opener.current = el; setResults(id); };
  const goCurrent = () => {
    if (!m.currentAgendaItemId) return;
    const el = document.getElementById(`pkt-${m.currentAgendaItemId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    (el?.querySelector("h2") as HTMLElement | null)?.focus({ preventScroll: true });
  };

  return (
    <div className="pt-page pt-mtg">
      <header className="pt-mtg-header">
        {m.organization && <div className="pt-kicker pt-mtg-org">{m.organization}</div>}
        <h1 className="pt-h1">{m.name}</h1>
        <div className="pt-mtg-meta">
          {m.number && <span>Posiedzenie nr {m.number}</span>}
          <span>{fmtDateTime(m.scheduledAt)}</span>
          {m.location && <span>{m.location}</span>}
          <span className={`pt-badge${m.live ? " pt-badge-yes" : ""}`}>{STATUS[m.status] ?? m.status}</span>
        </div>
        <div className="pt-mtg-actions">
          {m.live && <a className="pt-btn pt-btn-primary" href={`/session?m=${m.id}`}>Panel obrad i głosowania</a>}
          {m.live && m.currentAgendaItemId && <button type="button" className="pt-btn" onClick={goCurrent}>Przejdź do bieżącego punktu</button>}
          <PublicViewActions meetingId={m.id} published={m.publicEnabled} origin={publicOrigin} variant="app" />
        </div>
        {m.live && (
          <dl className="pt-mtg-me" aria-label="Twój udział">
            <div><dt>Prawo głosu</dt><dd>{m.me.excluded ? "Wyłączony z posiedzenia" : m.me.hasVotingRight ? "Tak" : m.me.isGuest ? "Gość - bez prawa głosu" : "Nie"}</dd></div>
            {!m.me.isGuest && <div><dt>Obecność formalna</dt><dd>{m.me.attendance === "PRESENT" ? "Potwierdzona" : "Niepotwierdzona"}</dd></div>}
          </dl>
        )}
      </header>

      {m.meetingAttachments.length > 0 && (
        <section className="pt-panel" aria-labelledby="mtg-mat">
          <div className="pt-panel-head"><h2 id="mtg-mat" className="pt-panel-title">Materiały posiedzenia</h2></div>
          <div className="pt-panel-body"><Files files={m.meetingAttachments} label="Materiały posiedzenia" /></div>
        </section>
      )}

      {m.items.length === 0 ? (
        <section className="pt-panel"><div className="pt-empty">Porządek obrad nie został jeszcze ustalony.</div></section>
      ) : (
        <div className="pt-mtg-grid">
          <nav className="pt-mtg-toc" aria-label="Porządek obrad - przejdź do punktu">
            <div className="pt-label" style={{ padding: "0 8px 6px" }}>Porządek obrad</div>
            <ol>
              {m.items.map((it) => (
                <li key={it.id} className={it.isSubItem ? "pt-mtg-toc-sub" : undefined}>
                  <a href={`#pkt-${it.id}`} aria-current={activeId === it.id ? "location" : undefined}
                    className={`${it.id === m.currentAgendaItemId ? "is-current " : ""}${it.status === "COMPLETED" ? "is-done" : ""}`}>
                    {it.number && <span className="num">{it.number}.</span>}
                    <span className="pt-mtg-toc-title">{it.title}</span>
                    {it.id === m.currentAgendaItemId && <span className="sr-only"> (rozpatrywany teraz)</span>}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="pt-mtg-items">
            {m.items.map((it) => {
              const current = it.id === m.currentAgendaItemId;
              return (
                <section key={it.id} id={`pkt-${it.id}`} className={`pt-panel pt-mtg-item${current ? " is-current" : ""}${it.isSubItem ? " is-sub" : ""}`} aria-labelledby={`pkt-h-${it.id}`}>
                  <div className="pt-panel-body">
                    <div className="pt-mtg-item-head">
                      {it.number && <span className="pt-mtg-item-num num">{it.number}.</span>}
                      <h2 id={`pkt-h-${it.id}`} tabIndex={-1} className="pt-mtg-item-title">{it.title}</h2>
                    </div>
                    <div className="pt-mtg-item-meta">
                      <ItemStatus it={it} current={current} />
                      {it.presenter && <span>Referuje: {it.presenter}</span>}
                      {it.committee && <span>Opinia: {it.committee}</span>}
                    </div>
                    <Files files={it.attachments} label={`Materiały do punktu ${it.number ?? it.title}`} />
                    <Votes votes={it.votes} onResults={openResults} />
                    <MyAgendaItemNote agendaItemId={it.id} />
                  </div>
                </section>
              );
            })}
            {m.looseVotes.length > 0 && (
              <section className="pt-panel" aria-labelledby="mtg-loose">
                <div className="pt-panel-head"><h2 id="mtg-loose" className="pt-panel-title">Głosowania poza porządkiem obrad</h2></div>
                <div className="pt-panel-body"><Votes votes={m.looseVotes} onResults={openResults} /></div>
              </section>
            )}
          </div>
        </div>
      )}

      {results && <VoteResultsView voteId={results} onClose={() => { setResults(null); setTimeout(() => opener.current?.focus(), 0); }} />}
    </div>
  );
}
