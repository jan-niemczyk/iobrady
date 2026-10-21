"use client";

import { useState } from "react";
import type { ReportData } from "@/lib/reportTypes";
import { IconDownload } from "@/components/ui/Icon";

/** Raport PDF głosowania z tych samych danych co widok (pdfmake po stronie przeglądarki). */
export function ParticipantPdfButton({ data }: { data: ReportData }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="pt-btn pt-btn-sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const { downloadReportsPdf } = await import("@/lib/generatePdf");
        await downloadReportsPdf([data], `glosowanie-${data.voteNumber}`);
      } finally { setBusy(false); }
    }}>
      <IconDownload size={15} /> {busy ? "Generowanie…" : "Raport PDF"}
    </button>
  );
}
