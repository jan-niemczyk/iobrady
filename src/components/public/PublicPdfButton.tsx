"use client";

import { useState } from "react";

/**
 * Pobranie raportu PDF głosowania (albo wszystkich zakończonych) w widoku publicznym.
 * PDF powstaje w przeglądarce tym samym szablonem co raporty operatora (pdfmake + Lato).
 */
export function PublicPdfButton({ meetingId, voteId, fileName, label, className }: {
  meetingId: string; voteId?: string; fileName: string; label: string; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true); setError(null);
    try {
      const q = voteId ? `?vote=${encodeURIComponent(voteId)}` : "";
      const r = await fetch(`/api/public/meetings/${encodeURIComponent(meetingId)}/report-data${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const { reports } = await r.json();
      if (!reports?.length) { setError("Brak zakończonych głosowań do pobrania."); return; }
      const { downloadReportsPdf } = await import("@/lib/generatePdf");
      await downloadReportsPdf(reports, fileName);
    } catch {
      setError("Nie udało się przygotować pliku PDF. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="d-inline-flex flex-column align-items-start">
      <button type="button" className={className ?? "btn btn-outline-primary btn-sm pub-tap"} onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? "Przygotowywanie PDF…" : label}
      </button>
      {error && <span role="alert" className="small text-danger mt-1">{error}</span>}
    </span>
  );
}
