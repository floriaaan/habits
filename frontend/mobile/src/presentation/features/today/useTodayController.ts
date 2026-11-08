import { router } from 'expo-router'
import { usePrepareNativeTabMotion } from '../../shared/motion/TabCardMotion'
import { randomUUID } from 'expo-crypto'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  PanResponder,
} from 'react-native'
import { useDashboardQuery } from '../../../application/habit-queries'
import { loadJournal } from '../../../application/journal'
import { useApp } from '../../../application/providers'
import { useDomainQuery, useOperation } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import { shiftDay } from '../../../domain/calendar'
import type { DashboardHabit } from '../../../domain/models'
import { journalDay, swipedDay } from './today-model'

export function useTodayController() {
  const { runtime, session } = useApp()
  const prepare = usePrepareNativeTabMotion()
  const canManageRest = !!session?.scopes.includes('habits:write')
  const canRead =
    !!session?.scopes.includes('habits:read') &&
    !!session?.scopes.includes('statistics:read') &&
    !!session?.scopes.includes('entries:read')
  const dashboard = useDashboardQuery(canRead)
  const [selection, setSelection] = useState<string | null>(null),
    [week, setWeek] = useState<string | null>(null),
    [notice, setNotice] = useState('')
  const today = dashboard.data?.date,
    selected = selection ?? today,
    anchor = week ?? selected
  const history = useDomainQuery(
    'entries',
    ['journal', dashboard.data?.date, dashboard.data?.revision],
    (c, o) =>
      loadJournal(
        c,
        dashboard.data!.groups.flatMap((g) => g.habits),
        o,
      ),
    canRead && !!dashboard.data,
    { retainPreviousRevision: true }, // Keep the journal mounted during refresh.
  )
  const day =
    selected && history.data ? journalDay(history.data, selected) : null
  const [restRemoving, setRestRemoving] = useState<string | null>(null)
  const [restCommitted, setRestCommitted] = useState(false)
  const [restFeedback, setRestFeedback] = useState<DashboardHabit | null>(null)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const pending =
    day?.items.filter(
      (item) =>
        item.eligible && (!item.completed || item.habit.id === feedbackId),
    ) ?? []
  const eligible = day?.items.filter((item) => item.eligible) ?? []
  const completed = eligible.filter((item) => item.completed).length
  const historical = selected !== today
  const mutation = useOperation(),
    writing = useRef(false),
    keys = useRef(new Map<string, string>())
  const earliest = today ? shiftDay(today, -89) : ''
  const error = dashboard.error ?? history.error
  const [reduceMotion, setReduceMotion] = useState(true)
  const transition = useRef(new Animated.Value(1)).current
  const direction = useRef(1),
    previousDate = useRef(selected)
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value)
      })
      .catch(() => {})
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    )
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])
  useEffect(() => {
    transition.stopAnimation()
    const changed = previousDate.current && selected !== previousDate.current
    previousDate.current = selected
    if (!changed || reduceMotion) {
      transition.setValue(1)
      return
    }
    transition.setValue(0)
    const animation = Animated.timing(transition, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [selected, reduceMotion, transition])
  function choose(date: string) {
    if (writing.current) return
    setFeedbackId(null)
    direction.current = selected && date < selected ? -1 : 1
    setSelection(date)
    setNotice('')
  }
  const gestures = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !!selected &&
          !!today &&
          !writing.current &&
          gesture.numberActiveTouches === 1 &&
          Math.abs(gesture.dx) > 16 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_, gesture) => {
          if (!selected || !today || writing.current) return
          const date = swipedDay(
            selected,
            earliest,
            today,
            gesture.dx,
            gesture.dy,
          )
          if (date) {
            setWeek(date)
            choose(date)
          }
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [selected, today, earliest],
  )
  async function refresh() {
    if (!canRead) return
    await dashboard.refetch()
    if (dashboard.data) await history.refetch()
  }
  async function quickAction(item: DashboardHabit) {
    if (
      writing.current ||
      historical ||
      !item.actionable ||
      item.local_date !== selected ||
      !session?.scopes.includes('entries:write')
    )
      return false
    writing.current = true
    setFeedbackId(item.habit.id)
    setNotice('')
    const action = item.habit.kind === 'boolean' ? 'complete' : 'increment'
    const intent = JSON.stringify([item.habit.id, action, selected]),
      key = keys.current.get(intent) ?? randomUUID()
    keys.current.set(intent, key)
    try {
      await mutation.mutateAsync({
        run: async () => {
          const current = await runtime.connector.getDashboard()
          const fresh = current.groups
            .flatMap((group) => group.habits)
            .find((h) => h.habit.id === item.habit.id)
          if (
            current.date !== selected ||
            fresh?.local_date !== selected ||
            !fresh.actionable
          )
            throw new Error(
              'La journée ou cette habitude a changé. Actualisez avant de réessayer.',
            )
          return runtime.connector.habitAction(
            item.habit.id,
            { action },
            { key },
          )
        },
        resources: ['dashboard', 'entries', 'statistics', 'gamification'],
      })
      keys.current.delete(intent)
      return true
    } catch (e) {
      setNotice(errorMessage(e))
      return false
    } finally {
      writing.current = false
    }
  }
  function openRest(item: DashboardHabit) {
    if (writing.current || !canManageRest || !selected) return
    prepare(`/rest/${item.habit.id}`, '/today')
    router.push({
      pathname: '/rest/[id]',
      params: { id: item.habit.id, date: selected, from: 'today' },
    })
  }
  function openHabitMenu(item: DashboardHabit) {
    if (writing.current) return
    Alert.alert(item.habit.name, undefined, [
      {
        text: 'Ouvrir l’habitude',
        onPress: () => {
          prepare(`/habit/${item.habit.id}`, '/today')
          router.push({
            pathname: '/habit/[id]',
            params: { id: item.habit.id },
          })
        },
      },
      ...(canManageRest
        ? [{ text: 'Repos ce jour', onPress: () => openRest(item) }]
        : []),
      { text: 'Annuler', style: 'cancel' },
    ])
  }
  async function removeRest(item: DashboardHabit) {
    if (writing.current || !canManageRest || !selected) return false
    writing.current = true
    setRestCommitted(false)
    setRestRemoving(item.habit.id)
    setRestFeedback(item)
    setNotice('')
    let success = false
    try {
      await mutation.mutateAsync({
        run: () => runtime.connector.removeRest(item.habit.id, selected),
        resources: [
          'habits',
          'dashboard',
          'entries',
          'statistics',
          'gamification',
        ],
      })
      success = true
      setRestCommitted(true)
      return true
    } catch (e) {
      setNotice(errorMessage(e))
      return false
    } finally {
      if (!success) {
        writing.current = false
        setRestRemoving(null)
        setRestFeedback(null)
      }
    }
  }
  function finishRemoveRest() {
    writing.current = false
    setRestRemoving(null)
    setRestFeedback(null)
    setRestCommitted(false)
  }
  // A refetch error may unmount the button before its feedback finishes.
  // Releasing the write lock belongs to the controller, not the button lifetime.
  useEffect(() => {
    if (!restCommitted) return
    const timer = setTimeout(finishRemoveRest, 900)
    return () => clearTimeout(timer)
  }, [restCommitted])
  const resting = [...(day?.resting ?? [])]
  if (
    restFeedback &&
    restFeedback.local_date === selected &&
    !resting.some((i) => i.habit.id === restFeedback.habit.id)
  )
    resting.push(restFeedback)
  const blocked =
    historical ||
    !!restRemoving ||
    mutation.isPending ||
    !!error ||
    !session?.scopes.includes('entries:write')
  return {
    canManageRest,
    openHabitMenu,
    resting,
    removeRest,
    finishRemoveRest,
    restRemoving,
    finishQuickAction: () => setFeedbackId(null),
    isDemo: !!runtime.fake,
    canCreate: !!session?.scopes.includes('habits:write'),
    canWrite: !!session?.scopes.includes('entries:write'),
    canRead,
    dashboard,
    selected,
    anchor,
    history,
    day,
    pending,
    eligible,
    completed,
    historical,
    earliest,
    error,
    transition,
    direction,
    choose,
    setWeek,
    gestures,
    refresh,
    quickAction,
    blocked,
    today,
    notice,
  }
}
export type TodayController = ReturnType<typeof useTodayController>
