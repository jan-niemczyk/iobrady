import { InfoListClient } from "@/components/participant/info/InfoListClient";

export const dynamic = "force-dynamic";

export default async function InfoListPage({ searchParams }: { searchParams: Promise<{ widok?: string }> }) {
  const sp = await searchParams;
  const view = sp.widok === "nieprzeczytane" ? "unread" : sp.widok === "dokumenty" ? "documents" : "all";
  return <InfoListClient initialView={view} />;
}
