import { useState } from 'react'
import { useDashboardQuery } from '../../../application/habit-queries'
import { useApp } from '../../../application/providers'
import type { Category } from '../../../domain/models'

export function useHomeController() {
  const { runtime, session } = useApp()
  const allowed =
    session!.scopes.includes('habits:read') &&
    session!.scopes.includes('statistics:read')
  const query = useDashboardQuery(allowed)
  const [category, setCategory] = useState<Category | null>(null),
    [page, setPage] = useState(0)
  const data = query.data,
    all = data?.groups.flatMap((group) => group.habits) ?? [],
    filtered = all.filter(
      (item) => category === null || item.habit.category === category,
    )
  const count = Math.ceil(filtered.length / 3),
    currentPage = Math.min(page, Math.max(0, count - 1)),
    visible = filtered.slice(currentPage * 3, currentPage * 3 + 3)
  const water = all.find(
    (item) =>
      item.presentation.illustration === 'water' ||
      item.habit.unit === 'milliliters',
  )
  return {
    allowed,
    query,
    category,
    setCategory,
    setPage,
    data,
    all,
    count,
    currentPage,
    visible,
    water,
    isDemo: !!runtime.fake,
    canWrite: !!session?.scopes.includes('habits:write'),
  }
}
export type HomeController = ReturnType<typeof useHomeController>
