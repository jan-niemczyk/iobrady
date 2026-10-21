import { InquiryCaseOperatorClient } from "@/components/operator/inquiries/InquiryCaseOperatorClient";

export const dynamic = "force-dynamic";

export default async function InquiryCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InquiryCaseOperatorClient id={id} />;
}
