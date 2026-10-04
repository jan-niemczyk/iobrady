import { auth } from "@/lib/auth";
import { canManageMeeting } from "@/lib/canManage";
import { redirect, notFound } from "next/navigation";
import { ChairpersonClient } from "./ChairpersonClient";

export const dynamic = "force-dynamic";

export default async function ChairpersonPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const { meetingId } = await params;
  if (!(await canManageMeeting(session, meetingId))) {
    notFound();
  }
  return <ChairpersonClient meetingId={meetingId} />;
}
