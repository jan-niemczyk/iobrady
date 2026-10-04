"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { IconArrowUp, IconArrowDown, IconArrowLeft } from "@/components/ui/Icon";
import type { AgendaItemStatus } from "@prisma/client";
import { AGENDA_ITEM_STATUS_LABEL } from "@/lib/labels";
import { AttachmentsManager } from "@/components/operator/AttachmentsManager";
import { CardHeader, PageContainer, PageHeader } from "./ui";
import { Modal } from "./Modal";
import { ask, notifyFailure, readUserError } from "@/lib/feedback";

interface AgendaItem {
  id: string;
  order: number;
  number: string;
  title: string;
  description?: string | null;
  committee?: string | null;
  presenter?: string | null;
  status: AgendaItemStatus;
  isSubItem?: boolean;
  unnumbered?: boolean;
  hiddenFromDisplay?: boolean;
  /** Planowany limit wypowiedzi w punkcie (s); null = limit z ustawień. */
  speechLimitSec?: number | null;
}

interface PlannedVote {
  id: string;
  title: string;
  agendaItemId: string | null;
  status: string;
}

export function AgendaEditorClient({
  meetingId, meetingName, meetingNumber, initialAgenda, initialVotes, embedded, onPlanVote, onEditVote,
}: {
  meetingId: string;
  meetingName: string;
  meetingNumber: string;
  initialAgenda: AgendaItem[];
  /** Głosowania posiedzenia - do pokazania zaplanowanych (status "Przygotowane") pod punktem,
      do którego są przypisane, i do dodawania nowych bezpośrednio przy punkcie. */
  initialVotes?: PlannedVote[];
  /** Bez własnego nagłówka/marginesu strony - do osadzenia wewnątrz panelu posiedzenia
      (przed otwarciem posiedzenia), gdzie chrome strony dostarcza już rodzic. */
  embedded?: boolean;
  /** Gdy podane (planer w panelu posiedzenia) - "+ Głosowanie" otwiera pełne okno planowania
      głosowania zamiast szybkiego pola z samą nazwą. */
  onPlanVote?: (item: { id: string; title: string }) => void;
  /** Gdy podane - przy zaplanowanym głosowaniu pojawia się "Edytuj" (pełne okno edycji). */
  onEditVote?: (voteId: string) => void;
}) {
  const [agenda, setAgenda] = useState(initialAgenda);
  const [votes, setVotes] = useState(initialVotes ?? []);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachmentsOpenId, setAttachmentsOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [addingVoteForId, setAddingVoteForId] = useState<string | null>(null);
  const [newVoteTitle, setNewVoteTitle] = useState("");

  // Dane od rodzica (panel posiedzenia odświeża stan po SSE / po utworzeniu głosowania w oknie
  // planowania) - aktualizujemy lokalną kopię, gdy się zmienią.
  const votesKey = JSON.stringify(initialVotes ?? []);
  const agendaKey = JSON.stringify(initialAgenda);
  useEffect(() => { setVotes(initialVotes ?? []); }, [votesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAgenda(initialAgenda); }, [agendaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refetch() {
    // proste - przeładuj całą stronę dla świeżych danych z serwera
    const r = await fetch(`/api/meetings/${meetingId}/state`, { cache: "no-store" });
    if (r.ok) {
      const state = await r.json();
      setAgenda(state.agenda);
      setVotes(state.votes);
    }
  }

  async function addVote(agendaItemId: string, title: string) {
    const t = title.trim();
    if (!t) return;
    setAddingVoteForId(null);
    setNewVoteTitle("");
    await fetch(`/api/meetings/${meetingId}/votes/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, agendaItemId, adHoc: false }),
    });
    await refetch();
  }

  function act(method: "POST" | "PATCH" | "DELETE", path: string, body?: object, renumberAfter?: boolean) {
    startTransition(async () => {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) { await notifyFailure(r); return; }
      if (renumberAfter) {
        await fetch(`/api/meetings/${meetingId}/agenda/renumber`, { method: "POST" });
      }
      await refetch();
    });
  }

  const content = (
    <>
      <div className="card">
        <CardHeader
          title={<>Punkty porządku obrad <span className="text-body-secondary fw-normal">({agenda.length})</span></>}
          right={<>
            <button
              className="btn btn-sm"
              disabled={pending || agenda.length === 0}
              onClick={async () => { if (await ask({ title: "Ponumerować punkty?", message: "Punkty otrzymają kolejne numery (1, 2, 3…) wg obecnej kolejności. Podpunkty otrzymają numery kropkowe (2.1, 2.2…).", confirmLabel: "Ponumeruj" })) act("POST", `/api/meetings/${meetingId}/agenda/renumber`); }}
              title="Nadaj kolejne numery wg aktualnej kolejności"
            >
              Przenumeruj
            </button>
            <button className="btn btn-sm" onClick={() => setShowImport(true)}>
              Importuj z tekstu
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Dodaj punkt</button>
          </>}
        />

        <ol className="list-group list-group-flush">
          {agenda.map((a, idx) => {
            const planned = votes.filter((v) => v.agendaItemId === a.id && v.status === "READY");
            return (
            <li key={a.id} className={`list-group-item py-3${a.isSubItem ? " ps-5" : ""}`}>
              {editingId === a.id ? (
                <ItemEditor
                  item={a}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => {
                    setEditingId(null);
                    act("PATCH", `/api/agenda/${a.id}`, patch);
                  }}
                />
              ) : (
                <div className="d-flex align-items-start gap-2">
                  <span className="row-num text-end small" style={{ paddingTop: 2 }}>{a.unnumbered ? "-" : a.number}</span>
                  <div className="flex-grow-1 min-w-0 d-flex flex-column gap-2">
                    {/* Nazwa punktu - pełna szerokość, u góry, czytelna */}
                    <div className="d-flex align-items-start justify-content-between gap-2">
                      <div className="min-w-0">
                        <div className="fw-medium">
                          {a.isSubItem && <span className="text-body-secondary">↳ </span>}
                          {a.title}
                          {a.hiddenFromDisplay && <span className="ms-2 small text-body-secondary">(ukryty na prezentacji)</span>}
                        </div>
                        {a.presenter && <div className="small text-body-secondary">Referent: {a.presenter}</div>}
                        {a.speechLimitSec != null && <div className="small text-body-secondary">Limit wypowiedzi: {formatLimit(a.speechLimitSec)}</div>}
                        {(a as { committee?: string | null }).committee && <div className="small text-body-secondary">Opinia: {(a as { committee?: string | null }).committee}</div>}
                      </div>
                      <StatusPill status={a.status} />
                    </div>

                    {/* Akcje: kolejność, edycja, materiały, głosowanie; rzadsze w menu "Więcej" */}
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <div className="btn-group btn-group-sm" role="group" aria-label="Kolejność">
                        <button className="btn" disabled={pending || idx === 0} onClick={() => act("POST", `/api/agenda/${a.id}/move`, { direction: "up" })} title="W górę" aria-label="W górę"><IconArrowUp size={13} /></button>
                        <button className="btn" disabled={pending || idx === agenda.length - 1} onClick={() => act("POST", `/api/agenda/${a.id}/move`, { direction: "down" })} title="W dół" aria-label="W dół"><IconArrowDown size={13} /></button>
                      </div>
                      <select
                        className="form-select form-select-sm w-auto"
                        style={{ maxWidth: 170 }}
                        value=""
                        disabled={pending}
                        title="Przenieś ten punkt za wybranym"
                        aria-label="Przenieś ten punkt za wybranym"
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          if (v === "__start__") act("POST", `/api/agenda/${a.id}/move`, { toStart: true });
                          else act("POST", `/api/agenda/${a.id}/move`, { afterId: v });
                        }}
                      >
                        <option value="">Przenieś po…</option>
                        <option value="__start__">(na początek)</option>
                        {agenda.filter((x) => x.id !== a.id).map((x) => (
                          <option key={x.id} value={x.id}>{x.unnumbered ? x.title.slice(0, 30) : `${x.number}. ${x.title.slice(0, 26)}`}</option>
                        ))}
                      </select>
                      <button className="btn btn-sm" disabled={pending} onClick={() => setEditingId(a.id)}>Edytuj</button>
                      <button className={`btn btn-sm${attachmentsOpenId === a.id ? " active" : ""}`} aria-expanded={attachmentsOpenId === a.id} onClick={() => setAttachmentsOpenId(attachmentsOpenId === a.id ? null : a.id)}>Materiały</button>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          if (onPlanVote) { onPlanVote({ id: a.id, title: a.title }); return; }
                          setAddingVoteForId(addingVoteForId === a.id ? null : a.id); setNewVoteTitle("");
                        }}
                        title="Zaplanuj głosowanie do tego punktu (zapis w stanie 'Przygotowane')"
                      >+ Głosowanie</button>
                      <div className="dropdown">
                        <button className="btn btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Więcej</button>
                        <ul className="dropdown-menu dropdown-menu-end">
                          <li><button className="dropdown-item" disabled={pending} onClick={() => act("PATCH", `/api/agenda/${a.id}`, { isSubItem: !a.isSubItem }, true)}>{a.isSubItem ? "Zmień na zwykły punkt" : "Zmień na podpunkt (wcięcie)"}</button></li>
                          <li><button className="dropdown-item" disabled={pending} onClick={() => act("PATCH", `/api/agenda/${a.id}`, { hiddenFromDisplay: !a.hiddenFromDisplay })}>{a.hiddenFromDisplay ? "Pokaż na prezentacji" : "Ukryj na prezentacji"}</button></li>
                          {a.status === "PENDING" && (
                            <li><button className="dropdown-item" disabled={pending} onClick={() => act("POST", `/api/agenda/${a.id}/skip`)}>Pomiń punkt</button></li>
                          )}
                          {(a.status === "COMPLETED" || a.status === "SKIPPED") && (
                            <li><button className="dropdown-item" disabled={pending} onClick={() => act("POST", `/api/agenda/${a.id}/reopen`)} title="Punkt wróci do nieotwartego">{a.status === "SKIPPED" ? "Cofnij pominięcie" : "Cofnij zakończenie"}</button></li>
                          )}
                          <li><hr className="dropdown-divider" /></li>
                          <li>
                            <button
                              className="dropdown-item text-danger"
                              disabled={pending || a.status === "CURRENT"}
                              onClick={async () => { if (await ask({ title: "Usunąć punkt?", message: `Punkt „${a.title}” zostanie usunięty z porządku obrad.`, confirmLabel: "Usuń punkt", danger: true })) act("DELETE", `/api/agenda/${a.id}`); }}
                            >Usuń punkt</button>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Zaplanowane głosowania tego punktu - pod nazwą, zamiast osobnej listy */}
                    {planned.length > 0 && (
                      <ul className="list-unstyled d-flex flex-column gap-1 mb-0">
                        {planned.map((v) => (
                          <li key={v.id} className="d-flex align-items-center gap-2 bg-body-tertiary border rounded px-2 py-1">
                            <span className="badge text-bg-light border flex-shrink-0">Przygotowane</span>
                            <span className="small flex-grow-1 min-w-0">{v.title}</span>
                            {onEditVote && (
                              <button className="btn btn-sm btn-link p-0 flex-shrink-0" onClick={() => onEditVote(v.id)}>Edytuj</button>
                            )}
                            <button
                              className="btn btn-sm btn-link text-danger p-0 flex-shrink-0"
                              onClick={async () => { if (await ask({ title: "Usunąć zaplanowane głosowanie?", message: `Głosowanie „${v.title}” zostanie usunięte.`, confirmLabel: "Usuń", danger: true })) { fetch(`/api/votes/${v.id}`, { method: "DELETE" }).then(refetch); } }}
                            >Usuń</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {addingVoteForId === a.id && (
                      <form
                        className="input-group input-group-sm"
                        style={{ maxWidth: 520 }}
                        onSubmit={(e) => { e.preventDefault(); addVote(a.id, newVoteTitle); }}
                      >
                        <input
                          className="form-control"
                          placeholder="Nazwa głosowania"
                          aria-label="Nazwa głosowania"
                          autoFocus
                          value={newVoteTitle}
                          onChange={(ev) => setNewVoteTitle(ev.target.value)}
                        />
                        <button type="submit" className="btn btn-primary" disabled={!newVoteTitle.trim()}>Zapisz</button>
                        <button type="button" className="btn" onClick={() => setAddingVoteForId(null)}>Anuluj</button>
                      </form>
                    )}
                    {attachmentsOpenId === a.id && (
                      <AttachmentsManager meetingId={meetingId} agendaItemId={a.id} />
                    )}
                  </div>
                </div>
              )}
            </li>
            );
          })}
          {agenda.length === 0 && (
            <li className="list-group-item py-4 text-center text-body-secondary">Brak punktów. Dodaj pierwszy.</li>
          )}
        </ol>

        {adding && (
          <div className="card-footer bg-body-tertiary py-3">
            <ItemEditor
              onCancel={() => setAdding(false)}
              onSave={(payload) => { setAdding(false); act("POST", `/api/meetings/${meetingId}/agenda`, payload, payload.isSubItem); }}
            />
          </div>
        )}
      </div>

      {showImport && (
        <ImportAgendaModal
          meetingId={meetingId}
          existingCount={agenda.length}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refetch(); }}
        />
      )}
    </>
  );

  if (embedded) return content;

  return (
    <PageContainer size="md">
      <PageHeader
        kicker={<>Posiedzenie nr <span className="num">{meetingNumber}</span> - Porządek obrad</>}
        title={meetingName}
        actions={<Link href={`/meetings/${meetingId}`} className="btn"><IconArrowLeft size={13} /> Wróć do panelu</Link>}
      />
      {content}
    </PageContainer>
  );
}

function ImportAgendaModal({
  meetingId, existingCount, onClose, onImported,
}: {
  meetingId: string;
  existingCount: number;
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((raw) => {
    const indented = /^(\t| {2,})/.test(raw);
    const t = raw.trim();
    const bulleted = /^[-*-›]\s+/.test(t);
    return { indented: indented || bulleted };
  });
  const lines = parsedLines;
  const subCount = parsedLines.filter((l) => l.indented).length;

  async function submit() {
    setError(null);
    if (lines.length === 0) {
      setError("Brak punktów do zaimportowania.");
      return;
    }
    if (mode === "replace" && existingCount > 0
      && !(await ask({ title: `Zastąpić ${existingCount} istniejących punktów?`, message: "Obecne punkty zostaną zastąpione importowanymi. Operacji nie można cofnąć.", confirmLabel: "Zastąp punkty", danger: true }))) {
      return;
    }
    setSubmitting(true);
    const r = await fetch(`/api/meetings/${meetingId}/agenda/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode }),
    });
    setSubmitting(false);
    if (!r.ok) { setError(await readUserError(r)); return; }
    onImported();
  }

  return (
    <Modal
      title="Import porządku obrad"
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      footer={<>
        <button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn btn-primary" disabled={submitting || lines.length === 0} onClick={submit}>
          {submitting ? "Importuję…" : `Importuj ${lines.length} ${lines.length === 1 ? "punkt" : "punktów"}`}
        </button>
      </>}
    >
      <p className="mb-1">
        Wklej listę punktów - każdy w osobnej linii. Numery (1, 2, 3…) zostaną nadane automatycznie.
      </p>
      <p className="small text-body-secondary mb-3">
        Podpunkt: zacznij linię od wcięcia (spacja/tab) albo od „-”. Otrzyma numer z literą (np. 3a, 3b).
      </p>
      <label className="form-label" htmlFor="agenda-import">Lista punktów</label>
      <textarea
        id="agenda-import"
        className="form-control font-monospace small"
        style={{ minHeight: 220 }}
        placeholder={`Otwarcie posiedzenia\nProjekt uchwały w sprawie budżetu\n  - autopoprawka nr 1\n  - autopoprawka nr 2\nSprawy różne`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="form-text">
        Wczyta {lines.length} {lines.length === 1 ? "punkt" : lines.length < 5 ? "punkty" : "punktów"}{subCount > 0 ? ` (w tym ${subCount} jako podpunkty)` : ""}.
      </div>

      <fieldset className="mt-3">
        <legend className="form-label fs-6 mb-2">Tryb importu</legend>
        <div className="form-check">
          <input className="form-check-input" type="radio" name="agenda-import-mode" id="aim-append" checked={mode === "append"} onChange={() => setMode("append")} />
          <label className="form-check-label" htmlFor="aim-append">Dopisz na koniec ({existingCount} {existingCount === 1 ? "istniejący" : "istniejących"})</label>
        </div>
        <div className="form-check mb-0">
          <input className="form-check-input" type="radio" name="agenda-import-mode" id="aim-replace" checked={mode === "replace"} onChange={() => setMode("replace")} />
          <label className="form-check-label text-danger" htmlFor="aim-replace">Zastąp wszystkie</label>
        </div>
      </fieldset>

      {error && <div className="alert alert-danger py-2 mt-3 mb-0 small">{error}</div>}
    </Modal>
  );
}

