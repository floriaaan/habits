import { shiftDay } from '../../../domain/calendar'
import type { HabitStatistics } from '../../../domain/models'

export function activityDays(stats: HabitStatistics, count: number) {
  const indexed = new Map(stats.heatmap.map((day) => [day.date, day]))
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDay(stats.through, i - count + 1),
      day = indexed.get(date)
    return { date, value: day?.eligible ? day.progress : null }
  })
}
