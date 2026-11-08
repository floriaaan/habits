import { definitionKey } from '../../../domain/habit-definition'
import type { Habit, HabitVersion, Presentation } from '../../../domain/models'
import { shiftDay } from '../../../domain/calendar'
import {
  buildHabit,
  clockSeconds,
  goalUnits,
  newHabitDraft,
  type HabitDraft,
} from './new-habit-model'

export interface EditHabitSnapshot {
  habit: Habit
  presentation: Presentation | null
  versions: HabitVersion[]
  localDate: string
}
export { calendarDate as localDate } from '../../../domain/calendar'
export function nextEditDate(
  today: string,
  period: Habit['period'],
  versions: HabitVersion[] = [],
) {
  let date = shiftDay(today, 1)
  while (
    (period === 'weekly' && new Date(date + 'T12:00:00Z').getUTCDay() !== 1) ||
    versions.some((v) => v.effective_from === date)
  )
    date = shiftDay(date, 1)
  return date
}
export function editDraft({
  habit: h,
  presentation: p,
}: EditHabitSnapshot): HabitDraft {
  return {
    ...newHabitDraft(h.timezone),
    name: h.name,
    category: h.category,
    kind: h.kind,
    unit: h.unit,
    target: String(h.target / goalUnits[h.unit].factor),
    period: h.period,
    weekdays: [...h.schedule.weekdays],
    windowEnabled: !!h.schedule.start,
    start: h.schedule.start?.slice(0, 5) ?? '08:00',
    end: h.schedule.end?.slice(0, 5) ?? '21:00',
    reminderEnabled: !!p?.reminder_at,
    reminder: p?.reminder_at?.slice(0, 5) ?? '19:00',
    icon: p?.icon ?? '',
    color: p?.color ?? '',
    illustration: p?.illustration ?? 'plain',
    increment: String((p?.step ?? 1) / goalUnits[h.unit].factor),
    weight: String(p?.weight ?? 1),
    order: String(p?.order ?? 0),
  }
}
export function buildHabitEdit(
  snapshot: EditHabitSnapshot,
  draft: HabitDraft,
  date: string,
  today: string,
) {
  const original = snapshot.habit
  // These properties have no editor: preserve the backend's immutable identity.
  if (
    draft.kind !== original.kind ||
    draft.unit !== original.unit ||
    draft.period !== original.period ||
    draft.timezone !== original.timezone
  )
    throw new Error(
      'Le type, l’unité, la période et le fuseau ne peuvent pas être modifiés.',
    )
  const input = buildHabit(
    {
      ...draft,
      start:
        original.schedule.start &&
        draft.start === original.schedule.start.slice(0, 5)
          ? original.schedule.start
          : draft.start,
      end:
        original.schedule.end && draft.end === original.schedule.end.slice(0, 5)
          ? original.schedule.end
          : draft.end,
    },
    true,
  )
  const changed = definitionKey(input.habit) !== definitionKey(original)
  if (changed) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + 'T12:00:00Z')) ||
      new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date ||
      date <= today ||
      date > shiftDay(today, 366)
    )
      throw new Error(
        'Choisissez une date future dans les 366 prochains jours.',
      )
    if (
      original.period === 'weekly' &&
      new Date(date + 'T12:00:00Z').getUTCDay() !== 1
    )
      throw new Error(
        'Une habitude hebdomadaire doit être modifiée à partir d’un lundi.',
      )
  }
  const reminder = input.presentation!.reminder_at ?? null
  const reminderChanged =
    !!snapshot.presentation && reminder !== snapshot.presentation.reminder_at
  if (
    reminderChanged &&
    reminder &&
    original.schedule.start &&
    original.schedule.end &&
    (clockSeconds(reminder) < clockSeconds(original.schedule.start) ||
      clockSeconds(reminder) >= clockSeconds(original.schedule.end))
  )
    throw new Error(
      'Le rappel est appliqué immédiatement : son heure doit aussi être dans la plage actuelle.',
    )
  return {
    version: changed ? { effective_from: date, definition: input.habit } : null,
    presentation: reminderChanged
      ? { ...snapshot.presentation!, reminder_at: reminder }
      : null,
  }
}
