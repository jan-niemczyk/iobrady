import { prisma } from "@/lib/db";
import { EMPTY_CONTENT, meetingNumberValue, normalizeContent, plDate, plTime, toRoman, type NoticeAgendaItem, type NoticeContent } from "@/lib/noticeText";

/** Zawiadomienia - funkcje serwera wspólne dla API i stron. */

export function agendaFromMeeting(items: { id: string; number: string; title: string; isSubItem: boolean; unnumbered: boolean }[]): NoticeAgendaItem[] {
  return items.map((a) => ({ key: a.id, number: a.unnumbered ? "" : a.number, title: a.title, level: a.isSubItem ? 1 : 0, unnumbered: a.unnumbered }));
}

export async function meetingAgendaForNotice(meetingId: string) {
  const items = await prisma.agendaItem.findMany({ where: { meetingId, hiddenFromDisplay: false }, orderBy: { order: "asc" }, select: { id: true, number: true, title: true, isSubItem: true, unnumbered: true } });
  return agendaFromMeeting(items);
}

/** Różnice między porządkiem w zawiadomieniu a porządkiem posiedzenia (porównanie po treści). */
export function agendaDiff(notice: NoticeAgendaItem[], meeting: NoticeAgendaItem[]) {
  const key = (a: NoticeAgendaItem) => `${a.number}|${a.title.trim()}`;
  const n = new Set(notice.map(key)), m = new Set(meeting.map(key));
  return {
    onlyInMeeting: meeting.filter((a) => !n.has(key(a))),
    onlyInNotice: notice.filter((a) => !m.has(key(a))),
    same: notice.length === meeting.length && notice.every((a, i) => key(a) === key(meeting[i])),
  };
}

/** Wartości znaczników dla posiedzenia (adresat i zwrot dochodzą przy dokumencie spersonalizowanym). */
export async function noticeValues(meetingId: string, content: NoticeContent): Promise<Record<string, string>> {
  const [m, s] = await Promise.all([
    prisma.meeting.findUnique({ where: { id: meetingId }, select: { name: true, number: true, scheduledAt: true, location: true, orgUnits: { select: { orgUnit: { select: { name: true } } } } } }),
    prisma.settings.findUnique({ where: { id: "singleton" }, select: { organizationName: true } }),
  ]);
  if (!m) return {};
  const num = meetingNumberValue(m.number);
  const letter = content.letterDate && /^\d{4}-\d{2}-\d{2}$/.test(content.letterDate) ? new Date(`${content.letterDate}T12:00:00Z`) : null;
  return {
    organ: m.orgUnits.length ? m.orgUnits.map((o) => o.orgUnit.name).join(", ") : (s?.organizationName ?? ""),
    nazwa_posiedzenia: m.name,
    numer_posiedzenia: content.meetingNumberFormat === "roman" && num ? toRoman(num) : content.meetingNumberFormat === "arabic" && num ? String(num) : m.number,
    numer_posiedzenia_rzymski: num ? toRoman(num) : "",
    numer_posiedzenia_arabski: num ? String(num) : "",
    data_posiedzenia: plDate(m.scheduledAt),
    godzina: plTime(m.scheduledAt),
    miejsce: m.location ?? "",
    podpisujacy: content.signer,
    data_pisma: letter ? plDate(letter) : "",
    miejscowosc: content.place,
  };
}

/** Domyślny szablon dla posiedzenia: domyślny szablon jego grupy, a gdy brak - domyślny jednostki. */
export async function defaultTemplateFor(meetingId: string) {
  const units = (await prisma.meetingOrgUnit.findMany({ where: { meetingId }, select: { orgUnitId: true } })).map((u) => u.orgUnitId);
  return (units.length ? await prisma.noticeTemplate.findFirst({ where: { active: true, isDefault: true, orgUnitId: { in: units } } }) : null)
    ?? await prisma.noticeTemplate.findFirst({ where: { active: true, isDefault: true, orgUnitId: null } });
}

export function contentFromTemplate(raw: unknown): NoticeContent {
  const c = normalizeContent(raw);
  const today = new Date().toISOString().slice(0, 10);
  return { ...c, letterDate: today };
}

export { EMPTY_CONTENT };
