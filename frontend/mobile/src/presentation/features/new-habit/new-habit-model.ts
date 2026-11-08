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
