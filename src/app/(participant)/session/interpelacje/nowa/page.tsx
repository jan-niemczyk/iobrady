import { InquiryDraftForm } from "@/components/participant/inquiries/InquiryDraftForm";

export const dynamic = "force-dynamic";

export default async function NewInquiryPage({ searchParams }: { searchParams: Promise<{ rodzaj?: string }> }) {
  const { rodzaj } = await searchParams;
  return <InquiryDraftForm initialKind={rodzaj === "zapytanie" ? "QUESTION" : "INTERPELLATION"} />;
}
