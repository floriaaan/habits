import { definitionKey } from '../../../domain/habit-definition'
import { router, useFocusEffect } from 'expo-router'
import { useRef, useState, useCallback } from 'react'
import { Alert, Keyboard, BackHandler } from 'react-native'
import { ensureHabitVersion } from '../../../application/habit-editing'
import { allPages } from '../../../application/pagination'
import { useApp } from '../../../application/providers'
import {
  useDomainQuery,
  useInvalidate,
  useOperation,
} from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import { usePrepareNativeTabMotion } from '../../shared/motion/TabCardMotion'
import {
  buildHabitEdit,
  editDraft,
  localDate,
  nextEditDate,
  type EditHabitSnapshot,
} from './edit-habit-model'
import {
  connectedHomeAssistant,
  homeAssistantReminderAvailable,
  type HabitDraft,
} from './new-habit-model'

export function useEditHabitQuery(id: string) {
  const { session } = useApp()
  const canRead = !!session?.scopes.includes('habits:read'),
    canReadDashboard = !!session?.scopes.includes('statistics:read')
  const query = useDomainQuery(
    'habits',
    [id, 'editor', canReadDashboard],
    async (c, o): Promise<EditHabitSnapshot> => {
      const [habit, versions, dashboard] = await Promise.all([
        c.getHabit(id, o),
        allPages((page) => c.getVersions(id, page, o), o),
        canReadDashboard ? c.getDashboard(o) : null,
      ])
      const item = dashboard?.groups
        .flatMap((g) => g.habits)
        .find((i) => i.habit.id === id)
      return {
        habit,
        versions,
        presentation: item?.presentation ?? null,
        localDate: item?.local_date ?? localDate(habit.timezone),
      }
    },
    canRead,
  )
  return { query, canRead }
}
export function useEditHabitController(initial: EditHabitSnapshot) {
  const { runtime, session } = useApp(),
    mutation = useOperation(),
    invalidate = useInvalidate()
  const [snapshot] = useState(initial),
    [draft, setDraft] = useState(() => editDraft(initial))
  const [effectiveDate, setEffectiveDate] = useState(() =>
    nextEditDate(initial.localDate, initial.habit.period, initial.versions),
  )
  const [error, setError] = useState(''),
    [work, setWork] = useState<'save' | 'archive' | null>(null),
    [archiveVisible, setArchiveVisible] = useState(false),
    [archiveCommitted, setArchiveCommitted] = useState(false)
  const locked = useRef(false),
    prepare = usePrepareNativeTabMotion()
  const id = snapshot.habit.id,
    screen = `/edit/${id}` as const
  const canWrite =
    !!session?.scopes.includes('habits:write') && !snapshot.habit.archived_at
  const canInspectIntegrations = !!session?.scopes.includes(
    'integrations:manage',
  )
  const integrations = useDomainQuery(
    'integrations',
    [],
    (c, o) => c.listIntegrations(o),
    canInspectIntegrations,
  )
  const reminderAvailable =
    !!snapshot.presentation &&
    homeAssistantReminderAvailable(
      integrations.data,
      canInspectIntegrations,
      integrations.isSuccess,
      integrations.isFetching,
    )
  const dirty = JSON.stringify(draft) !== JSON.stringify(editDraft(snapshot))
  function update<K extends keyof HabitDraft>(field: K, value: HabitDraft[K]) {
    setDraft((d) => ({ ...d, [field]: value }))
    setError('')
  }
  function back() {
    prepare(`/habit/${id}`, screen)
    if (router.canGoBack()) router.back()
    else router.replace({ pathname: '/habit/[id]', params: { id } })
  }
  function close() {
    if (locked.current || work || archiveCommitted) return
    Keyboard.dismiss()
    if (!dirty) return back()
    Alert.alert(
      'Quitter les modifications ?',
      'Vos changements ne seront pas conservés.',
      [
        { text: 'Continuer à modifier', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: back },
      ],
    )
  }
  async function save() {
    if (locked.current || !canWrite) return false
    locked.current = true
    setWork('save')
    setError('')
    Keyboard.dismiss()
    let versionCommitted = false
    let finished = false
    try {
      const current = await runtime.connector.getHabit(id)
      if (definitionKey(current) !== definitionKey(snapshot.habit))
        throw new Error(
          'Cette habitude a changé depuis l’ouverture. Rouvrez la modification pour utiliser ses nouveaux réglages.',
        )
      if (current.archived_at)
        throw new Error('Cette habitude est déjà archivée.')
      const plan = buildHabitEdit(
        snapshot,
        draft,
        effectiveDate,
        localDate(current.timezone),
      )
      if (!plan.version && !plan.presentation)
        throw new Error('Aucune modification à enregistrer.')
      if (plan.presentation?.reminder_at) {
        if (
          !canInspectIntegrations ||
          !connectedHomeAssistant(await runtime.connector.listIntegrations())
        )
          throw new Error(
            'Connectez Home Assistant avant de modifier le rappel.',
          )
      }
      // Preserve presentation settings changed by another client since opening the form.
      if (plan.presentation) {
        const dashboard = await runtime.connector.getDashboard()
        const fresh = dashboard.groups
          .flatMap((g) => g.habits)
          .find((i) => i.habit.id === id)
        if (!fresh) throw new Error('Cette habitude n’est plus disponible.')
        plan.presentation = {
          ...fresh.presentation,
          reminder_at: plan.presentation.reminder_at,
        }
      }
      await mutation.mutateAsync({
        run: async () => {
          if (plan.version) {
            await ensureHabitVersion(runtime.connector, id, plan.version)
            versionCommitted = true
          }
          if (plan.presentation)
            await runtime.connector.setPresentation(id, plan.presentation)
        },
        resources: [
          'habits',
          'dashboard',
          'entries',
          'statistics',
          'gamification',
        ],
      })
      finished = true
      return true
    } catch (e) {
      setError(
        (versionCommitted
          ? `Les changements sont programmés pour le ${effectiveDate}, mais le rappel n’a pas été modifié. Réessayez. `
          : '') + errorMessage(e),
      )
      if (versionCommitted)
        await invalidate(['habits', 'dashboard', 'statistics'])
      return false
    } finally {
      locked.current = false
      if (!finished) setWork(null)
    }
  }
  async function archive() {
    if (locked.current || !canWrite) return false
    locked.current = true
    setWork('archive')
    setError('')
    try {
      await mutation.mutateAsync({
        run: () => runtime.connector.archiveHabit(id),
        resources: [
          'habits',
          'dashboard',
          'entries',
          'statistics',
          'gamification',
        ],
      })
      setArchiveCommitted(true)
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      locked.current = false
      setWork(null)
    }
  }
  function finishArchive() {
    prepare('/', screen)
    setArchiveVisible(false)
    router.dismissTo('/')
  }
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (archiveVisible) {
            if (!locked.current && !archiveCommitted) setArchiveVisible(false)
          } else close()
          return true
        },
      )
      return () => subscription.remove()
    }, [archiveVisible, archiveCommitted, work, dirty]),
  )
  return {
    snapshot,
    draft,
    update,
    effectiveDate,
    setEffectiveDate,
    error,
    work,
    canWrite,
    dirty,
    integrations,
    canInspectIntegrations,
    reminderAvailable,
    save,
    archive,
    close,
    finishSave: back,
    finishArchive,
    archiveVisible,
    archiveCommitted,
    openArchive: () => {
      Keyboard.dismiss()
      setError('')
      setArchiveVisible(true)
    },
    dismissArchive: () => {
      if (!locked.current && !archiveCommitted) setArchiveVisible(false)
    },
  }
}
export type EditHabitController = ReturnType<typeof useEditHabitController>
