import { router } from 'expo-router'
import { useState } from 'react'
import { useHabitStatisticsQuery } from '../../../application/habit-queries'
import type { DashboardHabit } from '../../../domain/models'

function useWaterCard({ item }: { item?: DashboardHabit }) {
  const [period, setPeriod] = useState<7 | 30>(7)
  const stats = useHabitStatisticsQuery(item?.habit.id, !!item)
  const dates = Array.from({ length: period }, (_, index) => {
    const date = new Date(
      `${item?.local_date ?? new Date().toISOString().slice(0, 10)}T12:00:00Z`,
    )
    date.setUTCDate(date.getUTCDate() - period + 1 + index)
    return date.toISOString().slice(0, 10)
  })
  const progress = item
    ? Math.min(1, Math.max(0, item.progress / item.target))
    : 0
  const open = () =>
    item
      ? router.push({ pathname: '/habit/[id]', params: { id: item.habit.id } })
      : router.push('/new')
  return { period, setPeriod, stats, dates, progress, open }
}
export { useWaterCard }
export type WaterCardController = ReturnType<typeof useWaterCard>
