"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const KIND_LABEL: Record<string, string> = {
  SIMPLE: "Zwykła",
  ABSOLUTE: "Bezwzględna",
  QUALIFIED_TWO_THIRDS: "Kwalifikowana 2/3",
  QUALIFIED_THREE_FIFTHS: "Kwalifikowana 3/5",
};

export function RecomputeMajority({
  voteId, currentKind, currentBase,
}: {
  voteId: string;
  currentKind: string;
  currentBase: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState(currentKind);
  const [base, setBase] = useState(currentBase);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const changed = kind !== currentKind || base !== currentBase;

  async function recompute() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/votes/${voteId}/recompute-majority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ majorityKind: kind, majorityBase: base }),
      });
      if (!r.ok) { setMsg(await r.text()); return; }
      const { passed } = await r.json();
      setMsg(`Przeliczono. Wynik: ${passed ? "przyjęto" : "odrzucono"}.`);
      router.refresh();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="text-sm font-semibold mb-2">Korekta zadeklarowanej większości</div>
      <p className="text-xs mb-3" style={{ color: "var(--color-ink-3)" }}>
        Jeśli przy głosowaniu wybrano błędny próg większości, można go tu poprawić - wynik zostanie przeliczony z zachowanych liczników.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Rodzaj większości</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Podstawa</label>
          <select className="input" value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="OF_VOTERS">głosujących</option>
            <option value="OF_PRESENT">obecnych</option>
            <option value="OF_FULL_BODY">ustawowego składu</option>
          </select>
        </div>
        <button className="btn btn-primary" disabled={busy || !changed} onClick={recompute}>
          {busy ? "Przeliczanie…" : "Przelicz wynik"}
        </button>
      </div>
      {msg && <p className="text-xs mt-2" style={{ color: "var(--color-ink-2)" }}>{msg}</p>}
    </div>
  );
}
