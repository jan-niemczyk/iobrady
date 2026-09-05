import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMeetingParticipant } from "@/lib/participantAccess";
import { ATTACHMENTS_DIR } from "@/lib/attachments";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/attachments/[id]/download - jedyna droga do treści załącznika. Reguły dostępu:
 *  - operator zalogowany -> zawsze OK.
 *  - radny zalogowany -> OK tylko jeśli ma MeetingParticipant dla tego posiedzenia
 *    i attachment.visibleToParticipants === true.
 *  - brak sesji -> OK tylko jeśli meeting.publicEnabled === true
 *    i attachment.visibleToPublic === true.
 * W pozostałych przypadkach 404 (nie zdradzamy różnicy między "nie istnieje" a "brak dostępu").
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { meeting: { select: { publicEnabled: true } } },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const session = await auth();
  let allowed = false;
  if (session?.user.role === "OPERATOR") {
    allowed = true;
  } else if (session?.user.id) {
    const mp = await getMeetingParticipant(session.user.id, attachment.meetingId);
    allowed = !!mp && attachment.visibleToParticipants;
  } else {
    allowed = attachment.meeting.publicEnabled && attachment.visibleToPublic;
  }
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  try {
    const buf = await readFile(path.join(ATTACHMENTS_DIR, attachment.storedName));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
