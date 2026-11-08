import { randomUUID } from 'expo-crypto'
import { router } from 'expo-router'
import { useRef, useState, type ComponentRef } from 'react'
import { Keyboard, ScrollView, TextInput } from 'react-native'
import { useApp } from '../../../application/providers'
import { useOperation } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import type { Category, HabitKind, Unit } from '../../../domain/models'
import { goalUnits, habitSetup, trackingOptions } from './new-habit-model'

export function useNewHabitController() {
  const { runtime, session } = useApp(),
    mutation = useOperation()
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState(''),
    [kind, setKind] = useState<HabitKind>('boolean')
  const [unit, setUnit] = useState<Unit>('count'),
    [target, setTarget] = useState('1')
  const [category, setCategory] = useState<Category>('daily'),
    [error, setError] = useState('')
  const key = useRef(randomUUID()),
    previous = useRef(''),
    saving = useRef(false)
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null),
    nameInput = useRef<ComponentRef<typeof TextInput>>(null),
    goalInput = useRef<ComponentRef<typeof TextInput>>(null)
  const canWrite = !!session?.scopes.includes('habits:write'),
    busy = mutation.isPending
  const measurement = goalUnits[unit]
  const tracking = trackingOptions.find((option) => option.kind === kind)!

  function changeStep(next: 1 | 2) {
    Keyboard.dismiss()
    setError('')
    setStep(next)
    scroll.current?.scrollTo({ y: 0, animated: false })
  }
  function next() {
    if (!name.trim()) {
      setError('Donnez un nom à votre habitude.')
      nameInput.current?.focus()
      return
    }
    changeStep(2)
  }
  async function save() {
    if (!canWrite || saving.current) return false
    setError('')
    let input
    try {
      input = habitSetup(
        name,
        category,
        kind,
        unit,
        target,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
    } catch (e) {
      setError(errorMessage(e))
      goalInput.current?.focus()
      return false
    }
    const fingerprint = JSON.stringify(input)
    if (fingerprint !== previous.current) {
      key.current = randomUUID()
      previous.current = fingerprint
    }
    saving.current = true
    Keyboard.dismiss()
    try {
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
    }
  }
  const summaryIcon =
    unit === 'milliliters'
      ? ({ ios: 'drop', android: 'water_drop' } as const)
      : ({ ios: 'checkmark.circle', android: 'check_circle' } as const)

  return {
    finish: () => router.back(),
    step,
    name,
    setName,
    kind,
    setKind,
    unit,
    setUnit,
    target,
    setTarget,
    category,
    setCategory,
    error,
    scroll,
    nameInput,
    goalInput,
    canWrite,
    busy,
    measurement,
    tracking,
    changeStep,
    next,
    save,
    summaryIcon,
  }
}
export type NewHabitController = ReturnType<typeof useNewHabitController>
