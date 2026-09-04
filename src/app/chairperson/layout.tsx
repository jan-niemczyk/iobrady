import "../bootstrap-scoped.css";
import { requireSetupComplete } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function ChairpersonLayout({ children }: { children: React.ReactNode }) {
  await requireSetupComplete();
  return <>{children}</>;
}
