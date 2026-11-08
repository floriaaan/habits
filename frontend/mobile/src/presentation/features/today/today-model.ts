import type { JournalHistory } from '../../../application/journal'
import { shiftDay } from '../../../domain/calendar'
import type { DashboardHabit, Entry } from '../../../domain/models'

export function weekDays(date: string) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay()
  const monday = shiftDay(date, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))
}
export function swipedDay(
  date: string,
  earliest: string,
  latest: string,
  dx: number,
  dy: number,
) {
  if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy) * 1.5) return null
  const next = shiftDay(date, dx < 0 ? 1 : -1)
  return next < earliest || next > latest ? null : next
}
export function journalDay(history: JournalHistory[], date: string) {
  const items: DashboardHabit[] = [],
    unavailable: string[] = []
  const events: { entry: Entry; item: DashboardHabit }[] = []
  for (const record of history) {
    const definition = record.versions
      .filter((v) => v.effective_from <= date)
      .sort((a, b) =>
        b.effective_from.localeCompare(a.effective_from),
      )[0]?.definition
    let item: DashboardHabit | undefined
    if (record.item.local_date === date) item = record.item
    else if (definition) {
      const day = record.statistics.heatmap.find((d) => d.date === date)
      const period =
        day &&
        record.statistics.periods.find((p) => p.start === day.period_start)
      const oldestDay = record.statistics.heatmap.map((d) => d.date).sort()[0]
      const firstVersion = record.versions
        .map((v) => v.effective_from)
        .sort()[0]
      // A retained weekly period may begin before the 90-day heatmap. Never
      // present a partial sum as the actual historical progress.
      const covered =
        period &&
        oldestDay &&
        (period.start >= oldestDay ||
          (!!firstVersion && firstVersion >= oldestDay))
      if (day && period && covered) {
        const progress = record.statistics.heatmap
          .filter((d) => d.date >= period.start && d.date <= date && d.eligible)
          .reduce((sum, d) => sum + d.progress, 0)
        item = {
          ...record.item,
          habit: { ...record.item.habit, ...definition },
          local_date: date,
          eligible: day.eligible,
          actionable: false,
          progress,
          target: period.target,
          percent: day.eligible
            ? Math.min(100, (progress / period.target) * 100)
            : null,
          completed: day.eligible && progress >= period.target,
        }
      } else unavailable.push(record.item.habit.name)
    }
    if (item) items.push(item)
    for (const entry of record.entries.filter((e) => e.local_date === date)) {
      // Historical units and names must not be inferred from today's definition.
      if (item || definition)
        events.push({
          entry,
          item: item ?? {
            ...record.item,
            habit: { ...record.item.habit, ...definition! },
          },
        })
    }
  }
  events.sort(
    (a, b) =>
      Date.parse(a.entry.occurred_at) - Date.parse(b.entry.occurred_at) ||
      a.entry.id.localeCompare(b.entry.id),
  )
  return { items, events, unavailable }
}
