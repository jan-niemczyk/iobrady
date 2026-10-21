import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listPublicCases } from "@/lib/inquiryPublic";
import { PublicInquiryHeader } from "@/components/public/inquiries/PublicInquiryHeader";
import { PublicInquirySearch } from "@/components/public/inquiries/PublicInquirySearch";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rejestr interpelacji i zapytań" };

/** Publiczny rejestr - tylko gdy włączony w ustawieniach; wyłącznie sprawy opublikowane. */
export default async function PublicInquiriesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const rows = await listPublicCases();
  if (!rows) notFound();
  const { q } = await searchParams;
  return (
    <>
      <PublicInquiryHeader />
      <main className="container-lg py-4" style={{ maxWidth: 1080 }}>
        <h1 className="h5 mb-3">Opublikowane interpelacje i zapytania</h1>
        <PublicInquirySearch rows={rows} initialQuery={q ?? ""} />
      </main>
    </>
  );
}
