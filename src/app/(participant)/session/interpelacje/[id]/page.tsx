import { InquiryCaseParticipant } from "@/components/participant/inquiries/InquiryCaseParticipant";

export const dynamic = "force-dynamic";

export default async function ParticipantInquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InquiryCaseParticipant id={id} />;
}
