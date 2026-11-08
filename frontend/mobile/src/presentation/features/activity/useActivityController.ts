import { randomUUID } from 'expo-crypto'
import { useRef, useState } from 'react'
import {
  useDashboardQuery,
  useHabitStatisticsQuery,
} from '../../../application/habit-queries'
import { allPages } from '../../../application/pagination'
import { useApp } from '../../../application/providers'
import { useDomainQuery, useOperation } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import type { HabitAction } from '../../../domain/models'
import { smoothLinePaths } from '../../shared/charts/chart-model'
import { activityDays } from './activity-model'

export function useActivityController(id: string) {
  const { runtime, session } = useApp()
  const query = useDashboardQuery(
    !!session?.scopes.includes('habits:read') &&
      !!session?.scopes.includes('statistics:read'),
  )
  const item = query.data?.groups
    .flatMap((group) => group.habits)
    .find((item) => item.habit.id === id)
  const statistics = useHabitStatisticsQuery(
    id,
    !!item && !!session?.scopes.includes('statistics:read'),
  )
  const entries = useDomainQuery(
    'entries',
    [id, 'recent'],
    async (c, o) => ({
      items: await allPages(
        async (page) => (await c.listEntries(id, page, o)).items,
        o,
      ),
    }),
    !!item && !!session?.scopes.includes('entries:read'),
  )
  const mutation = useOperation(),
    keys = useRef(new Map<string, string>()),
    sending = useRef(false),
    timestamps = useRef(new Map<string, string>())
  const [value, setValue] = useState(''),
    [notice, setNotice] = useState(''),
    [editing, setEditing] = useState(false),
    [period, setPeriod] = useState<7 | 30>(7)
  async function action(action: HabitAction | 'entry', value?: number) {
    if (
      sending.current ||
      !item?.actionable ||
      !session?.scopes.includes('entries:write')
    )
      return false
    sending.current = true
    const intent = JSON.stringify([id, action, value]),
      key = keys.current.get(intent) ?? randomUUID()
    keys.current.set(intent, key)
    setNotice('')
    const occurredAt = timestamps.current.get(key) ?? new Date().toISOString()
    timestamps.current.set(key, occurredAt)
    try {
      await mutation.mutateAsync({
        run: () =>
          action === 'entry'
            ? runtime.connector.recordEntry(
                id,
                { occurred_at: occurredAt, value: value! },
                { key },
              )
            : runtime.connector.habitAction(
                id,
                { action, ...(value === undefined ? {} : { value }) },
                { key },
              ),
        resources: [
          'dashboard',
          'habits',
          'entries',
          'statistics',
          'gamification',
        ],
      })
      keys.current.delete(intent)
      timestamps.current.delete(key)
      return true
    } catch (e) {
      setNotice(errorMessage(e))
      return false
    } finally {
      sending.current = false
    }
  }
  const blocked =
    mutation.isPending ||
    !item?.actionable ||
    !session?.scopes.includes('entries:write')
  const days = statistics.data ? activityDays(statistics.data, period) : [],
    maximum = Math.max(1, ...days.map((day) => day.value ?? 0))
  const total = days.reduce((sum, day) => sum + (day.value ?? 0), 0),
    paths = smoothLinePaths(
      days.map((day) =>
        day.value === null ? null : (day.value / maximum) * 100,
      ),
    )
  const step = item?.presentation.step ?? 1,
    numeric = Number(value.replace(',', '.'))
  const finishAction = () => {
    setValue('')
    setEditing(false)
  }
  return {
    finishAction,
    query,
    item,
    statistics,
    entries,
    mutation,
    value,
    setValue,
    notice,
    editing,
    setEditing,
    period,
    setPeriod,
    blocked,
    days,
    maximum,
    total,
    paths,
    step,
    numeric,
    action,
  }
}
export type ActivityController = ReturnType<typeof useActivityController>
