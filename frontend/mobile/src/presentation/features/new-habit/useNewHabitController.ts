import { randomUUID } from 'expo-crypto'
import { router } from 'expo-router'
import { useRef, useState, type ComponentRef } from 'react'
import { Keyboard, ScrollView } from 'react-native'
import { useApp } from '../../../application/providers'
import { useDomainQuery, useOperation } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import type { HabitKind, Unit } from '../../../domain/models'
import {
  buildHabit,
  connectedHomeAssistant,
  homeAssistantReminderAvailable,
  goalUnits,
  habitSetup,
  newHabitDraft,
  trackingOptions,
  validateIdentity,
  type CreationStep,
  type HabitDraft,
} from './new-habit-model'

export function useNewHabitController() {
  const { runtime, session } = useApp(),
    mutation = useOperation()
  const [step, setStep] = useState<CreationStep>(1)
  const [draft, setDraft] = useState(() =>
    newHabitDraft(Intl.DateTimeFormat().resolvedOptions().timeZone),
  )
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const key = useRef(randomUUID()),
    previous = useRef(''),
    saving = useRef(false)
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const canWrite = !!session?.scopes.includes('habits:write'),
    canInspectIntegrations = !!session?.scopes.includes('integrations:manage')
  const integrations = useDomainQuery(
    'integrations',
    [],
    (c, o) => c.listIntegrations(o),
    canInspectIntegrations,
  )
  const homeAssistantConnected =
    integrations.isSuccess && connectedHomeAssistant(integrations.data)
  const reminderAvailable = homeAssistantReminderAvailable(
    integrations.data,
    canInspectIntegrations,
    integrations.isSuccess,
    integrations.isFetching,
  )
  const busy = mutation.isPending || checking
  function update<K extends keyof HabitDraft>(field: K, value: HabitDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
    setError('')
  }
  function chooseKind(kind: HabitKind) {
    if (kind === draft.kind) return
    const option = trackingOptions.find((o) => o.kind === kind)!
    setDraft((d) => ({
      ...d,
      kind,
      unit: option.unit,
      target: option.target,
      increment: String(
        goalUnits[option.unit].step / goalUnits[option.unit].factor,
      ),
      illustration: option.unit === 'milliliters' ? 'water' : 'plain',
    }))
    setError('')
  }
  function chooseUnit(unit: Unit) {
    if (unit === draft.unit) return
    setDraft((d) => ({
      ...d,
      unit,
      target: goalUnits[unit].presets[1],
      increment: String(goalUnits[unit].step / goalUnits[unit].factor),
      illustration: unit === 'milliliters' ? 'water' : 'plain',
    }))
    setError('')
  }
  function changeStep(next: CreationStep) {
    if (busy) return
    Keyboard.dismiss()
    setError('')
    setStep(next)
    scroll.current?.scrollTo({ y: 0, animated: false })
  }
  function next() {
    try {
      validateIdentity(draft)
      if (step >= 2) {
        const goal = habitSetup(
          draft.name,
          draft.category,
          draft.kind,
          draft.unit,
          draft.target,
          draft.timezone,
        )
        if (
          goal.habit.target > 1e12 ||
          (draft.kind === 'frequency' && !Number.isInteger(goal.habit.target))
        )
          throw new Error(
            'Saisissez un objectif valide et entier pour les répétitions.',
          )
      }
      if (step === 3) buildHabit(draft, reminderAvailable)
      changeStep(Math.min(4, step + 1) as CreationStep)
    } catch (e) {
      setError(errorMessage(e))
      return false
    }
  }
  async function save() {
    if (!canWrite || saving.current) return false
    setError('')
    saving.current = true
    setChecking(true)
    Keyboard.dismiss()
    try {
      // Recheck the connection at submission, so a stale screen cannot enable a reminder.
      const connected =
        draft.reminderEnabled && canInspectIntegrations
          ? connectedHomeAssistant(await runtime.connector.listIntegrations())
          : false
      const input = buildHabit(draft, connected)
      const fingerprint = JSON.stringify(input)
      if (fingerprint !== previous.current) {
        key.current = randomUUID()
        previous.current = fingerprint
      }
      await mutation.mutateAsync({
        run: () => runtime.connector.setupHabit(input, { key: key.current }),
        resources: ['habits', 'dashboard', 'statistics'],
      })
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      saving.current = false
      setChecking(false)
    }
  }
  return {
    draft,
    update,
    step,
    changeStep,
    chooseKind,
    chooseUnit,
    next,
    save,
    finish: () => router.back(),
    error,
    scroll,
    canWrite,
    busy,
    integrations,
    canInspectIntegrations,
    reminderAvailable,
    homeAssistantConnected,
  }
}
export type NewHabitController = ReturnType<typeof useNewHabitController>
