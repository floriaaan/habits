import { useCallback, useRef, useState } from 'react'
import { Alert, BackHandler } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { randomUUID } from 'expo-crypto'
import { useApp } from '../../../application/providers'
import { useOperation } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import type { Entry, Habit } from '../../../domain/models'
import { usePrepareNativeTabMotion } from '../../shared/motion/TabCardMotion'
import {
  buildEntryEdit,
  entryDraft,
  entryWriteAttempt,
  type EntryDraft,
} from './entry-edit-model'

export function useEditEntryController(
  initial: {
    entry: Entry
    habit: Habit
  },
  fromToday = false,
) {
  const [snapshot] = useState(initial),
    { entry, habit } = snapshot
  const [draft, setDraft] = useState(() => entryDraft(entry, habit))
  const [error, setError] = useState(''),
    [confirmation, setConfirmation] = useState(false)
  const [work, setWork] = useState<'save' | 'delete' | null>(null)
  const { runtime, session } = useApp(),
    mutation = useOperation()
  const sending = useRef(false),
    attempt = useRef<{ intent: string; key: string } | null>(null)
  const prepare = usePrepareNativeTabMotion(),
    screen = `/entry/${entry.id}` as const
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(entryDraft(entry, habit))
  const canWrite = !!session?.scopes.includes('entries:write')
  function back() {
    prepare(fromToday ? '/today' : `/habit/${habit.id}`, screen)
    if (router.canGoBack()) router.back()
    else if (fromToday) router.replace('/today')
    else router.replace({ pathname: '/habit/[id]', params: { id: habit.id } })
  }
  function close() {
    if (sending.current || work) return
    if (confirmation) {
      setConfirmation(false)
      return
    }
    if (dirty)
      Alert.alert(
        'Abandonner les modifications ?',
        'Votre saisie restera inchangée.',
        [
          { text: 'Continuer', style: 'cancel' },
          { text: 'Abandonner', style: 'destructive', onPress: back },
        ],
      )
    else back()
  }
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          close()
          return true
        },
      )
      return () => subscription.remove()
    }, [dirty, confirmation, work]),
  )
  async function submit(kind: 'save' | 'delete') {
    if (sending.current || work || !canWrite) return false
    sending.current = true
    setWork(kind)
    setError('')
    let success = false
    try {
      const input = kind === 'save' ? buildEntryEdit(entry, habit, draft) : null
      const intent = JSON.stringify([kind, input]),
        current = entryWriteAttempt(attempt.current, intent, randomUUID)
      attempt.current = current
      const { key } = current
      await mutation.mutateAsync({
        run: () =>
          input
            ? runtime.connector.correctEntry(entry.id, input, { key })
            : runtime.connector.cancelEntry(entry.id, { key }),
        resources: [
          'entries',
          'dashboard',
          'habits',
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
      sending.current = false
      if (!success) setWork(null)
    }
  }
  return {
    snapshot,
    draft,
    dirty,
    error,
    work,
    confirmation,
    canWrite,
    close,
    update: (key: keyof EntryDraft, value: string) => {
      if (!work) {
        setDraft((d) => ({ ...d, [key]: value }))
        setError('')
      }
    },
    openConfirmation: () => {
      if (!work && canWrite) {
        setError('')
        setConfirmation(true)
      }
    },
    dismissConfirmation: () => {
      if (!work) setConfirmation(false)
    },
    save: () => submit('save'),
    remove: () => submit('delete'),
    finish: () => {
      setConfirmation(false)
      back()
    },
  }
}
export type EditEntryController = ReturnType<typeof useEditEntryController>
