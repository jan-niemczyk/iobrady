import { notFound } from "next/navigation";
import { meetingAttendance } from "@/lib/attendanceReport";
import { MeetingAttendanceClient } from "@/components/operator/MeetingAttendanceClient";

export const dynamic = "force-dynamic";

export default async function MeetingAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await meetingAttendance(id, { withNotes: true });
  if (!r) notFound();
  return <MeetingAttendanceClient initial={r} />;
}
