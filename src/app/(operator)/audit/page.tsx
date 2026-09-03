import { prisma } from "@/lib/db";
import Link from "next/link";
import { formatDateTime } from "@/lib/labels";
import type { AuditAction } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<AuditAction, string> = {
  MEETING_CREATED: "Utworzono posiedzenie",
  MEETING_UPDATED: "Zmieniono dane posiedzenia",
  MEETING_OPENED: "Otwarto posiedzenie",
  MEETING_CLOSED: "Zamknięto posiedzenie",
  MEETING_REOPENED: "Cofnięto zakończenie posiedzenia",
  MEETING_CANCELLED: "Anulowano posiedzenie",
  MEETING_DELETED: "Usunięto posiedzenie",
  ATTENDANCE_OPENED: "Otwarto listę obecności",
  ATTENDANCE_CLOSED: "Zamknięto listę obecności",
  ATTENDANCE_MARKED: "Oznaczono obecność",
  ATTENDANCE_REVOKED: "Cofnięto obecność",
  AGENDA_ITEM_STARTED: "Operacja na punkcie agendy",
  AGENDA_ITEM_COMPLETED: "Zakończono punkt agendy",
  VOTE_CREATED: "Utworzono głosowanie",
  VOTE_UPDATED: "Zmieniono nazwę głosowania",
  VOTE_OPENED: "Otwarto głosowanie",
  VOTE_CLOSED: "Zamknięto głosowanie",
  VOTE_INTERRUPTED: "Przerwano głosowanie",
  VOTE_CANCELLED: "Anulowano głosowanie",
  VOTE_DELETED: "Usunięto głosowanie",
  VOTE_RESULT_PUBLISHED: "Opublikowano wynik",
  VOTE_RESULT_HIDDEN: "Ukryto wynik",
  VOTE_MAJORITY_RECOMPUTED: "Przeliczono większość",
  PARTICIPANT_EXCLUDED: "Wyłączono uczestnika",
  PARTICIPANT_RIGHT_CHANGED: "Zmieniono prawo uczestnika",
  SETTINGS_CHANGED: "Zmieniono ustawienia",
  MESSAGE_PUBLISHED: "Opublikowano komunikat",
};

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ meeting?: string }> }) {
  const sp = await searchParams;
  const logs = await prisma.auditLog.findMany({
    where: sp.meeting ? { meetingId: sp.meeting } : {},
    include: { user: true, meeting: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <div className="px-6 py-8 max-w-[1400px] mx-auto">
      <header className="border-b border-[var(--color-rule)] pb-6 mb-8 flex items-end justify-between">
        <div>
          <div className="eyebrow mb-2">Rejestr</div>
          <h1 style={{ fontSize: 32, lineHeight: 1.05 }}>Rejestr czynności formalnych</h1>
          <p className="text-sm mt-3" style={{ color: "var(--color-ink-2)" }}>
            Ostatnich {logs.length} wpisów. {sp.meeting && <Link href="/audit" className="underline">Pokaż wszystkie</Link>}
          </p>
        </div>
        <a href={`/api/audit/csv${sp.meeting ? `?meeting=${sp.meeting}` : ""}`} className="btn">Pobierz CSV</a>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "var(--color-paper-2)" }}>
            <tr className="text-left">
              <th className="eyebrow px-4 py-3 font-normal" style={{ width: 170 }}>Czas</th>
              <th className="eyebrow px-4 py-3 font-normal">Akcja</th>
              <th className="eyebrow px-4 py-3 font-normal">Opis</th>
              <th className="eyebrow px-4 py-3 font-normal">Kto</th>
              <th className="eyebrow px-4 py-3 font-normal">Posiedzenie</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-[var(--color-rule-soft)]">
                <td className="px-4 py-2 mono text-xs" style={{ color: "var(--color-ink-3)" }}>{formatDateTime(l.createdAt)}</td>
                <td className="px-4 py-2"><span className="pill pill-neutral">{ACTION_LABEL[l.action]}</span></td>
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--color-ink-3)" }}>
                  {l.user ? `${l.user.firstName} ${l.user.lastName}` : "-"}
                </td>
                <td className="px-4 py-2 text-xs mono" style={{ color: "var(--color-ink-3)" }}>
                  {l.meeting ? (<Link href={`/meetings/${l.meeting.id}`} className="hover:underline">{l.meeting.number}</Link>) : "-"}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--color-ink-3)" }}>Brak wpisów.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
