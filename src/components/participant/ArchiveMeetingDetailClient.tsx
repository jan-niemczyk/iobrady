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
    <a href={`/api/attachments/${a.id}/download`} className="pt-attachment">
      📎 {a.fileName} <span className="pt-muted">({formatSize(a.sizeBytes)})</span>
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
    <>
      {meetingAttachments.length > 0 && (
        <section className="pt-panel">
          <div className="pt-panel-head"><h2 className="pt-panel-title">Materiały posiedzenia</h2></div>
          <div className="pt-panel-body flex flex-col gap-2">
            {meetingAttachments.map((a) => <AttachmentLink key={a.id} a={a} />)}
          </div>
        </section>
      )}

      <section className="pt-panel">
        <div className="pt-panel-head"><h2 className="pt-panel-title">Porządek obrad</h2></div>
        {points.length === 0 ? (
          <div className="pt-empty">Brak punktów porządku.</div>
        ) : (
          <ol className="pt-list">
            {points.map((p) => (
              <li key={p.id} style={{ alignItems: "flex-start", paddingLeft: p.isSubItem ? 36 : undefined }}>
                <span className="pt-num" style={{ minWidth: 28, paddingTop: 1 }}>{p.number}</span>
                <div className="pt-grow">
                  <div style={{ fontWeight: 500 }}>{p.title}</div>
                  {(p.presenter || p.committee) && (
                    <div className="pt-label" style={{ marginTop: 2 }}>
                      {[p.presenter ? `Referent: ${p.presenter}` : null, p.committee ? `Opinia: ${p.committee}` : null].filter(Boolean).join(" - ")}
                    </div>
                  )}
                  {p.times && <div className="pt-label num" style={{ marginTop: 2 }}>{p.times}</div>}

                  {p.attachments.length > 0 && (
                    <div className="flex flex-col gap-1" style={{ marginTop: 6 }}>
                      {p.attachments.map((a) => <AttachmentLink key={a.id} a={a} />)}
                    </div>
                  )}

                  {p.votes.length > 0 && (
                    <div className="pt-btn-group" style={{ marginTop: 8 }}>
                      {p.votes.map((v) => (
                        <button key={v.id} className="pt-btn pt-btn-sm" style={{ textAlign: "left" }} onClick={() => setResultsVoteId(v.id)}>
                          Wyniki: {v.title}
                        </button>
                      ))}
                    </div>
                  )}

                  <MyAgendaItemNote agendaItemId={p.id} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {adHocVotes.length > 0 && (
        <section className="pt-panel">
          <div className="pt-panel-head"><h2 className="pt-panel-title">Głosowania poza porządkiem obrad</h2></div>
          <div className="pt-panel-body pt-btn-group">
            {adHocVotes.map((v) => (
              <button key={v.id} className="pt-btn pt-btn-sm" style={{ textAlign: "left" }} onClick={() => setResultsVoteId(v.id)}>Wyniki: {v.title}</button>
            ))}
          </div>
        </section>
      )}

      {resultsVoteId && <VoteResultsView voteId={resultsVoteId} onClose={() => setResultsVoteId(null)} />}
    </>
  );
}
