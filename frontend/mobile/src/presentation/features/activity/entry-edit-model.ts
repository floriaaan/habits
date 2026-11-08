import type { Entry, Habit, NewEntry, Unit } from '../../../domain/models'

export const entryUnits: Record<Unit, { label: string; factor: number }> = {
  meters: { label: 'km', factor: 1000 },
  milliliters: { label: 'L', factor: 1000 },
  seconds: { label: 'min', factor: 60 },
  count: { label: 'fois', factor: 1 },
}
export function entryClock(instant: string | number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const part = (name: string) => parts.find((p) => p.type === name)!.value
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
    seconds: part('second'),
  }
}
export function entryDraft(entry: Entry, habit: Habit) {
  const { date, time } = entryClock(entry.occurred_at, habit.timezone)
  return {
    date,
    time,
    value: String(entry.value / entryUnits[habit.unit].factor).replace(
      '.',
      ',',
    ),
  }
}
export type EntryDraft = ReturnType<typeof entryDraft>

export function buildEntryEdit(
  entry: Entry,
  habit: Habit,
  draft: EntryDraft,
  now = Date.now(),
): NewEntry {
  const original = entryDraft(entry, habit)
  const value = ['boolean', 'frequency'].includes(habit.kind)
    ? 1
    : draft.value === original.value
      ? entry.value
      : Number(draft.value.trim().replace(',', '.')) *
        entryUnits[habit.unit].factor
  if (!Number.isFinite(value) || value <= 0 || value > 1e12)
    throw new Error(
      'Saisissez une valeur positive, au plus égale à 1 000 milliards.',
    )
  let occurred_at = entry.occurred_at
  if (draft.date !== original.date || draft.time !== original.time) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)
    )
      throw new Error('Choisissez une date et une heure valide (HH:MM).')
    const wall = Date.parse(`${draft.date}T${draft.time}:00Z`)
    if (
      !Number.isFinite(wall) ||
      new Date(wall).toISOString().slice(0, 10) !== draft.date
    )
      throw new Error('Cette date est invalide.')
    // Sample offsets on both sides of a clock change; verify every candidate by round-trip.
    const offsets = new Set<number>()
    for (const hours of [-48, -24, 0, 24, 48]) {
      const probe = wall + hours * 3600000
      const local = entryClock(probe, habit.timezone)
      offsets.add(
        Date.parse(`${local.date}T${local.time}:${local.seconds}Z`) - probe,
      )
    }
    const candidates = [...offsets]
      .map((offset) => wall - offset)
      .filter((instant) => {
        const local = entryClock(instant, habit.timezone)
        return local.date === draft.date && local.time === draft.time
      })
    if (!candidates.length)
      throw new Error(
        'Cette heure n’existe pas dans le fuseau de l’habitude. Choisissez une autre heure.',
      )
    if (candidates.length > 1)
      throw new Error(
        'Cette heure est ambiguë lors du changement d’heure. Choisissez une autre heure.',
      )
    occurred_at = new Date(candidates[0]!).toISOString()
  }
  if (Date.parse(occurred_at) < 0 || Date.parse(occurred_at) > now)
    throw new Error(
      'La saisie doit se situer entre le 1er janvier 1970 et maintenant.',
    )
  return { value, occurred_at }
}

export function entryWriteAttempt(
  previous: { intent: string; key: string } | null,
  intent: string,
  createKey: () => string,
) {
  return previous?.intent === intent ? previous : { intent, key: createKey() }
}
