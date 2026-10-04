import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { loadMeetingParticipantsData } from "@/lib/meetingParticipantsData";

/** GET - dane edytora składu posiedzenia (planer w panelu posiedzenia). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "OPERATOR")
    return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const data = await loadMeetingParticipantsData(id);
  if (!data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(data);
}
