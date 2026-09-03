"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";

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
  function bulkDelete() {
    if (selectedIds.length === 0) return;
    const msg =
      `Usunąć zaznaczone konta (${selectedIds.length})?\n\n` +
      "Konta powiązane z historią posiedzeń (oddane głosy, obecność, wystąpienia) " +
      "zostaną dezaktywowane zamiast usunięte - dotychczasowe rejestry i wyniki pozostaną nienaruszone.";
    if (!window.confirm(msg)) return;
    startTransition(async () => {
      const r = await fetch("/api/users/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds }),
      });
      if (!r.ok) { alert(await r.text()); return; }
      const res = await r.json().catch(() => ({ deleted: 0, deactivated: 0 }));
      setSelectedIds([]);
      await refetch();
      alert(`Usunięto kont: ${res.deleted ?? 0}\nDezaktywowano (z historią): ${res.deactivated ?? 0}`);
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
      if (!r.ok) { alert(await r.text()); return; }
      const res = await r.json().catch(() => ({ updated: 0 }));
      setSelectedIds([]);
      await refetch();
      alert(`Zmieniono przynależność klubową dla ${res.updated ?? 0} kont.`);
    });
  }

  function bulkLoginCards() {
    if (selectedIds.length === 0) return;
    const msg =
      `Wygenerować odcinki logowania dla zaznaczonych kont (${selectedIds.length})?\n\n` +
      "UWAGA: hasła zostaną USTAWIONE NA NOWE (system nie przechowuje starych haseł). " +
      "Dotychczasowe hasła tych osób przestaną działać. Nowe hasła znajdą się na odcinkach PDF.";
    if (!window.confirm(msg)) return;
    startTransition(async () => {
      const r = await fetch("/api/users/reset-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds }),
      });
      if (!r.ok) { alert(await r.text()); return; }
      const res = await r.json().catch(() => ({ cards: [] }));
      const cards = res.cards ?? [];
      if (cards.length === 0) { alert("Brak kont do wygenerowania."); return; }
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
      if (!r.ok) { alert(await r.text()); return; }
      await refetch();
    });
  }

  return (
    <div className="px-6 py-8 max-w-[1200px] mx-auto">
      <header className="flex items-end justify-between border-b border-[var(--color-rule)] pb-6 mb-8">
        <div>
          <div className="eyebrow mb-2">Konta i grupy</div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>Uczestnicy</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setShowImportModal(true)}>Importuj z CSV</button>
          <button className="btn" onClick={() => setShowGroupModal("new")}>+ Nowa grupa</button>
          <button className="btn btn-primary" onClick={() => setShowUserModal("new")}>+ Nowy uczestnik</button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Konta */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="eyebrow">Konta ({users.length})</h2>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--color-ink-2)" }}>
                  zaznaczono: {selectedIds.length}
                </span>
                <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }}
                  onClick={() => setSelectedIds([])}>Odznacz</button>
                <select
                  className="input"
                  style={{ padding: "4px 8px", fontSize: 11, width: "auto" }}
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    bulkAssignGroup(v === "__none__" ? null : v);
                    e.target.value = "";
                  }}
                  title="Hurtowo przypisz zaznaczone konta do wybranej grupy/klubu"
                >
                  <option value="">Przypisz do grupy…</option>
                  <option value="__none__">(bez grupy / niezrzeszeni)</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.shortName ?? g.name}</option>)}
                </select>
                <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }}
                  onClick={bulkLoginCards} title="Zresetuj hasła zaznaczonym i pobierz PDF z odcinkami (login, hasło, adres, QR)">Odcinki logowania</button>
                <button className="btn" style={{ padding: "4px 10px", fontSize: 11, color: "var(--color-no)" }}
                  onClick={bulkDelete}>Usuń zaznaczone</button>
              </div>
            )}
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--color-paper-2)" }}>
                <tr className="text-left">
                  <th className="px-3 py-3" style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Zaznacz wszystkie"
                      checked={selectableIds.length > 0 && selectedIds.length === selectableIds.length}
                      onChange={(e) => setSelectedIds(e.target.checked ? selectableIds : [])}
                    />
                  </th>
                  <th className="eyebrow px-4 py-3 font-normal">Imię i nazwisko</th>
                  <th className="eyebrow px-4 py-3 font-normal">E-mail</th>
                  <th className="eyebrow px-4 py-3 font-normal">Rola</th>
                  <th className="eyebrow px-4 py-3 font-normal">Klub</th>
                  <th className="eyebrow px-4 py-3 font-normal">Aktywne</th>
                  <th className="eyebrow px-4 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-t border-[var(--color-rule-soft)] ${!u.active ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2">
                      {u.role !== "OPERATOR" && (
                        <input
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
                    <td className="px-4 py-2">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-2 mono text-xs" style={{ color: "var(--color-ink-3)" }}>{u.email}</td>
                    <td className="px-4 py-2">
                      <span className="pill pill-neutral">{u.role === "OPERATOR" ? "Operator" : "Uczestnik"}</span>
                    </td>
                    <td className="px-4 py-2">
                      {u.groupShort ? (
                        <span style={{ color: u.groupColor ?? undefined }}>{u.groupShort}</span>
                      ) : (
                        <span style={{ color: "var(--color-ink-3)" }}>-</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{u.active ? "✓" : "-"}</td>
                    <td className="px-4 py-2 text-right">
                      <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setShowUserModal(u)}>
                        Edytuj
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Grupy */}
        <aside>
          <h2 className="eyebrow mb-3">Grupy ({groups.length})</h2>
          <ul className="card divide-y divide-[var(--color-rule-soft)]">
            {groups.map((g) => (
              <li key={g.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span style={{ display: "inline-block", width: 8, height: 8, background: g.color ?? "var(--color-ink-3)" }} />
                  <span className="truncate">{g.name}</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="mono text-xs" style={{ color: "var(--color-ink-3)" }}>{g.userCount}</span>
                  <button className="btn" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => setShowGroupModal(g)}>
                    Edytuj
                  </button>
                </div>
              </li>
            ))}
            {groups.length === 0 && <li className="px-4 py-3 text-xs" style={{ color: "var(--color-ink-3)" }}>Brak grup.</li>}
          </ul>
        </aside>
      </div>

      {showUserModal && (
        <UserModal
          user={showUserModal === "new" ? null : showUserModal}
          groups={groups}
          onClose={() => setShowUserModal(null)}
          onSave={(method, payload) => {
            act(method, showUserModal === "new" ? "/api/users" : `/api/users/${(showUserModal as User).id}`, payload);
            setShowUserModal(null);
          }}
          onDelete={() => {
            if (showUserModal !== "new" && window.confirm("Dezaktywować użytkownika?")) {
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
          onDelete={() => {
            if (showGroupModal !== "new" && window.confirm("Usunąć grupę?")) {
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
    </div>
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
      body: JSON.stringify({ rows }),
    });
    setSubmitting(false);
    if (!r.ok) { setError(await r.text()); return; }
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
    if (cards.length === 0) { alert("Brak nowo utworzonych kont z hasłami do wydruku."); return; }
    const { downloadLoginCards } = await import("@/lib/loginCards");
    const loginUrl = `${window.location.origin}/login`;
    await downloadLoginCards(cards, loginUrl, "odcinki-logowania");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card no-grid" style={{ width: "100%", maxWidth: 720, background: "#FFFFFF", maxHeight: "85vh", overflow: "auto" }}>
        <div className="px-5 py-3 border-b border-[var(--color-rule)] flex items-center justify-between">
          <h2 className="eyebrow">Import użytkowników z CSV</h2>
          <button onClick={onClose} className="btn" style={{ padding: "4px 10px", fontSize: 12 }}>Zamknij</button>
        </div>
        <div className="p-5">
          {!results ? (
            <>
              <p className="text-sm mb-3">
                Wklej zawartość pliku CSV. <strong>Pierwszy wiersz</strong> musi zawierać nagłówki.
              </p>
              <div className="text-xs mono mb-3" style={{ background: "var(--color-paper-2)", padding: "8px 10px", color: "var(--color-ink-2)" }}>
                Wymagane: <strong>imię, nazwisko, email</strong><br />
                Opcjonalne: rola (OPERATOR / PARTICIPANT / CHAIRPERSON), klub (nazwa grupy), skrót (krótka nazwa klubu)
              </div>
              <details className="mb-3 text-xs" style={{ color: "var(--color-ink-3)" }}>
                <summary style={{ cursor: "pointer" }}>Przykład CSV (kliknij aby zobaczyć)</summary>
                <pre className="mt-2 mono" style={{ background: "var(--color-paper-2)", padding: 8, fontSize: 11 }}>
{`imię,nazwisko,email,rola,klub,skrót
Anna,Kowalska,a.kowalska@rada.pl,PARTICIPANT,Klub Polska XXI,KPXXI
Jan,Nowak,j.nowak@rada.pl,PARTICIPANT,Klub Centrum,KC
Maria,Wiśniewska,m.wisniewska@rada.pl,CHAIRPERSON,,`}
                </pre>
              </details>
              <textarea
                className="input mono"
                style={{ minHeight: 200, fontSize: 12 }}
                placeholder="Wklej tutaj zawartość CSV…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              {error && (
                <div className="mt-3 p-2 text-sm" style={{ background: "var(--color-no-bg)", color: "var(--color-no)" }}>
                  {error}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button className="btn" onClick={onClose}>Anuluj</button>
                <button
                  className="btn btn-primary"
                  disabled={submitting || !text.trim()}
                  onClick={submit}
                >
                  {submitting ? "Importuję…" : "Importuj"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm mb-3">
                <strong>Wynik importu:</strong> utworzono {results.filter((r) => r.status === "created").length} z {results.length}.{" "}
                Hasła są pokazane jednorazowo - pobierz CSV i przekaż użytkownikom.
              </p>
              <div className="mb-3" style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--color-rule)" }}>
                <table className="w-full text-xs">
                  <thead style={{ background: "var(--color-paper-2)", position: "sticky", top: 0 }}>
                    <tr>
                      <th className="text-left p-2">Imię i nazwisko</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2 mono">Hasło</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-rule-soft)" }}>
                        <td className="p-2">{r.name}</td>
                        <td className="p-2 mono" style={{ fontSize: 11 }}>{r.email}</td>
                        <td className="p-2 mono" style={{ fontWeight: 600 }}>{r.password ?? "-"}</td>
                        <td className="p-2">
                          {r.status === "created" && <span style={{ color: "var(--color-yes)" }}>✓ utworzono</span>}
                          {r.status === "skipped" && <span style={{ color: "var(--color-ink-3)" }}>pominięto</span>}
                          {r.status === "error" && <span style={{ color: "var(--color-no)" }} title={r.error}>✕ błąd</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={downloadResults} disabled={results.filter((r) => r.status === "created").length === 0}>
                  Pobierz hasła (CSV)
                </button>
                <button className="btn" onClick={downloadImportCards} disabled={results.filter((r) => r.status === "created").length === 0}>
                  Odcinki logowania (PDF)
                </button>
                <button className="btn btn-primary" onClick={onImported}>Zakończ</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Modale
// ─────────────────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(11,14,20,0.55)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "8vh 20px", zIndex: 50, overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="card no-grid" style={{ width: "100%", maxWidth: 520, background: "#FFFFFF" }}>
        <div className="px-6 py-4 border-b border-[var(--color-rule)] flex items-center justify-between">
          <h2 className="eyebrow">{title}</h2>
          <button onClick={onClose} className="btn" style={{ padding: "4px 10px", fontSize: 12 }}>Zamknij</button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
      payload.password = password;
      onSave("POST", payload);
    } else {
      if (password) payload.password = password;
      onSave("PATCH", payload);
    }
  }

  return (
    <ModalShell title={isNew ? "Nowy uczestnik" : "Edycja uczestnika"} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Imię</label>
            <input className="input" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="label">Nazwisko</label>
            <input className="input" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">E-mail (login)</label>
          <input type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Funkcja (opcjonalnie)</label>
          <input className="input" placeholder="np. Przewodniczący, Wiceprzewodnicząca" value={functionTitle} onChange={(e) => setFunctionTitle(e.target.value)} />
          <p className="text-xs mt-1" style={{ color: "var(--color-ink-3)" }}>Pokazywana na liście mówców, prezentacji i transmisji.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Rola</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="PARTICIPANT">Uczestnik</option>
              <option value="OPERATOR">Operator</option>
            </select>
          </div>
          <div>
            <label className="label">Klub / koło</label>
            <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">- bez grupy -</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">{isNew ? "Hasło" : "Nowe hasło (zostaw puste, jeśli bez zmiany)"}</label>
          <input
            type="password" className="input"
            required={isNew} minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={isNew ? "min. 6 znaków" : "min. 6 znaków"}
          />
        </div>
        {!isNew && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="text-sm">Konto aktywne</span>
          </label>
        )}

        <div className="flex justify-between pt-4 border-t border-[var(--color-rule-soft)]">
          {!isNew && (
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending}>
              Dezaktywuj
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button type="button" className="btn" onClick={onClose}>Anuluj</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {isNew ? "Utwórz" : "Zapisz"}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
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

  return (
    <ModalShell title={isNew ? "Nowa grupa" : "Edycja grupy"} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <div>
          <label className="label">Pełna nazwa</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Klub Niezależnych" />
        </div>
        <div>
          <label className="label">Skrót (do tabel)</label>
          <input className="input" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="np. KN" maxLength={20} />
        </div>
        <div>
          <label className="label">Kolor</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 48, height: 32, border: "1px solid var(--color-rule)", background: "transparent" }} />
            <input type="text" className="input mono" style={{ fontSize: 13 }} value={color} onChange={(e) => setColor(e.target.value)} pattern="#[0-9A-Fa-f]{6}" />
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t border-[var(--color-rule-soft)]">
          {!isNew && (
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={pending || (group?.userCount ?? 0) > 0} title={(group?.userCount ?? 0) > 0 ? "Grupa ma przypisanych użytkowników" : ""}>
              Usuń
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button type="button" className="btn" onClick={onClose}>Anuluj</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {isNew ? "Utwórz" : "Zapisz"}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
