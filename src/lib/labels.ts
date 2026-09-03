import { MeetingStatus, VoteStatus, AttendanceStatus, AgendaItemStatus, SpeakerStatus } from "@prisma/client";

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  DRAFT: "Projekt",
  PREPARED: "Przygotowane",
  OPEN: "Otwarte",
  IN_PROGRESS: "W toku",
  PAUSED: "Przerwane",
  CLOSED: "Zakończone",
  ARCHIVED: "Zarchiwizowane",
  CANCELLED: "Anulowane",
};

export const VOTE_STATUS_LABEL: Record<VoteStatus, string> = {
  DRAFT: "Projekt",
  READY: "Przygotowane",
  OPEN: "Trwa głosowanie",
  CLOSED: "Zakończone",
  CANCELLED: "Anulowane",
  INTERRUPTED: "Przerwane",
  IRRELEVANT: "Bezprzedmiotowe",
};

export const AGENDA_ITEM_STATUS_LABEL: Record<AgendaItemStatus, string> = {
  PENDING: "Oczekuje",
  CURRENT: "Rozpatrywany",
  PAUSED: "Zawieszony",
  COMPLETED: "Zakończony",
  SKIPPED: "Pominięty",
};

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Obecny",
  ABSENT: "Nieobecny",
};

export const SPEAKER_STATUS_LABEL: Record<SpeakerStatus, string> = {
  WAITING: "Oczekuje",
  SPEAKING: "Przemawia",
  FINISHED: "Zakończył wystąpienie",
  WITHDRAWN: "Wycofany",
};

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
}

/**
 * Konwersja stringa z <input type="datetime-local"> ("2025-11-20T18:00")
 * na ISO string interpretując wejście jako czas warszawski.
 *
 * Standardowe `new Date(str)` jest niejednoznaczne: w przeglądarce zwykle interpretuje
 * jako czas lokalny (OK dla użytkownika z Polski), ale w Node z TZ=UTC daje UTC →
 * przesunięcie o 1-2h. Ta funkcja zawsze interpretuje jako Europe/Warsaw, więc
 * działa identycznie po stronie SSR i klienta, niezależnie od TZ kontenera.
 */
export function localInputToWarsawISO(input: string): string {
  // input: "YYYY-MM-DDTHH:mm" lub "YYYY-MM-DDTHH:mm:ss"
  // tworzymy Date z UTC i potem korygujemy o offset Warszawy w tym momencie.
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return new Date(input).toISOString();
  const [, y, mo, d, h, mi, s] = m;
  // Najpierw konstruujemy Date UDAJĄC że podany czas to UTC
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  // Sprawdzamy ile by ten moment pokazywał w Warszawie:
  const inWarsaw = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(asUtc));
  const get = (t: string) => inWarsaw.find((p) => p.type === t)?.value ?? "0";
  // Warszawski H:M dla naszego "udanego UTC"
  const warsawAsMs = Date.UTC(+get("year"), +get("month") - 1, +get("day"),
    +get("hour"), +get("minute"), +get("second"));
  // Offset = ile godzin trzeba przesunąć żeby z UTC dostać Warszawę
  const offsetMs = warsawAsMs - asUtc;
  // Faktyczny moment UTC odpowiadający podanemu czasowi warszawskiemu:
  return new Date(asUtc - offsetMs).toISOString();
}
