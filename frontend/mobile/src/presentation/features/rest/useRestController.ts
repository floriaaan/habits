import { useCallback, useRef, useState } from 'react'
import { BackHandler } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { allPages } from '../../../application/pagination'
import { useApp } from '../../../application/providers'
import { useDomainQuery, useOperation } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import { calendarDate, validRestDate } from '../../../domain/calendar'
import type { Habit, RestException } from '../../../domain/models'
import { usePrepareNativeTabMotion } from '../../shared/motion/TabCardMotion'

export function useRestQuery(id: string) {
  const { session } = useApp()
  const canRead = !!session?.scopes.includes('habits:read')
  const query = useDomainQuery(
    'habits',
    [id, 'rests-editor'],
    async (c, o) => {
      const [habit, rests] = await Promise.all([
        c.getHabit(id, o),
        allPages((p) => c.getRests(id, p, o), o),
      ])
      return { habit, rests }
    },
    canRead,
  )
  return { query, canRead }
}
export function useRestController(
  initial: { habit: Habit; rests: RestException[] },
  selected: string | undefined,
  fromToday: boolean,
) {
  const [snapshot] = useState(initial),
    { habit, rests } = snapshot
  const today = calendarDate(habit.timezone)
  const [date, setDate] = useState(
    selected && validRestDate(selected) ? selected : today,
  )
  const [work, setWork] = useState(false),
    [error, setError] = useState('')
  const writing = useRef(false),
    mutation = useOperation(),
    { runtime, session } = useApp()
  const prepare = usePrepareNativeTabMotion(),
    screen = `/rest/${habit.id}` as const
  const resting = rests.some((rest) => rest.local_date === date)
  const canWrite =
    !!session?.scopes.includes('habits:write') && !habit.archived_at
  function back() {
    prepare(fromToday ? '/today' : `/habit/${habit.id}`, screen)
    if (router.canGoBack()) router.back()
    else if (fromToday) router.replace('/today')
    else router.replace({ pathname: '/habit/[id]', params: { id: habit.id } })
  }
  function close() {
    if (!writing.current && !work) back()
  }
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        close()
        return true
      })
      return () => listener.remove()
    }, [work]),
  )
  async function save() {
    if (writing.current || work || !canWrite) return false
    writing.current = true
    setWork(true)
    setError('')
    let success = false
    try {
      if (!validRestDate(date))
        throw new Error('Choisissez une date à partir du 1er janvier 1970.')
      await mutation.mutateAsync({
        run: () =>
          resting
            ? runtime.connector.removeRest(habit.id, date)
            : runtime.connector.setRest(habit.id, date),
        resources: [
          'habits',
          'dashboard',
          'entries',
          'statistics',
          'gamification',
        ],
      })
      success = true
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      writing.current = false
      if (!success) setWork(false)
    }
  }
  return {
    habit,
    date,
    today,
    resting,
    work,
    error,
    canWrite,
    close,
    save,
    finish: back,
    choose: (value: string) => {
      if (!work && !writing.current) {
        setDate(value)
        setError('')
      }
    },
  }
}
export type RestController = ReturnType<typeof useRestController>
