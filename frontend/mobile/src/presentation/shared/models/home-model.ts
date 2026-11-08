import type {
  Dashboard,
  DashboardDay,
  DashboardHabit,
} from '../../../domain/models'

export const categories = {
  sport: 'Sport',
  mind: 'Esprit',
  daily: 'Quotidien',
  nutrition: 'Alimentation',
} as const
export const percent = (value: number | null | undefined) =>
  value == null ? '—' : `${Math.round(value)}\u00a0%`
const number = (value: number) =>
  value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
export function amount(value: number, unit: string) {
  return unit === 'milliliters'
    ? `${number(value / 1000)} L`
    : unit === 'meters'
      ? `${number(value / 1000)} km`
      : unit === 'seconds'
        ? `${number(value / 60)} min`
        : number(value)
}
export function habitProgress(item: DashboardHabit) {
  if (!item.eligible) return 'Jour de repos'
  return `${amount(item.progress, item.habit.unit)} / ${amount(item.target, item.habit.unit)}${item.habit.unit === 'count' ? ' fois' : ''}`
}
export function history(dashboard: Dashboard, count = 7): DashboardDay[] {
  const days = new Map(
    [
      ...dashboard.weekly.previous,
      ...dashboard.weekly.current,
      ...dashboard.heatmap,
    ].map((day) => [day.date, day]),
  )
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${dashboard.date}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() - count + 1 + index)
    const key = date.toISOString().slice(0, 10)
    return (
      days.get(key) ?? {
        date: key,
        percent: key === dashboard.date ? dashboard.global_percent : null,
        completed: 0,
        eligible: 0,
      }
    )
  })
}
export function dailyDelta(dashboard: Dashboard) {
  const yesterday = history(dashboard, 2)[0]?.percent
  return yesterday == null || dashboard.global_percent == null
    ? null
    : Math.round(dashboard.global_percent - yesterday)
}
