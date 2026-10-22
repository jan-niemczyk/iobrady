import { ResponderCaseClient } from "@/components/responder/ResponderCaseClient";

export const dynamic = "force-dynamic";

export default async function ResponderCasePage({ params }: { params: Promise<{ id: string }> }) {
  return <ResponderCaseClient id={(await params).id} />;
}
