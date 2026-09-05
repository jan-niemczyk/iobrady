"use client";

import { useState } from "react";
import { MyAgendaItemNote } from "@/components/participant/MyAgendaItemNote";
import { VoteResultsView } from "@/components/participant/VoteResultsView";

interface PointVote { id: string; number: number | null; title: string; type: string }
interface PointAttachment { id: string; fileName: string; sizeBytes: number }
interface Point {
  id: string; number: string; title: string; isSubItem: boolean;
  presenter: string | null; committee: string | null; times: string | null;
  attachments: PointAttachment[]; votes: PointVote[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentLink({ a }: { a: PointAttachment }) {
  return (
    <a href={`/api/attachments/${a.id}/download`} className="text-xs hover:underline flex items-center gap-1" style={{ color: "var(--color-ink-2)" }}>
      📎 {a.fileName} <span style={{ color: "var(--color-ink-3)" }}>({formatSize(a.sizeBytes)})</span>
    </a>
  );
}

export function ArchiveMeetingDetailClient({
  points, meetingAttachments, adHocVotes,
}: {
  points: Point[];
  meetingAttachments: PointAttachment[];
  adHocVotes: PointVote[];
}) {
  const [resultsVoteId, setResultsVoteId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {meetingAttachments.length > 0 && (
        <div className="card p-4">
          <div className="eyebrow mb-2">Materiały posiedzenia</div>
          <div className="space-y-1">
            {meetingAttachments.map((a) => <AttachmentLink key={a.id} a={a} />)}
          </div>
        </div>
      )}

      <ol className="divide-y divide-[var(--color-rule-soft)] card overflow-hidden">
        {points.map((p) => (
          <li key={p.id} className="px-4 py-3" style={{ marginLeft: p.isSubItem ? 20 : 0 }}>
            <div className="flex items-start gap-3">
              <span className="mono text-xs mt-0.5 shrink-0" style={{ color: "var(--color-ink-3)", width: 32 }}>{p.number}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.title}</div>
                {(p.presenter || p.committee) && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>
                    {p.presenter && <>Referent: {p.presenter} </>}{p.committee && <>· Opinia: {p.committee}</>}
                  </div>
                )}
                {p.times && <div className="text-xs mono mt-0.5" style={{ color: "var(--color-ink-3)" }}>{p.times}</div>}

                {p.attachments.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {p.attachments.map((a) => <AttachmentLink key={a.id} a={a} />)}
                  </div>
                )}

                {p.votes.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.votes.map((v) => (
                      <button key={v.id} className="btn btn-sm" onClick={() => setResultsVoteId(v.id)}>
                        Wyniki: {v.title}
                      </button>
                    ))}
                  </div>
                )}

                <MyAgendaItemNote agendaItemId={p.id} />
              </div>
            </div>
          </li>
        ))}
        {points.length === 0 && (
          <li className="px-4 py-8 text-center text-sm" style={{ color: "var(--color-ink-3)" }}>Brak punktów porządku.</li>
        )}
      </ol>

      {adHocVotes.length > 0 && (
        <div className="card p-4">
          <div className="eyebrow mb-2">Głosowania poza porządkiem obrad</div>
          <div className="flex flex-wrap gap-1.5">
            {adHocVotes.map((v) => (
              <button key={v.id} className="btn btn-sm" onClick={() => setResultsVoteId(v.id)}>Wyniki: {v.title}</button>
            ))}
          </div>
        </div>
      )}

      {resultsVoteId && <VoteResultsView voteId={resultsVoteId} onClose={() => setResultsVoteId(null)} />}
    </div>
  );
}
