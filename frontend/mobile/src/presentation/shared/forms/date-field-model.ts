import { calendarDate, validRestDate, weekDays } from '../../../domain/calendar'

export function nativePickerValue(
  value: string,
  instant = false,
  now = new Date(),
) {
  const parsed = instant
    ? new Date(value)
    : validRestDate(value)
      ? new Date(value + 'T12:00:00Z')
      : new Date(NaN)
  return Number.isFinite(parsed.getTime())
    ? parsed
    : instant
      ? now
      : new Date(calendarDate('UTC', now) + 'T12:00:00Z')
}
export function nativePickerOutput(value: Date, instant = false) {
  return instant ? value.toISOString() : calendarDate('UTC', value)
}
export function weekLabel(anchor: string) {
  const dates = weekDays(anchor).filter(validRestDate)
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const first = dates[0]!,
    last = dates[dates.length - 1]!
  const startLabel =
    first.slice(0, 7) === last.slice(0, 7)
      ? String(Number(first.slice(-2)))
      : formatter.format(new Date(first + 'T12:00:00Z'))
  return `${startLabel} – ${formatter.format(new Date(last + 'T12:00:00Z'))}`
}
