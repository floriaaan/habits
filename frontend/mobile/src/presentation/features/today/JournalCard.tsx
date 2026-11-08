import { View } from 'react-native'
import { amount } from '../../shared/models/home-model'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Copy, useTheme } from '../../shared/ui/native-ui'
import { colors, HabitIcon } from './today-visuals'
import { s } from './today.styles'
import type { TodayController } from './useTodayController'

type Props = Pick<TodayController, 'day'> & { compact: boolean }
export function JournalCard({ day, compact }: Props) {
  const theme = useTheme()
  if (!day) return null
  return (
    <MotionCard
      screen="/today"
      surfaceOrder={1}
      role="secondary"
      style={[s.panel, { backgroundColor: theme.surface }]}
    >
      <Copy accessibilityRole="header" style={s.sectionTitle}>
        Journal du jour
      </Copy>
      {day.events.length === 0 && (
        <Copy
          style={{ color: theme.secondary, fontSize: 15, paddingVertical: 20 }}
        >
          Aucune réalisation enregistrée pour ce jour.
        </Copy>
      )}
      {day.events.map(({ entry, item }, index) => (
        <View
          key={entry.id}
          style={[
            s.event,
            compact && {
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 8,
            },
          ]}
        >
          <Copy
            style={{
              fontSize: 13,
              color: theme.secondary,
              width: compact ? undefined : 48,
            }}
          >
            {new Intl.DateTimeFormat('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: item.habit.timezone,
            }).format(new Date(entry.occurred_at))}
          </Copy>
          <View style={s.eventContent}>
            <View style={s.rail}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors[item.habit.category],
                }}
              />
              {index !== day.events.length - 1 && (
                <View
                  style={{
                    width: 1,
                    flex: 1,
                    minHeight: 42,
                    backgroundColor: theme.selected,
                  }}
                />
              )}
            </View>
            <View style={{ paddingTop: 1 }}>
              <HabitIcon item={item} />
            </View>
            <View style={{ flex: 1, gap: 4, paddingBottom: 22 }}>
              <Copy style={s.habitName}>{item.habit.name}</Copy>
              <Copy style={{ color: theme.secondary, fontSize: 14 }}>
                {item.habit.kind === 'boolean'
                  ? 'Validation enregistrée'
                  : '+' + amount(entry.value, item.habit.unit)}
                {item.habit.unit === 'count' && item.habit.kind !== 'boolean'
                  ? ' fois'
                  : ''}
              </Copy>
            </View>
          </View>
        </View>
      ))}
      {day.events.length > 0 && (
        <Copy style={{ color: theme.secondary, fontSize: 12 }}>
          Heures locales des habitudes.
        </Copy>
      )}
    </MotionCard>
  )
}
