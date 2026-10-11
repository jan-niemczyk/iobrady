import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicMeeting, loadPublicVote, type PublicVoteDetail } from "@/lib/publicMeeting";
import { fmtDate, fmtTime, TYPE_LABEL, plural } from "@/components/public/publicFormat";
import { ClubSummary, VotePeople } from "@/components/public/VotePeople";
import { PublicAutoRefresh } from "@/components/public/PublicAutoRefresh";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ meetingId: string; voteId: string }> }): Promise<Metadata> {
  const { meetingId, voteId } = await params;
  const v = await loadPublicVote(meetingId, voteId);
  return { title: v ? `Głosowanie nr ${v.number ?? ""} - ${v.title}` : "Głosowanie" };
}

export default async function PublicVotePage({ params, searchParams }: {
  params: Promise<{ meetingId: string; voteId: string }>;
  searchParams: Promise<{ z?: string }>;
}) {
  const { meetingId, voteId } = await params;
  const { z } = await searchParams;
  const [meeting, vote] = await Promise.all([loadPublicMeeting(meetingId), loadPublicVote(meetingId, voteId)]);
  if (!meeting || !vote) notFound();

  const item = vote.agendaItemId ? meeting.agenda.find((a) => a.id === vote.agendaItemId) : null;
  // Powrót do widoku, z którego przyszedł użytkownik, i do tego głosowania na liście.
  const back = `/public/${meeting.id}${z === "glosowania" ? "?widok=glosowania" : ""}#g-${vote.id}`;
  const closed = vote.status === "CLOSED";

  return (
    <>
      <PublicAutoRefresh active={meeting.active && !closed} seconds={15} />
      <header className="pub-header">
        <div className="container-lg py-3" style={{ maxWidth: 1080 }}>
          <Link href={back} className="small">← Wróć do posiedzenia</Link>
          <div className="small text-body-secondary mt-2" style={{ overflowWrap: "anywhere" }}>
            {meeting.name}{meeting.number ? `, posiedzenie nr ${meeting.number}` : ""}
          </div>
          <h1 className="h4 mb-1" style={{ overflowWrap: "anywhere" }}>
            <span className="text-body-secondary fw-normal">Głosowanie nr {vote.number ?? "-"}:</span> {vote.title}
          </h1>
          {vote.description && <p className="mb-1" style={{ overflowWrap: "anywhere" }}>{vote.description}</p>}
          <div className="small text-body-secondary d-flex flex-wrap column-gap-3 row-gap-1">
            {vote.time && <span>{fmtDate(vote.time)}, godz. {fmtTime(vote.time)}</span>}
            <span>{vote.secret ? "Głosowanie tajne" : "Głosowanie jawne"}{vote.booth ? " (kabina)" : ""}, {TYPE_LABEL[vote.type]}</span>
            <span>
              {item
                ? <>Punkt porządku obrad: {item.unnumbered || !item.number ? "" : `${item.number}. `}{item.title}</>
                : "Bez przypisania do punktu porządku obrad"}
            </span>
          </div>
        </div>
      </header>

      <main className="container-lg py-4 d-flex flex-column gap-3" style={{ maxWidth: 1080 }}>
        {!closed ? (
          <section className="card">
            <div className="card-body">
              <h2 className="h5">{vote.status === "OPEN" ? "Głosowanie trwa" : vote.status === "CANCELLED" ? "Głosowanie anulowane" : vote.status === "INTERRUPTED" ? "Głosowanie przerwane" : "Głosowanie bezprzedmiotowe"}</h2>
              <p className="mb-0 text-body-secondary">
                {vote.status === "OPEN" ? "Wyniki pojawią się po zakończeniu głosowania. Strona odświeża się sama." : "Dla tego głosowania nie opublikowano wyników."}
              </p>
            </div>
          </section>
        ) : (
          <>
            <Summary vote={vote} />
            {vote.groupsEnabled && !vote.secret && vote.type !== "PACKAGE" && vote.people.length > 0 && (
              <section className="card" aria-labelledby="pv-clubs">
                <div className="card-body">
                  <h2 id="pv-clubs" className="h5 mb-2">Zestawienie według klubów i kół</h2>
                  <ClubSummary vote={vote} />
                </div>
              </section>
            )}
            <section className="card" aria-labelledby="pv-people">
              <div className="card-body">
                <h2 id="pv-people" className="h5 mb-1">{vote.secret ? "Udział w głosowaniu" : "Wyniki indywidualne"}</h2>
                {vote.secret && <p className="small text-body-secondary mb-2">Głosowanie tajne: lista pokazuje tylko, kto oddał głos - bez treści głosu.</p>}
                {!vote.presenceKnown && vote.type !== "QUORUM" && <p className="small text-body-secondary mb-2">Obecność z chwili głosowania nie została zapisana - osoby bez głosu oznaczono jako „nie oddał głosu”.</p>}
                <VotePeople vote={vote} />
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="pub-stat border rounded-2 px-3 py-2 bg-body">
      <div className="small text-body-secondary">{label}</div>
      <div className={`pub-stat-value${tone ? ` ${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function Summary({ vote }: { vote: PublicVoteDetail }) {
  const r = vote.result!;
  const notVoted = r.present != null ? Math.max(0, r.present - r.cast) : null;
  return (
    <section className="card" aria-labelledby="pv-sum">
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <h2 id="pv-sum" className="h5 mb-0 me-2">Wynik</h2>
          {vote.decision && <span className={`badge fs-6 ${vote.decision.positive ? "text-bg-success" : "text-bg-danger"}`}>{vote.decision.label}</span>}
          {vote.majority && <span className="small text-body-secondary">Większość: {vote.majority}</span>}
        </div>

        {vote.type === "STANDARD" && (
          <div className="d-flex flex-wrap gap-2">
            <Stat label="Za" value={r.yes ?? 0} tone="text-success-emphasis" />
            <Stat label="Przeciw" value={r.no ?? 0} tone="text-danger-emphasis" />
            <Stat label="Wstrzymujące się" value={r.abstain ?? 0} tone="text-warning-emphasis" />
            {r.invalid ? <Stat label="Nieważne" value={r.invalid} /> : null}
          </div>
        )}
        {vote.type === "QUORUM" && (
          <div className="d-flex flex-wrap gap-2">
            <Stat label="Obecni (potwierdzili)" value={r.cast} />
            {r.eligible != null && <Stat label="Uprawnieni" value={r.eligible} />}
          </div>
        )}
        {vote.type === "LIST" && (
          <div className="table-responsive">
            <table className="table table-sm align-middle pub-table mb-0" style={{ maxWidth: 640 }}>
              <caption className="visually-hidden">Głosy na kandydatury</caption>
              <thead><tr><th scope="col">Kandydatura</th><th scope="col" className="text-end">Głosy za</th>{(r.options ?? []).some((o) => o.passed != null) && <th scope="col">Rozstrzygnięcie</th>}</tr></thead>
              <tbody>
                {(r.options ?? []).map((o) => (
                  <tr key={o.label}>
                    <th scope="row" className="fw-medium" style={{ overflowWrap: "anywhere" }}>{o.label}</th>
                    <td className="text-end">{o.count ?? 0}</td>
                    {(r.options ?? []).some((x) => x.passed != null) && <td>{o.passed == null ? <span className="text-body-secondary">-</span> : <span className={`badge ${o.passed ? "text-bg-success" : "text-bg-light border"}`}>{o.passed ? "Wybrana" : "Niewybrana"}</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {vote.type === "PACKAGE" && (
          <div className="table-responsive">
            <table className="table table-sm align-middle pub-table mb-0">
              <caption className="visually-hidden">Wyniki pozycji pakietu</caption>
              <thead><tr><th scope="col">Poz.</th><th scope="col">Treść</th><th scope="col" className="text-end">Za</th><th scope="col" className="text-end">Przeciw</th><th scope="col" className="text-end">Wstrz.</th><th scope="col">Rozstrzygnięcie</th></tr></thead>
              <tbody>
                {(r.options ?? []).map((o, i) => (
                  <tr key={i}>
                    <td>{o.positionNumber}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{o.label}</td>
                    <td className="text-end">{o.yes}</td><td className="text-end">{o.no}</td><td className="text-end">{o.abstain}</td>
                    <td>{o.passed == null ? <span className="text-body-secondary">-</span> : <span className={`badge ${o.passed ? "text-bg-success" : "text-bg-danger"}`}>{o.passed ? "Przyjęto" : "Odrzucono"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="small text-body-secondary mb-0 mt-2">
          Oddano {r.cast} {plural(r.cast, "głos", "głosy", "głosów")}
          {r.present != null && <>, obecnych uprawnionych {r.present}</>}
          {notVoted != null && notVoted > 0 && vote.type !== "QUORUM" && <>, nie oddało głosu {notVoted}</>}
          {r.eligible != null && <>, uprawnionych {r.eligible}</>}.
        </p>
      </div>
    </section>
  );
}
