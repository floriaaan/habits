import { categoryColor } from '../../shared/ui/category-colors'
import type { DashboardHabit } from '../../../domain/models'
import { Icon, useTheme } from '../../shared/ui/native-ui'
const symbols = {
  sport: { ios: 'figure.run', android: 'directions_run' },
  mind: { ios: 'book', android: 'menu_book' },
  daily: { ios: 'sun.max', android: 'light_mode' },
  nutrition: { ios: 'carrot', android: 'nutrition' },
} as const
export const colors = {
  sport: categoryColor('sport').accent,
  mind: categoryColor('mind').accent,
  daily: categoryColor('daily').accent,
  nutrition: categoryColor('nutrition').accent,
}
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'))

export function HabitIcon({ item }: { item: DashboardHabit }) {
  const theme = useTheme()
  return (
    <Icon
      name={
        item.habit.unit === 'milliliters'
          ? { ios: 'drop', android: 'water_drop' }
          : item.habit.kind === 'duration' && item.habit.category === 'mind'
            ? { ios: 'figure.mind.and.body', android: 'self_improvement' }
            : symbols[item.habit.category]
      }
      color={categoryColor(item.habit.category, theme.dark).ink}
      size={26}
    />
  )
}
