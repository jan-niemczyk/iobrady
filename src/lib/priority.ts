/**
 * Czy prawo priorytetu uczestnika obejmuje dany punkt porządku obrad.
 * Ta sama reguła co przy zapisie (api/speakerlists/[id]/entries): brak wskazanych punktów =
 * prawo globalne; w przeciwnym razie tylko we wskazanych punktach.
 */
export function priorityAppliesTo(
  mp: { hasPriorityRight: boolean; priorityAgendaItemId: string | null; priorityAgendaItemIds?: string[] | null },
  agendaItemId: string | null,
): boolean {
  if (!mp.hasPriorityRight) return false;
  const ids = mp.priorityAgendaItemIds ?? [];
  if (ids.length === 0 && mp.priorityAgendaItemId == null) return true;
  if (agendaItemId == null) return false;
  return mp.priorityAgendaItemId === agendaItemId || ids.includes(agendaItemId);
}
