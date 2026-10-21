import { InfoDetailClient } from "@/components/participant/info/InfoDetailClient";

export const dynamic = "force-dynamic";

export default async function InfoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InfoDetailClient id={id} />;
}
