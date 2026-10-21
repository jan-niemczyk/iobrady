import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicMeeting, loadPublicVote, type PublicVoteDetail } from "@/lib/publicMeeting";
import { TYPE_LABEL, itemNumberLabel, plural, voteWhen } from "@/components/public/publicFormat";
import { ClubSummary, VotePeople } from "@/components/public/VotePeople";
import { PublicAutoRefresh } from "@/components/public/PublicAutoRefresh";
import { PublicPdfButton } from "@/components/public/PublicPdfButton";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ meetingId: string; voteId: string }> }): Promise<Metadata> {
  const { meetingId, voteId } = await params;
  const v = await loadPublicVote(meetingId, voteId);
  return { title: v ? `Głosowanie nr ${v.number ?? ""} - ${v.item?.title ?? v.title}` : "Głosowanie" };
}

export default async function PublicVotePage({ params, searchParams }: {
  params: Promise<{ meetingId: string; voteId: string }>;
  searchParams: Promise<{ z?: string; q?: string }>;
}) {
  const { meetingId, voteId } = await params;
  const { z, q } = await searchParams;
  const [meeting, vote] = await Promise.all([loadPublicMeeting(meetingId), loadPublicVote(meetingId, voteId)]);
  if (!meeting || !vote) notFound();

  // Powrót do widoku, z którego przyszedł użytkownik (zakładka i fraza wyszukiwania), i do tego głosowania.
  const fromList = z === "glosowania";
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra);
    if (fromList && typeof q === "string" && q.trim()) p.set("q", q.trim().slice(0, 200));
    const t = p.toString();
    return t ? `?${t}` : "";
  };
  const back = `/public/${meeting.id}${qs(fromList ? { widok: "glosowania" } : {})}${fromList ? "" : `#g-${vote.id}`}`;
  const sibling = (id: string) => `/public/${meeting.id}/glosowanie/${id}${qs(fromList ? { z: "glosowania" } : {})}`;
  const closed = vote.status === "CLOSED";
  const itemLabel = itemNumberLabel(vote.item);

  return (
    <>
      <PublicAutoRefresh active={meeting.active && !closed} seconds={15} />
      <header className="pub-header">
        <div className="container-lg py-3" style={{ maxWidth: 1080 }}>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <Link href={back} className="btn btn-sm btn-outline-secondary"><IconArrowLeft size={14} /> {fromList ? "Wróć do listy głosowań" : "Wróć do porządku obrad"}</Link>
            <nav aria-label="Sąsiednie głosowania" className="d-flex gap-2">
              {vote.prev && <Link href={sibling(vote.prev.id)} className="btn btn-sm btn-outline-secondary"><IconArrowLeft size={14} /> Głosowanie nr {vote.prev.number ?? "-"}</Link>}
              {vote.next && <Link href={sibling(vote.next.id)} className="btn btn-sm btn-outline-secondary">Głosowanie nr {vote.next.number ?? "-"} <IconArrowRight size={14} /></Link>}
            </nav>
          </div>
          <div className="small text-body-secondary mt-3" style={{ overflowWrap: "anywhere" }}>
            {meeting.organization ? `${meeting.organization} - ` : ""}{meeting.name}{meeting.number ? `, posiedzenie nr ${meeting.number}` : ""}
          </div>
          <div className="pub-vote-kicker mt-1">
            Głosowanie nr {vote.number ?? "-"}{vote.time ? ` - ${voteWhen(vote.time)}` : ""}
          </div>
          <h1 className="pub-vote-title" style={{ overflowWrap: "anywhere" }}>
            {vote.item
              ? <>{itemLabel && <span className="text-nowrap">{itemLabel} </span>}{vote.item.title}</>
              : (vote.contextLabel ?? "Głosowanie poza porządkiem obrad")}
          </h1>
          <p className="pub-vote-subject mb-1" style={{ overflowWrap: "anywhere" }}>
            {vote.title}
          </p>
          {vote.description && <p className="mb-1" style={{ overflowWrap: "anywhere" }}>{vote.description}</p>}
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <span className="badge text-bg-light border fw-normal">{vote.secret ? "Głosowanie tajne" : "Głosowanie jawne"}{vote.booth ? " (kabina)" : ""}</span>
            <span className="badge text-bg-light border fw-normal">{TYPE_LABEL[vote.type]}</span>
            {vote.decision && <span className={`badge fs-6 ${vote.decision.positive ? "text-bg-success" : "text-bg-danger"}`}>{vote.decision.label}</span>}
            {!vote.item && !vote.contextLabel && <span className="small text-body-secondary">Bez przypisania do punktu porządku obrad</span>}
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
            <div>
              <PublicPdfButton meetingId={meeting.id} voteId={vote.id} fileName={`glosowanie-${vote.number ?? vote.id}`} label="Pobierz raport PDF" />
            </div>
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
                <h2 id="pv-people" className="h5 mb-1">{vote.type === "QUORUM" ? "Obecność" : vote.secret ? "Udział w głosowaniu" : "Wyniki indywidualne"}</h2>
                {vote.secret && <p className="small text-body-secondary mb-2">Głosowanie tajne: lista pokazuje tylko, kto oddał głos - bez treści głosu.</p>}
                {vote.type === "QUORUM" && <p className="small text-body-secondary mb-2">Sprawdzenie kworum: obecność stwierdzają osoby, które potwierdziły ją w tym sprawdzeniu.</p>}
                {!vote.presenceKnown && vote.type !== "QUORUM" && <p className="small text-body-secondary mb-2">Obecność z chwili głosowania nie została zapisana - osoby bez głosu oznaczono jako „brak głosu” (nie wiadomo, czy były obecne).</p>}
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
  const p = vote.participation;
  return (
    <section className="card" aria-labelledby="pv-sum">
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <h2 id="pv-sum" className="h5 mb-0 me-2">{vote.type === "QUORUM" ? "Wynik sprawdzenia kworum" : "Wynik"}</h2>
          {vote.decision && <span className={`badge fs-6 ${vote.decision.positive ? "text-bg-success" : "text-bg-danger"}`}>{vote.decision.label}</span>}
          {vote.majority && <span className="small text-body-secondary">Wymagana większość: {vote.majority}</span>}
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
          <div className="table-responsive" tabIndex={0} role="region" aria-label="Tabela wyników (przewijana)">
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
          <div className="table-responsive" tabIndex={0} role="region" aria-label="Tabela wyników (przewijana)">
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

        {vote.type !== "QUORUM" && (
          <dl className="pub-facts small mb-0 mt-3">
            <div><dt>Oddane głosy</dt><dd>{r.cast}</dd></div>
            {p?.presentAtOpen != null && <div><dt>Obecni uprawnieni w chwili otwarcia głosowania</dt><dd>{p.presentAtOpen}</dd></div>}
            {p && p.notVotedPresentAtOpen > 0 && <div><dt>Obecni przy otwarciu, bez oddanego głosu</dt><dd>{p.notVotedPresentAtOpen}</dd></div>}
            {p && p.votedJoinedLater > 0 && <div><dt>Głosy osób, których obecność potwierdzono po otwarciu</dt><dd>{p.votedJoinedLater}</dd></div>}
            {r.eligible != null && <div><dt>Uprawnieni do głosowania</dt><dd>{r.eligible}</dd></div>}
          </dl>
        )}
        {vote.type !== "QUORUM" && p && p.votedJoinedLater > 0 && (
          <p className="small text-body-secondary mb-0 mt-2">
            Liczba obecnych pochodzi z chwili otwarcia głosowania. {p.votedJoinedLater} {plural(p.votedJoinedLater, "osoba potwierdziła", "osoby potwierdziły", "osób potwierdziło")} obecność później i {plural(p.votedJoinedLater, "oddała", "oddały", "oddało")} głos - dlatego liczba głosów i liczba obecnych przy otwarciu mogą się różnić od listy imiennej.
          </p>
        )}
      </div>
    </section>
  );
}
