"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { CardHeader, PageContainer, PageHeader } from "./ui";
import { Modal } from "./Modal";
import { ask, notify, notifyFailure, readUserError } from "@/lib/feedback";

interface User {
  id: string; email: string;
  firstName: string; lastName: string;
  functionTitle?: string | null;
  role: Role; active: boolean;
  groupId: string | null;
  groupShort: string | null;
  groupColor: string | null;
}

interface Group {
  id: string; name: string; shortName: string | null;
  color: string | null; userCount: number;
}

export function ParticipantsManagerClient({
  initialUsers, initialGroups,
}: {
  initialUsers: User[];
  initialGroups: Group[];
}) {
  const [users, setUsers] = useState(initialUsers);
  // Hurtowe zaznaczanie kont (checkboxy) do zbiorczego usunięcia
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groups, setGroups] = useState(initialGroups);
  const [pending, startTransition] = useTransition();
  const [showUserModal, setShowUserModal] = useState<User | "new" | null>(null);
  const [showGroupModal, setShowGroupModal] = useState<Group | "new" | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  async function refetch() {
    const [u, g] = await Promise.all([
      fetch("/api/users", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/groups", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setUsers(u);
    setGroups(g.map((x: Group & { _count?: { users: number } }) => ({
      id: x.id, name: x.name, shortName: x.shortName, color: x.color,
      userCount: (x as { _count?: { users: number } })._count?.users ?? 0,
    })));
  }

  /** Konta, które można zaznaczyć do usunięcia (operatorów nie usuwamy hurtowo). */
  const selectableIds = users.filter((u) => u.role !== "OPERATOR").map((u) => u.id);

  /**
   * Hurtowe usuwanie kont. Backend chroni historię: konto z jakimkolwiek śladem
   * w posiedzeniach (głosy, obecność, wystąpienia) jest DEZAKTYWOWANE zamiast usunięte,
   * dzięki czemu żaden rejestr ani wynik głosowania nie znika.
   */
  async function bulkDelete() {
    if (selectedIds.length === 0) return;
    const ok = await ask({
      title: `Usunąć zaznaczone konta (${selectedIds.length})?`,
      message: "Konta powiązane z historią posiedzeń (oddane głosy, obecność, wystąpienia) " +
        "zostaną dezaktywowane zamiast usunięte - dotychczasowe rejestry i wyniki pozostaną nienaruszone.",
      confirmLabel: "Usuń konta",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await fetch("/api/users/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds }),
      });
      if (!r.ok) { await notifyFailure(r); return; }
      const res = await r.json().catch(() => ({ deleted: 0, deactivated: 0 }));
      setSelectedIds([]);
      await refetch();
      notify.success(`Usunięto kont: ${res.deleted ?? 0}`, `Dezaktywowano (z historią): ${res.deactivated ?? 0}`);
    });
  }

  function bulkAssignGroup(groupId: string | null) {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const r = await fetch("/api/users/bulk-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds, groupId }),
      });
      if (!r.ok) { await notifyFailure(r); return; }
      const res = await r.json().catch(() => ({ updated: 0 }));
      setSelectedIds([]);
      await refetch();
      notify.success(`Zmieniono przynależność klubową dla ${res.updated ?? 0} kont.`);
    });
  }

  async function bulkLoginCards() {
    if (selectedIds.length === 0) return;
    const ok = await ask({
      title: `Wygenerować odcinki logowania (${selectedIds.length})?`,
      message: "UWAGA: hasła zostaną USTAWIONE NA NOWE (system nie przechowuje starych haseł). " +
        "Dotychczasowe hasła tych osób przestaną działać. Nowe hasła znajdą się na odcinkach PDF.",
      confirmLabel: "Ustaw nowe hasła",
      danger: true,
    });
    if (!ok) return;
    // Jak dotąd: druga decyzja - "Anuluj" oznacza tylko rezygnację z e-maili, nie z odcinków.
    const sendEmails = await ask({
      title: "Wysłać e-mail z nowym hasłem?",
      message: "E-mail z nowym hasłem może trafić do każdej z tych osób.",
      confirmLabel: "Wyślij e-maile",
      cancelLabel: "Bez e-maili",
    });
    startTransition(async () => {
      const r = await fetch("/api/users/reset-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds, sendEmails }),
      });
      if (!r.ok) { await notifyFailure(r); return; }
      const res = await r.json().catch(() => ({ cards: [] }));
      const cards = res.cards ?? [];
      if (cards.length === 0) { notify.info("Brak kont do wygenerowania."); return; }
      const { downloadLoginCards } = await import("@/lib/loginCards");
      const loginUrl = `${window.location.origin}/login`;
      await downloadLoginCards(cards, loginUrl, "odcinki-logowania");
      setSelectedIds([]);
    });
  }

  function act(method: string, url: string, body?: object) {
    startTransition(async () => {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) { await notifyFailure(r); return; }
      await refetch();
    });
  }

  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length;

  return (
    <PageContainer size="xl">
      <PageHeader
        kicker="Konta i grupy"
        title="Uczestnicy"
        actions={<>
          <button className="btn" onClick={() => setShowImportModal(true)}>Importuj z CSV</button>
          <button className="btn" onClick={() => setShowGroupModal("new")}>+ Nowa grupa</button>
          <button className="btn btn-primary" onClick={() => setShowUserModal("new")}>+ Nowy uczestnik</button>
        </>}
      />

      <div className="row g-3 align-items-start">
        {/* Konta */}
        <section className="col-12 col-xl-8">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title-text">Konta <span className="text-body-secondary fw-normal">({users.length})</span></h2>
              {selectedIds.length > 0 && (
                <div className="d-flex align-items-center flex-wrap gap-2">
                  <span className="small text-body-secondary">Zaznaczono: {selectedIds.length}</span>
                  <button className="btn btn-sm" onClick={() => setSelectedIds([])}>Odznacz</button>
                  <select
                    className="form-select form-select-sm w-auto"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      bulkAssignGroup(v === "__none__" ? null : v);
                      e.target.value = "";
                    }}
                    aria-label="Hurtowo przypisz zaznaczone konta do wybranej grupy/klubu"
                    title="Hurtowo przypisz zaznaczone konta do wybranej grupy/klubu"
                  >
                    <option value="">Przypisz do grupy…</option>
                    <option value="__none__">(bez grupy / niezrzeszeni)</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.shortName ?? g.name}</option>)}
                  </select>
                  <button className="btn btn-sm"
                    onClick={bulkLoginCards} title="Zresetuj hasła zaznaczonym i pobierz PDF z odcinkami (login, hasło, adres, QR)">Odcinki logowania</button>
                  <button className="btn btn-sm" onClick={() => setShowEmailModal(true)}>Wyślij e-mail</button>
                  <button className="btn btn-sm btn-outline-danger" onClick={bulkDelete}>Usuń zaznaczone</button>
                </div>
              )}
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input className="form-check-input"
                        type="checkbox"
                        aria-label="Zaznacz wszystkie"
                        checked={allSelected}
                        onChange={(e) => setSelectedIds(e.target.checked ? selectableIds : [])}
                      />
                    </th>
                    <th>Imię i nazwisko</th>
                    <th className="d-none d-md-table-cell">E-mail</th>
                    <th className="d-none d-sm-table-cell">Rola</th>
                    <th>Klub</th>
                    <th className="text-center d-none d-sm-table-cell">Aktywne</th>
                    <th><span className="visually-hidden">Akcje</span></th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-body-secondary py-4">Brak kont.</td></tr>
                  )}
                  {users.map((u) => (
                    <tr key={u.id} className={!u.active ? "opacity-50" : undefined}>
                      <td>
                        {u.role !== "OPERATOR" && (
                          <input className="form-check-input"
                            type="checkbox"
                            aria-label={`Zaznacz ${u.firstName} ${u.lastName}`}
                            checked={selectedIds.includes(u.id)}
                            onChange={(e) =>
                              setSelectedIds((prev) =>
                                e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id),
                              )
                            }
                          />
                        )}
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <div className="fw-medium">{u.firstName} {u.lastName}</div>
                        <div className="small text-body-secondary d-md-none" style={{ overflowWrap: "anywhere" }}>{u.email}</div>
                      </td>
                      <td className="d-none d-md-table-cell small text-body-secondary text-nowrap">{u.email}</td>
                      <td className="d-none d-sm-table-cell">
                        <span className={`badge ${u.role === "OPERATOR" ? "text-bg-primary" : "text-bg-light border"}`}>{u.role === "OPERATOR" ? "Operator" : "Uczestnik"}</span>
                      </td>
                      <td>
                        {u.groupShort ? (
                          <span className="d-inline-flex align-items-center gap-2">
                            <span className="rounded-circle flex-shrink-0" style={{ width: 8, height: 8, background: u.groupColor ?? "var(--bs-secondary)" }} />
                            {u.groupShort}
                          </span>
                        ) : (
                          <span className="text-body-secondary">-</span>
                        )}
                      </td>
                      <td className="text-center d-none d-sm-table-cell">{u.active ? <span className="text-success" aria-label="tak">✓</span> : <span className="text-body-secondary" aria-label="nie">-</span>}</td>
                      <td className="text-end">
                        <button className="btn btn-sm" onClick={() => setShowUserModal(u)}>
                          Edytuj
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Grupy */}
        <aside className="col-12 col-xl-4">
          <div className="card">
            <CardHeader title={<>Grupy <span className="text-body-secondary fw-normal">({groups.length})</span></>} />
            {groups.length === 0 ? (
              <div className="card-body text-body-secondary">Brak grup.</div>
            ) : (
              <ul className="list-group list-group-flush">
                {groups.map((g) => (
                  <li key={g.id} className="list-group-item d-flex align-items-center justify-content-between gap-2">
                    <span className="d-flex align-items-center gap-2 min-w-0">
                      <span className="rounded-circle flex-shrink-0" style={{ width: 10, height: 10, background: g.color ?? "var(--bs-secondary)" }} />
                      <span className="text-truncate">{g.name}</span>
                    </span>
                    <div className="d-flex align-items-center gap-2 flex-shrink-0">
                      <span className="badge text-bg-light border" title="Liczba kont">{g.userCount}</span>
                      <button className="btn btn-sm" onClick={() => setShowGroupModal(g)}>
                        Edytuj
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {showUserModal && (
        <UserModal
          user={showUserModal === "new" ? null : showUserModal}
          groups={groups}
          onClose={() => setShowUserModal(null)}
          onSave={(method, payload) => {
            const p = payload as Record<string, unknown>;
            if (showUserModal === "new" && (p.autoGenerate || p.sendEmail)) {
              startTransition(async () => {
                const r = await fetch("/api/users", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                if (!r.ok) { await notifyFailure(r); return; }
                const res = await r.json().catch(() => ({}));
                await refetch();
                notify.success("Konto zostało utworzone.");
                if (res.emailError) {
                  console.error("[e-mail] ", res.emailError);
                  notify.warning("Nie udało się wysłać e-maila z danymi logowania.", "Konto utworzono - przekaż dane logowania inną drogą.");
                }
                if (res.password) {
                  const { downloadLoginCards } = await import("@/lib/loginCards");
                  const loginUrl = `${window.location.origin}/login`;
                  await downloadLoginCards(
                    [{ name: `${p.firstName} ${p.lastName}`.trim(), email: String(p.email), password: res.password }],
                    loginUrl, "odcinek-logowania",
                  );
                }
              });
              setShowUserModal(null);
              return;
            }
            act(method, showUserModal === "new" ? "/api/users" : `/api/users/${(showUserModal as User).id}`, payload);
            setShowUserModal(null);
          }}
          onDelete={async () => {
            if (showUserModal !== "new" && await ask({ title: "Dezaktywować użytkownika?", message: `${(showUserModal as User).firstName} ${(showUserModal as User).lastName} nie będzie mógł się logować.`, confirmLabel: "Dezaktywuj", danger: true })) {
              act("DELETE", `/api/users/${(showUserModal as User).id}`);
              setShowUserModal(null);
            }
          }}
          pending={pending}
        />
      )}

      {showGroupModal && (
        <GroupModal
          group={showGroupModal === "new" ? null : showGroupModal}
          onClose={() => setShowGroupModal(null)}
          onSave={(method, payload) => {
            act(method, showGroupModal === "new" ? "/api/groups" : `/api/groups/${(showGroupModal as Group).id}`, payload);
            setShowGroupModal(null);
          }}
          onDelete={async () => {
            if (showGroupModal !== "new" && await ask({ title: "Usunąć grupę?", message: `Grupa „${(showGroupModal as Group).name}” zostanie usunięta.`, confirmLabel: "Usuń", danger: true })) {
              act("DELETE", `/api/groups/${(showGroupModal as Group).id}`);
              setShowGroupModal(null);
            }
          }}
          pending={pending}
        />
      )}

      {showImportModal && (
        <ImportCsvModal onClose={() => setShowImportModal(false)} onImported={() => {
          setShowImportModal(false);
          // ponowne pobranie listy
          if (typeof window !== "undefined") window.location.reload();
        }} />
      )}

      {showEmailModal && (
        <SendEmailModal userIds={selectedIds} onClose={() => setShowEmailModal(false)} onSent={() => { setShowEmailModal(false); setSelectedIds([]); }} />
      )}
    </PageContainer>
  );
}

function SendEmailModal({ userIds, onClose, onSent }: { userIds: string[]; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    const r = await fetch("/api/email/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds, subject, body }),
    });
    setBusy(false);
    if (!r.ok) { setError(await readUserError(r)); return; }
    onSent();
  }

  return (
    <Modal
      title={`Wyślij e-mail do zaznaczonych (${userIds.length})`}
      onClose={onClose}
      closeOnBackdrop={false}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Anuluj</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !subject.trim() || !body.trim()}>
          {busy ? "Wysyłam…" : "Wyślij"}
        </button>
      </>}
    >
      <div className="d-flex flex-column gap-3">
        <div>
          <label className="form-label" htmlFor="em-subject">Temat</label>
          <input id="em-subject" className="form-control" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="form-label" htmlFor="em-body">Treść</label>
          <textarea id="em-body" className="form-control" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        {error && <div className="alert alert-danger py-2 mb-0 small">{error}</div>}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Modal importu CSV
// ─────────────────────────────────────────────────────────────────────────

function ImportCsvModal({
  onClose, onImported,
}: { onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendEmails, setSendEmails] = useState(false);
  const [results, setResults] = useState<{ email: string; name: string; password: string | null; status: string; error?: string }[] | null>(null);

  // Bardzo prosty parser CSV (zakładamy `,` lub `;` jako separator, opcjonalne cudzysłowy)
  function parseCsv(raw: string): { firstName: string; lastName: string; email: string; role?: string; groupName?: string; groupShort?: string }[] {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return [];
    // wykryj separator
    const sep = (lines[0].includes(";") && !lines[0].includes(",")) ? ";" : ",";
    const splitLine = (l: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === sep && !inQ) { out.push(cur); cur = ""; continue; }
        cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };

    // pierwszy wiersz - nagłówki (case-insensitive)
    const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ""));
    const idx = {
      firstName: headers.findIndex((h) => h.includes("imie") || h.includes("imię") || h === "firstname" || h === "imie"),
      lastName: headers.findIndex((h) => h.includes("nazwisko") || h === "lastname"),
      email: headers.findIndex((h) => h.includes("email") || h.includes("e-mail") || h === "mail"),
      role: headers.findIndex((h) => h === "rola" || h === "role"),
      groupName: headers.findIndex((h) => h === "klub" || h === "grupa" || h.includes("group")),
      groupShort: headers.findIndex((h) => h.includes("skrot") || h.includes("skrót") || h === "short"),
    };
    if (idx.firstName < 0 || idx.lastName < 0 || idx.email < 0) {
      throw new Error("Wymagane nagłówki: imię, nazwisko, email (pierwszy wiersz to nagłówki)");
    }
    const rows = [];
    for (const line of lines.slice(1)) {
      const cells = splitLine(line);
      const row = {
        firstName: cells[idx.firstName] ?? "",
        lastName: cells[idx.lastName] ?? "",
        email: cells[idx.email] ?? "",
        role: idx.role >= 0 ? (cells[idx.role] ?? "").toUpperCase() : undefined,
        groupName: idx.groupName >= 0 ? cells[idx.groupName] || undefined : undefined,
        groupShort: idx.groupShort >= 0 ? cells[idx.groupShort] || undefined : undefined,
      };
      if (row.firstName && row.lastName && row.email) rows.push(row);
    }
    return rows;
  }

  async function submit() {
    setError(null);
    let rows: ReturnType<typeof parseCsv>;
    try {
      rows = parseCsv(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (rows.length === 0) {
      setError("Nie znaleziono żadnych wierszy do importu.");
      return;
    }
    setSubmitting(true);
    const r = await fetch("/api/users/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, sendEmails }),
    });
    setSubmitting(false);
    if (!r.ok) { setError(await readUserError(r)); return; }
    const j = await r.json();
    setResults(j.results);
  }

  function downloadResults() {
    if (!results) return;
    const header = "Imię,Nazwisko,Email,Hasło,Status";
    const lines = results.map((r) => {
      const [first, ...rest] = r.name.split(" ");
      const last = rest.join(" ");
      return [first, last, r.email, r.password ?? "-", r.status === "created" ? "utworzono" : r.status === "skipped" ? "pominięto" : "błąd"]
        .map((s) => `"${(s || "").replace(/"/g, '""')}"`).join(",");
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esog-uzytkownicy-import-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadImportCards() {
    if (!results) return;
    const cards = results
      .filter((r) => r.status === "created" && r.password)
      .map((r) => ({ name: r.name, email: r.email, password: r.password as string }));
    if (cards.length === 0) { notify.info("Brak nowo utworzonych kont z hasłami do wydruku."); return; }
    const { downloadLoginCards } = await import("@/lib/loginCards");
    const loginUrl = `${window.location.origin}/login`;
    await downloadLoginCards(cards, loginUrl, "odcinki-logowania");
  }

  const createdCount = results ? results.filter((r) => r.status === "created").length : 0;

  return (
    <Modal
      title="Import użytkowników z CSV"
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      footer={!results ? (
        <>
          <button className="btn" onClick={onClose}>Anuluj</button>
          <button className="btn btn-primary" disabled={submitting || !text.trim()} onClick={submit}>
            {submitting ? "Importuję…" : "Importuj"}
          </button>
        </>
      ) : (
        <>
          <button className="btn" onClick={downloadResults} disabled={createdCount === 0}>Pobierz hasła (CSV)</button>
          <button className="btn" onClick={downloadImportCards} disabled={createdCount === 0}>Odcinki logowania (PDF)</button>
          <button className="btn btn-primary" onClick={onImported}>Zakończ</button>
        </>
      )}
    >
      {!results ? (
        <>
          <p className="mb-2">
            Wklej zawartość pliku CSV. <strong>Pierwszy wiersz</strong> musi zawierać nagłówki.
          </p>
          <div className="small bg-body-tertiary border rounded px-3 py-2 mb-3">
            Wymagane: <strong>imię, nazwisko, email</strong><br />
            Opcjonalne: rola (OPERATOR / PARTICIPANT), klub (nazwa grupy), skrót (krótka nazwa klubu). Przewodniczącego wskazuje się w posiedzeniu, nie w koncie.
          </div>
          <details className="mb-3 small">
            <summary className="text-primary" style={{ cursor: "pointer" }}>Przykład CSV</summary>
            <pre className="mt-2 mb-0 font-monospace small bg-body-tertiary border rounded p-2">
{`imię,nazwisko,email,rola,klub,skrót
Anna,Kowalska,a.kowalska@rada.pl,PARTICIPANT,Klub Polska XXI,KPXXI
Jan,Nowak,j.nowak@rada.pl,PARTICIPANT,Klub Centrum,KC
Maria,Wiśniewska,m.wisniewska@rada.pl,PARTICIPANT,,`}
            </pre>
          </details>
          <label className="form-label" htmlFor="csv-text">Zawartość CSV</label>
          <textarea
            id="csv-text"
            className="form-control font-monospace small"
            style={{ minHeight: 200 }}
            placeholder="Wklej tutaj zawartość CSV…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && <div className="alert alert-danger py-2 mt-3 mb-0 small">{error}</div>}
          <div className="form-check mt-3 mb-0">
            <input className="form-check-input" type="checkbox" id="csv-send" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} />
            <label className="form-check-label" htmlFor="csv-send">Wyślij e-mail z danymi logowania do każdego utworzonego konta</label>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3">
            <strong>Wynik importu:</strong> utworzono {createdCount} z {results.length}.{" "}
            Hasła są pokazane jednorazowo - pobierz CSV i przekaż użytkownikom.
          </p>
          <div className="table-responsive border rounded" style={{ maxHeight: 320 }}>
            <table className="table table-sm mb-0 small">
              <thead className="sticky-top">
                <tr>
                  <th>Imię i nazwisko</th>
                  <th>Email</th>
                  <th>Hasło</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td className="font-monospace fw-semibold">{r.password ?? "-"}</td>
                    <td className="text-nowrap">
                      {r.status === "created" && <span className="text-success">✓ utworzono</span>}
                      {r.status === "skipped" && <span className="text-body-secondary">pominięto</span>}
                      {r.status === "error" && <span className="text-danger" title={r.error}>✕ błąd</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Modale
// ─────────────────────────────────────────────────────────────────────────

function UserModal({ user, groups, onClose, onSave, onDelete, pending }: {
  user: User | null;
  groups: Group[];
  onClose: () => void;
  onSave: (method: "POST" | "PATCH", payload: object) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [functionTitle, setFunctionTitle] = useState(user?.functionTitle ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "PARTICIPANT");
  const [groupId, setGroupId] = useState(user?.groupId ?? "");
  const [password, setPassword] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [active, setActive] = useState(user?.active ?? true);
  const isNew = !user;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      email, firstName, lastName, role,
      functionTitle: functionTitle.trim() || null,
      groupId: groupId || null, active,
    };
    if (isNew) {
      if (autoGenerate) payload.autoGenerate = true;
      else payload.password = password;
      if (sendEmail) payload.sendEmail = true;
      onSave("POST", payload);
    } else {
      if (password) payload.password = password;
      onSave("PATCH", payload);
    }
  }

  const formId = "user-modal-form";
  return (
    <Modal
      title={isNew ? "Nowy uczestnik" : "Edycja uczestnika"}
      onClose={onClose}
      closeOnBackdrop={false}
      footer={<>
        {!isNew && (
          <button type="button" className="btn btn-outline-danger me-auto" onClick={onDelete} disabled={pending}>
            Dezaktywuj
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>Anuluj</button>
        <button type="submit" form={formId} className="btn btn-primary" disabled={pending}>
          {isNew ? "Utwórz" : "Zapisz"}
        </button>
      </>}
    >
      <form id={formId} onSubmit={submit} className="row g-3">
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="um-first">Imię</label>
          <input id="um-first" className="form-control" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="um-last">Nazwisko</label>
          <input id="um-last" className="form-control" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="um-email">E-mail (login)</label>
          <input id="um-email" type="email" className="form-control" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="um-func">Funkcja <span className="fw-normal text-body-secondary">(opcjonalnie)</span></label>
          <input id="um-func" className="form-control" placeholder="np. Przewodniczący, Wiceprzewodnicząca" value={functionTitle} onChange={(e) => setFunctionTitle(e.target.value)} />
          <div className="form-text">Pokazywana na liście mówców, prezentacji i transmisji.</div>
        </div>
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="um-role">Rola</label>
          <select id="um-role" className="form-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="PARTICIPANT">Uczestnik</option>
            <option value="OPERATOR">Operator</option>
          </select>
        </div>
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="um-group">Klub / koło</label>
          <select id="um-group" className="form-select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">- bez grupy -</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="col-12">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            <label className="form-label mb-0" htmlFor="um-pass">{isNew ? "Hasło" : "Nowe hasło (zostaw puste, jeśli bez zmiany)"}</label>
            {isNew && (
              <div className="form-check mb-0 small">
                <input className="form-check-input" type="checkbox" id="um-autogen" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} />
                <label className="form-check-label" htmlFor="um-autogen">Wygeneruj hasło</label>
              </div>
            )}
          </div>
          <input
            id="um-pass"
            type="password" className="form-control"
            required={isNew && !autoGenerate} minLength={8}
            disabled={isNew && autoGenerate}
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={isNew && autoGenerate ? "zostanie wygenerowane automatycznie" : "min. 8 znaków"}
          />
          {isNew && autoGenerate && (
            <div className="form-text">Po utworzeniu konta pobierze się PDF z odcinkiem logowania (login, hasło, adres, QR).</div>
          )}
        </div>
        {isNew && (
          <div className="col-12">
            <div className="form-check mb-0">
              <input className="form-check-input" type="checkbox" id="um-send" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <label className="form-check-label" htmlFor="um-send">Wyślij e-mail z danymi logowania</label>
            </div>
          </div>
        )}
        {!isNew && (
          <div className="col-12">
            <div className="form-check mb-0">
              <input className="form-check-input" type="checkbox" id="um-active" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <label className="form-check-label" htmlFor="um-active">Konto aktywne</label>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function GroupModal({ group, onClose, onSave, onDelete, pending }: {
  group: Group | null;
  onClose: () => void;
  onSave: (method: "POST" | "PATCH", payload: object) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [shortName, setShortName] = useState(group?.shortName ?? "");
  const [color, setColor] = useState(group?.color ?? "#8B1A1A");
  const isNew = !group;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave(isNew ? "POST" : "PATCH", {
      name, shortName: shortName || null, color,
    });
  }

  const formId = "group-modal-form";
  const hasUsers = (group?.userCount ?? 0) > 0;
  return (
    <Modal
      title={isNew ? "Nowa grupa" : "Edycja grupy"}
      onClose={onClose}
      closeOnBackdrop={false}
      footer={<>
        {!isNew && (
          <button type="button" className="btn btn-outline-danger me-auto" onClick={onDelete} disabled={pending || hasUsers} title={hasUsers ? "Grupa ma przypisanych użytkowników" : ""}>
            Usuń
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>Anuluj</button>
        <button type="submit" form={formId} className="btn btn-primary" disabled={pending}>
          {isNew ? "Utwórz" : "Zapisz"}
        </button>
      </>}
    >
      <form id={formId} onSubmit={submit} className="row g-3">
        <div className="col-12">
          <label className="form-label" htmlFor="gm-name">Pełna nazwa</label>
          <input id="gm-name" className="form-control" required value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Klub Niezależnych" />
        </div>
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="gm-short">Skrót <span className="fw-normal text-body-secondary">(do tabel)</span></label>
          <input id="gm-short" className="form-control" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="np. KN" maxLength={20} />
        </div>
        <div className="col-12 col-sm-6">
          <label className="form-label" htmlFor="gm-color">Kolor</label>
          <div className="d-flex align-items-center gap-2">
            <input type="color" className="form-control form-control-color flex-shrink-0" aria-label="Wybór koloru" value={color} onChange={(e) => setColor(e.target.value)} />
            <input id="gm-color" type="text" className="form-control font-monospace" value={color} onChange={(e) => setColor(e.target.value)} pattern="#[0-9A-Fa-f]{6}" />
          </div>
        </div>
      </form>
    </Modal>
  );
}
