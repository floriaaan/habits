import type { DashboardDay } from '../../../domain/models'
export function fullDays(days: readonly DashboardDay[]) {
  return days.filter(
    (day) => day.eligible > 0 && day.completed === day.eligible,
  ).length
}
export function dayLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric' },
) {
  return new Intl.DateTimeFormat('fr-FR', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'))
}
