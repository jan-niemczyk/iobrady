import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMeetingParticipant } from "@/lib/participantAccess";
import { buildVoteReportData } from "@/lib/voteReportData";
import { VoteResultsBody } from "@/components/participant/VoteResultsView";
import { ParticipantPdfButton } from "@/components/participant/ParticipantPdfButton";

export const dynamic = "force-dynamic";

/** Pełne szczegóły zakończonego głosowania dla uczestnika posiedzenia (te same zasady tajności co raport). */
export default async function ParticipantVotePage({ params }: { params: Promise<{ voteId: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { voteId } = await params;
  const vote = await prisma.vote.findUnique({ where: { id: voteId }, select: { meetingId: true, status: true } });
  if (!vote || vote.status !== "CLOSED") notFound();
  if (!(await getMeetingParticipant(session.user.id, vote.meetingId))) notFound();
  const data = await buildVoteReportData(voteId);
  if (!data) notFound();
  const back = `/session/posiedzenie/${vote.meetingId}`;
  return (
    <div className="pt-page pt-page-wide">
      <div className="pt-btn-group">
        <a className="pt-btn pt-btn-sm" href={back}>Wróć do posiedzenia</a>
        <ParticipantPdfButton data={data} />
      </div>
      <section className="pt-panel"><div className="pt-panel-body"><VoteResultsBody data={data} headingLevel={1} /></div></section>
    </div>
  );
}
