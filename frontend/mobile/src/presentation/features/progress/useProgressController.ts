import { useIsFocused, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { ScrollView } from 'react-native'
import { useDashboardQuery } from '../../../application/habit-queries'
import { useApp } from '../../../application/providers'
import type { Category } from '../../../domain/models'
import { dailyDelta, history } from '../../shared/models/home-model'
import { dayLabel } from './progress-model'

export function useProgressController() {
  const { runtime, session } = useApp()
  const focused = useIsFocused(),
    { section } = useLocalSearchParams<{ section?: string }>()
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    anchored = useRef(false)
  const [regularityY, setRegularityY] = useState<number | null>(null)
  const [period, setPeriod] = useState<7 | 30>(7),
    [expanded, setExpanded] = useState<Category | null>(null)
  const allowed =
    !!session?.scopes.includes('statistics:read') &&
    !!session?.scopes.includes('habits:read')
  const query = useDashboardQuery(allowed)
  const data = query.data,
    days = data ? history(data, period) : [],
    delta = data ? dailyDelta(data) : null
  useEffect(() => {
    anchored.current = false
  }, [focused, section])
  useEffect(() => {
    if (
      !focused ||
      !data ||
      anchored.current ||
      (section === 'regularity' && regularityY === null)
    )
      return
    scroll.current?.scrollTo({
      y: section === 'regularity' ? Math.max(0, regularityY! - 6) : 0,
      animated: false,
    })
    anchored.current = true
  }, [focused, section, !!data, regularityY])
  const dateRange = days.length
    ? `${dayLabel(days[0]!.date, { day: 'numeric', month: 'short' })} – ${dayLabel(days.at(-1)!.date, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Vos objectifs au fil des jours'
  return {
    isDemo: !!runtime.fake,
    allowed,
    query,
    data,
    days,
    delta,
    dateRange,
    period,
    setPeriod,
    expanded,
    setExpanded,
    scroll,
    setRegularityY,
  }
}
export type ProgressController = ReturnType<typeof useProgressController>
