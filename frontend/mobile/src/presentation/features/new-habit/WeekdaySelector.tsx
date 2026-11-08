import type { Category } from '../../../domain/models'
import { DayPills } from '../../shared/forms/DayPills'
const days = [
  ['L', 'Lundi'],
  ['M', 'Mardi'],
  ['M', 'Mercredi'],
  ['J', 'Jeudi'],
  ['V', 'Vendredi'],
  ['S', 'Samedi'],
  ['D', 'Dimanche'],
] as const

export function WeekdaySelector({
  days: selectedDays,
  category,
  onChange,
}: {
  days: number[]
  category: Category
  onChange: (days: number[]) => void
}) {
  return (
    <DayPills
      multiple
      category={category}
      items={days.map(([label, accessibilityLabel], i) => ({
        key: String(i + 1),
        label,
        accessibilityLabel,
        selected: selectedDays.includes(i + 1),
      }))}
      onPress={(key) => {
        const day = Number(key)
        onChange(
          selectedDays.includes(day)
            ? selectedDays.filter((value) => value !== day)
            : [...selectedDays, day],
        )
      }}
    />
  )
}