function ItemEditor({
  item, onCancel, onSave,
}: {
  item?: AgendaItem;
  onCancel: () => void;
  onSave: (data: { number: string; title: string; committee: string | null; presenter: string | null; isSubItem: boolean; unnumbered: boolean; speechLimitSec: number | null }) => void;
}) {
  const [number, setNumber] = useState(item?.number ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [committee, setCommittee] = useState((item as { committee?: string | null })?.committee ?? "");
  const [presenter, setPresenter] = useState(item?.presenter ?? "");
  const [isSubItem, setIsSubItem] = useState(item?.isSubItem ?? false);
  const [unnumbered, setUnnumbered] = useState(item?.unnumbered ?? false);
  const [limit, setLimit] = useState(item?.speechLimitSec != null ? String(item.speechLimitSec) : "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sec = parseInt(limit, 10);
    onSave({ number: unnumbered ? "" : number, title, committee: committee || null, presenter: presenter || null, isSubItem, unnumbered, speechLimitSec: Number.isFinite(sec) && sec > 0 ? sec : null });
  }

  const uid = item?.id ?? "new";
  return (
    <form onSubmit={submit} className="row g-3">
      <div className="col-4 col-sm-2">
        <label className="form-label" htmlFor={`ai-num-${uid}`}>Numer</label>
        <input id={`ai-num-${uid}`} className="form-control" required={!unnumbered} disabled={unnumbered} value={unnumbered ? "" : number} onChange={(e) => setNumber(e.target.value)} placeholder={unnumbered ? "-" : "np. 3a"} />
      </div>
      <div className="col-8 col-sm-10">
        <label className="form-label" htmlFor={`ai-title-${uid}`}>Tytuł</label>
        <input id={`ai-title-${uid}`} className="form-control" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="col-12 col-md-6">
        <label className="form-label" htmlFor={`ai-pres-${uid}`}>Referent <span className="fw-normal text-body-secondary">(opcjonalnie)</span></label>
        <input id={`ai-pres-${uid}`} className="form-control" value={presenter} onChange={(e) => setPresenter(e.target.value)} placeholder="np. Burmistrz Miasta" />
      </div>
      <div className="col-12 col-md-6">
        <label className="form-label" htmlFor={`ai-com-${uid}`}>Komisja / opinia <span className="fw-normal text-body-secondary">(opcjonalnie)</span></label>
        <input id={`ai-com-${uid}`} className="form-control" value={committee} onChange={(e) => setCommittee(e.target.value)} placeholder="np. Komisja ds. Finansów" />
      </div>
      <div className="col-12 col-md-6">
        <label className="form-label" htmlFor={`ai-limit-${uid}`}>Limit wypowiedzi <span className="fw-normal text-body-secondary">(opcjonalnie)</span></label>
        <div className="input-group">
          <input id={`ai-limit-${uid}`} className="form-control" type="number" min={0} step={10} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="z ustawień" />
          <span className="input-group-text">s</span>
        </div>
        <div className="form-text">Domyślny limit wystąpienia w liście mówców tego punktu. Puste = limit z ustawień.</div>
      </div>
      <div className="col-12">
        <div className="form-check">
          <input className="form-check-input" type="checkbox" id={`ai-unnum-${uid}`} checked={unnumbered} onChange={(e) => setUnnumbered(e.target.checked)} />
          <label className="form-check-label" htmlFor={`ai-unnum-${uid}`}>Bez numeru (pozycja pokazywana jako sama nazwa, np. przerwa, otwarcie)</label>
        </div>
        <div className="form-check mb-0">
          <input className="form-check-input" type="checkbox" id={`ai-sub-${uid}`} checked={isSubItem} onChange={(e) => setIsSubItem(e.target.checked)} />
          <label className="form-check-label" htmlFor={`ai-sub-${uid}`}>Podpunkt (wyświetlany z wcięciem)</label>
        </div>
      </div>
      <div className="col-12 d-flex justify-content-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>Anuluj</button>
        <button type="submit" className="btn btn-primary">Zapisz</button>
      </div>
    </form>
  );
}

/** Limit w sekundach jako m:ss (np. 3:00). */
function formatLimit(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} min`;
}

function StatusPill({ status }: { status: AgendaItemStatus }) {
  if (status === "CURRENT") return <span className="badge badge-live">Rozpatrywany</span>;
  if (status === "COMPLETED") return <span className="badge text-bg-success">Zakończony</span>;
  if (status === "SKIPPED") return <span className="badge text-bg-light border">Pominięty</span>;
  return <span className="badge text-bg-light border">{AGENDA_ITEM_STATUS_LABEL[status]}</span>;
}
