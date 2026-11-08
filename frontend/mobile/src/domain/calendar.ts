// Calendar-day arithmetic on ISO dates; independent of the device timezone.
export function shiftDay(date: string, days: number) {
  const value = new Date(date + 'T12:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function calendarDate(timezone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function weekDays(date: string) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay()
  const monday = shiftDay(date, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))
}
export function validRestDate(date: string) {
  const instant = Date.parse(date + 'T12:00:00Z')
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(instant) &&
    date >= '1970-01-01' &&
    date <= '9999-12-31' &&
    new Date(instant).toISOString().slice(0, 10) === date
  )
}
