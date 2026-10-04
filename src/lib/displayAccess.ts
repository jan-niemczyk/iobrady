import { randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

/**
 * Dostęp do ekranu prezentacji i transmisji (SA-07).
 *
 * Ekran sali i nakładka OBS nie mają sesji - dostęp daje TOKEN EKRANU (Meeting.displayToken)
 * zawarty w linku `/display/<id>?t=<token>` / `/overlay/<id>?t=<token>`. Middleware zapisuje go
 * w ciasteczku `iob_dt_<id>` (HttpOnly), dzięki czemu klient prezentacji pobiera dane i osadza
 * ekran w nakładce bez zmian w kodzie ekranów. Bez tokenu dostęp mają tylko zalogowany operator
 * oraz uczestnik tego posiedzenia. Operator może wygenerować nowy token (stare linki przestają działać).
 */
export const displayCookieName = (meetingId: string) => `iob_dt_${meetingId.replace(/[^A-Za-z0-9_-]/g, "")}`;

export function newDisplayToken(): string {
  return randomBytes(18).toString("base64url");
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Zapewnia token ekranu (posiedzenia sprzed migracji / nowe). */
export async function ensureDisplayToken(meetingId: string): Promise<string | null> {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { displayToken: true } });
  if (!m) return null;
  if (m.displayToken) return m.displayToken;
  const token = newDisplayToken();
  await prisma.meeting.updateMany({ where: { id: meetingId, displayToken: null }, data: { displayToken: token } });
  return (await prisma.meeting.findUnique({ where: { id: meetingId }, select: { displayToken: true } }))?.displayToken ?? token;
}

/** Czy żądający może widzieć dane prezentacji posiedzenia. */
export async function canViewDisplay(meetingId: string, presentedToken: string | null | undefined): Promise<boolean> {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { displayToken: true } });
  if (!m) return false;
  if (presentedToken && m.displayToken && sameToken(presentedToken, m.displayToken)) return true;
  const session = await auth();
  if (!session) return false;
  if (session.user.role === "OPERATOR") return true;
  const mp = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId: session.user.id } },
    select: { id: true },
  });
  return !!mp;
}

/** Token z parametru `t` albo z ciasteczka ekranu. */
export function presentedDisplayToken(url: URL, cookieHeader: string | null, meetingId: string): string | null {
  const t = url.searchParams.get("t");
  if (t) return t;
  const name = displayCookieName(meetingId);
  for (const part of (cookieHeader ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
