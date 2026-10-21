import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMeetingParticipant } from "@/lib/participantAccess";
import { ATTACHMENTS_DIR } from "@/lib/attachments";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/** Typy, które można otworzyć w przeglądarce (?inline=1) - pozostałe zawsze jako pobranie pliku. */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

/**
 * GET /api/attachments/[id]/download - jedyna droga do treści załącznika. Reguły dostępu:
 *  - operator zalogowany -> zawsze OK.
 *  - radny zalogowany -> OK tylko jeśli ma MeetingParticipant dla tego posiedzenia
 *    i attachment.visibleToParticipants === true.
 *  - brak sesji -> OK tylko jeśli meeting.publicEnabled === true
 *    i attachment.visibleToPublic === true.
 * W pozostałych przypadkach 404 (nie zdradzamy różnicy między "nie istnieje" a "brak dostępu").
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const inline = new URL(req.url).searchParams.get("inline") === "1";
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
    const disposition = inline && INLINE_TYPES.has(attachment.mimeType) ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": attachment.mimeType,
        // RFC 6266: nazwa z polskimi znakami w filename*, zapasowa wersja ASCII w filename.
        "Content-Disposition": `${disposition}; filename="${asciiFileName(attachment.fileName)}"; filename*=UTF-8''${encodeRFC5987(attachment.fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

function asciiFileName(name: string): string {
  const plain = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L");
  return plain.replace(/[^A-Za-z0-9._ ()-]/g, "_").slice(0, 200) || "plik";
}

function encodeRFC5987(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
