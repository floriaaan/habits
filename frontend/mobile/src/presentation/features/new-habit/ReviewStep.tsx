import { Pressable, View, StyleSheet } from 'react-native'
import { Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import { categories } from '../../shared/models/home-model'
import { categoryColor } from '../../shared/ui/category-colors'
import {
  goalUnits,
  trackingOptions,
  type CreationStep,
} from './new-habit-model'
import { dayNames } from './new-habit-model'
import type { NewHabitController } from './useNewHabitController'

type Props = Pick<
  NewHabitController,
  'draft' | 'changeStep' | 'reminderAvailable'
>
export function ReviewStep({ draft: d, changeStep, reminderAvailable }: Props) {
  const theme = useTheme(),
    color = categoryColor(d.category, theme.dark)
  const period = d.period === 'daily' ? 'jour de pratique' : 'semaine'
  const goal =
    d.kind === 'boolean'
      ? `Une validation / ${period}`
      : `${d.target} ${goalUnits[d.unit].label} / ${period}`
  function row(label: string, value: string, step: CreationStep) {
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}. Modifier`}
        onPress={() => changeStep(step)}
        style={{
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          minHeight: 58,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.selected,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Copy style={{ fontSize: 15, fontWeight: '600' }}>{label}</Copy>
          <Copy style={{ fontSize: 14, color: theme.secondary }}>{value}</Copy>
        </View>
        <Icon
          name={{ ios: 'chevron.right', android: 'chevron_right' }}
          size={16}
          color={theme.secondary}
        />
      </Pressable>
    )
  }
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 5 }}>
        <Copy style={{ fontSize: 20, fontWeight: '600' }}>{d.name.trim()}</Copy>
        <Copy style={{ color: color.ink, fontSize: 14 }}>
          {categories[d.category]} ·{' '}
          {trackingOptions.find((o) => o.kind === d.kind)!.label}
        </Copy>
      </View>
      <View>
        {row('Définition', `${d.name.trim()} · ${categories[d.category]}`, 1)}
        {row('Objectif', goal, 2)}
        {row(
          'Jours',
          d.weekdays.length === 7
            ? 'Tous les jours'
            : [...d.weekdays]
                .sort()
                .map((day) => dayNames[day - 1])
                .join(', '),
          3,
        )}
        {row(
          'Horaires',
          d.windowEnabled ? `${d.start} – ${d.end}` : 'Toute la journée',
          3,
        )}
        {row(
          'Rappel Home Assistant',
          d.reminderEnabled
            ? reminderAvailable
              ? d.reminder
              : 'Connexion indisponible — à modifier'
            : 'Désactivé',
          3,
        )}
        {!['boolean', 'frequency'].includes(d.kind) &&
          row('Pas d’ajout', `${d.increment} ${goalUnits[d.unit].label}`, 3)}
      </View>
    </View>
  )
}
