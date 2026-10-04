import { auth } from "@/lib/auth";
import { subscribeMeeting, markOnline, markOffline } from "@/lib/events";
import { prisma } from "@/lib/db";
import { acquireConnection, releaseConnection } from "@/lib/rateLimit";
import { checkSession } from "@/lib/sessions";

const MAX_STREAMS_PER_USER = 12;

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
  } else if (!(await prisma.meeting.findUnique({ where: { id }, select: { id: true } }))) {
    return new Response("Not found", { status: 404 });
  }

  // Limit równoczesnych połączeń na konto (kilka kart / urządzeń jest w porządku; setki - nie).
  const connKey = `sse:${session.user.id}`;
  if (!acquireConnection(connKey, MAX_STREAMS_PER_USER))
    return new Response("Zbyt wiele otwartych połączeń", { status: 429 });
  let released = false;
  const release = () => { if (!released) { released = true; releaseConnection(connKey); } };

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

      // heartbeat co 25s przeciw odcięciu przez proxy; przy okazji sprawdzenie, czy sesja nadal
      // jest ważna (wylogowanie, dezaktywacja) - wtedy zamykamy strumień. Heartbeat NIE jest
      // aktywnością użytkownika (nie przedłuża limitu bezczynności).
      const interval = setInterval(() => {
        safeEnqueue(encoder.encode(`: ping\n\n`));
        checkSession(session.sid).then((ok) => { if (!ok) cleanup(); }).catch(() => {});
      }, 25_000);

      const unsubscribe = subscribeMeeting(id, send);

      cleanup = () => {
        release();
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
