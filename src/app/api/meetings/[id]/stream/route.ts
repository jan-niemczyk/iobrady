import { auth } from "@/lib/auth";
import { subscribeMeeting, markOnline, markOffline } from "@/lib/events";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  // sprawdzenie dostępu: operator widzi wszystko; uczestnik tylko swoje posiedzenia
  if (session.user.role === "PARTICIPANT") {
    const allowed = await prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId: session.user.id } },
    });
    if (!allowed) return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller już zamknięty (klient się rozłączył) - sprzątamy i przestajemy.
          closed = true;
          cleanup();
        }
      };
      const send = (data: object) => safeEnqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Rejestr obecności online: oznacz przy połączeniu i odświeżaj heartbeatem.
      const uid = session.user.id;
      markOnline(id, uid);
      const presenceTimer = setInterval(() => { if (!closed) markOnline(id, uid); }, 10_000);

      // heartbeat co 25s przeciw odcięciu przez proxy
      const interval = setInterval(() => safeEnqueue(encoder.encode(`: ping\n\n`)), 25_000);

      const unsubscribe = subscribeMeeting(id, send);

      cleanup = () => {
        if (closed) { clearInterval(interval); clearInterval(presenceTimer); markOffline(id, uid); unsubscribe(); return; }
        closed = true;
        clearInterval(interval);
        clearInterval(presenceTimer);
        markOffline(id, uid);
        unsubscribe();
        try { controller.close(); } catch { /* już zamknięty */ }
      };

      send({ type: "connected" });
    },
    cancel() {
      // Klient się rozłączył - zatrzymaj heartbeat i subskrypcję.
      closed = true;
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
