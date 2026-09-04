import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SetupWizardClient } from "@/components/SetupWizardClient";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (settings?.setupComplete) redirect("/login");

  return <SetupWizardClient />;
}
