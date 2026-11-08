import type {
  Category,
  HabitKind,
  HabitSetup,
  Unit,
} from '../../../domain/models'

export const trackingOptions = [
  { kind: 'boolean', label: 'À valider', unit: 'count', target: '1' },
  { kind: 'quantity', label: 'Quantité', unit: 'milliliters', target: '2' },
  { kind: 'duration', label: 'Durée', unit: 'seconds', target: '10' },
  { kind: 'frequency', label: 'Répétitions', unit: 'count', target: '3' },
] as const

export const goalUnits = {
  milliliters: {
    label: 'L',
    factor: 1000,
    presets: ['1,5', '2', '2,5'],
    step: 250,
  },
  meters: { label: 'km', factor: 1000, presets: ['1', '3', '5'], step: 1000 },
  seconds: { label: 'min', factor: 60, presets: ['5', '10', '20'], step: 60 },
  count: { label: 'fois', factor: 1, presets: ['1', '3', '5'], step: 1 },
} as const

export function habitSetup(
  name: string,
  category: Category,
  kind: HabitKind,
  unit: Unit,
  target: string,
  timezone: string,
): HabitSetup {
  if (!name.trim()) throw new Error('Donnez un nom à votre habitude.')
  const value =
    kind === 'boolean'
      ? 1
      : Number(target.trim().replace(',', '.')) * goalUnits[unit].factor
  if (!Number.isFinite(value) || value <= 0)
    throw new Error('Saisissez un objectif supérieur à zéro.')
  return {
    habit: { name: name.trim(), category, kind, unit, target: value, timezone },
    presentation: {
      step: goalUnits[unit].step,
      illustration: unit === 'milliliters' ? 'water' : 'plain',
    },
  }
}

export type CreationStep = 1 | 2 | 3 | 4
export interface HabitDraft {
  name: string
  category: Category
  kind: HabitKind
  unit: Unit
  target: string
  period: 'daily' | 'weekly'
  weekdays: number[]
  windowEnabled: boolean
  start: string
  end: string
  reminderEnabled: boolean
  reminder: string
  timezone: string
  icon: string
  color: string
  illustration: 'plain' | 'water' | 'portions'
  increment: string
  weight: string
  order: string
}
export function newHabitDraft(timezone: string): HabitDraft {
  return {
    name: '',
    category: 'daily',
    kind: 'boolean',
    unit: 'count',
    target: '1',
    period: 'daily',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    windowEnabled: false,
    start: '08:00',
    end: '21:00',
    reminderEnabled: false,
    reminder: '19:00',
    timezone,
    icon: '',
    color: '',
    illustration: 'plain',
    increment: '1',
    weight: '1',
    order: '0',
  }
}
export function connectedHomeAssistant(
  integrations: import('../../../domain/models').Integration[] | undefined,
) {
  return !!integrations?.some(
    (i) => i.provider === 'home_assistant' && i.connected,
  )
}
export function homeAssistantReminderAvailable(
  integrations: import('../../../domain/models').Integration[] | undefined,
  allowed: boolean,
  successful: boolean,
  fetching: boolean,
) {
  return (
    allowed && successful && !fetching && connectedHomeAssistant(integrations)
  )
}
function numeric(value: string) {
  return Number(value.trim().replace(',', '.'))
}
export function clockSeconds(value: string) {
  const [hours, minutes, seconds = '0'] = value.split(':')
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}
function time(value: string, label: string, secondsAllowed = false) {
  const valid = secondsAllowed
    ? /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(value)
    : /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  if (!valid) throw new Error(`${label} : utilisez le format HH:MM.`)
  return value.length === 5 ? `${value}:00` : value
}
export function validateIdentity(draft: HabitDraft) {
  if (
    !draft.name.trim() ||
    [...draft.name.trim()].length > 120 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(draft.name)
  )
    throw new Error(
      'Le nom doit contenir entre 1 et 120 caractères, sans caractère de contrôle.',
    )
}
export function buildHabit(
  draft: HabitDraft,
  homeAssistantConnected: boolean,
): HabitSetup {
  validateIdentity(draft)
  const result = habitSetup(
    draft.name,
    draft.category,
    draft.kind,
    draft.unit,
    draft.target,
    draft.timezone,
  )
  if (
    result.habit.target > 1e12 ||
    (draft.kind === 'frequency' && !Number.isInteger(result.habit.target))
  )
    throw new Error(
      'L’objectif doit être positif, au plus égal à 1 000 milliards et entier pour les répétitions.',
    )
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: draft.timezone }).format()
  } catch {
    throw new Error(
      'Choisissez un fuseau horaire IANA valide, par exemple Europe/Paris.',
    )
  }
  if (
    !draft.weekdays.length ||
    new Set(draft.weekdays).size !== draft.weekdays.length ||
    draft.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
  )
    throw new Error('Choisissez au moins un jour de pratique.')
  const start = draft.windowEnabled ? time(draft.start, 'Début', true) : null
  const end = draft.windowEnabled ? time(draft.end, 'Fin', true) : null
  if (start && end && clockSeconds(start) >= clockSeconds(end))
    throw new Error('La fin doit suivre le début dans la même journée.')
  if (draft.reminderEnabled && !homeAssistantConnected)
    throw new Error('Connectez Home Assistant avant d’activer un rappel.')
  const reminder = draft.reminderEnabled ? time(draft.reminder, 'Rappel') : null
  if (
    reminder &&
    start &&
    end &&
    (clockSeconds(reminder) < clockSeconds(start) ||
      clockSeconds(reminder) >= clockSeconds(end))
  )
    throw new Error(
      'Le rappel doit se situer dans la plage horaire, avant l’heure de fin.',
    )
  const increment = numeric(draft.increment) * goalUnits[draft.unit].factor
  if (
    !Number.isFinite(increment) ||
    increment <= 0 ||
    increment > 1e12 ||
    (['boolean', 'frequency'].includes(draft.kind) && increment !== 1)
  )
    throw new Error(
      'Le pas d’ajout doit être positif ; il reste à 1 pour une validation ou des répétitions.',
    )
  const weight = numeric(draft.weight),
    order = numeric(draft.order)
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100)
    throw new Error(
      'Le poids dans la progression doit être compris entre 0 exclu et 100.',
    )
  if (
    !draft.order.trim() ||
    !Number.isInteger(order) ||
    order < -10000 ||
    order > 10000
  )
    throw new Error(
      'L’ordre doit être un entier compris entre −10 000 et 10 000.',
    )
  const icon = draft.icon.trim() || null,
    color = draft.color.trim() || null
  if (icon && (!/^mdi:[a-z0-9-]+$/.test(icon) || icon.length > 80))
    throw new Error(
      'L’icône doit être un identifiant MDI valide, par exemple mdi:run.',
    )
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color))
    throw new Error('La couleur doit être au format #RRGGBB.')
  if (
    (draft.illustration === 'water' && draft.unit !== 'milliliters') ||
    (draft.illustration === 'portions' && draft.unit !== 'count')
  )
    throw new Error('Cette illustration ne correspond pas à l’unité choisie.')
  return {
    habit: {
      ...result.habit,
      period: draft.period,
      schedule: { weekdays: [...draft.weekdays].sort(), start, end },
    },
    presentation: {
      icon,
      color,
      order,
      weight,
      step: increment,
      illustration: draft.illustration,
      reminder_at: reminder,
    },
  }
}

export const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
