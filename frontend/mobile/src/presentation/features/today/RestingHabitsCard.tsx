import { View } from 'react-native'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Button, Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import { HabitIcon } from './today-visuals'
import { s } from './today.styles'
import type { TodayController } from './useTodayController'

export function RestingHabitsCard({ model: m }: { model: TodayController }) {
  const theme = useTheme()
  if (!m.resting.length) return null
  return (
    <MotionCard
      screen="/today"
      role="rests"
      colors={theme.blue}
      style={[s.panel, { gap: 14 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon
          name={{ ios: 'bed.double', android: 'bed' }}
          color={theme.onPastel}
          size={24}
        />
        <Copy
          accessibilityRole="header"
          style={[s.sectionTitle, { marginBottom: 0, color: theme.onPastel }]}
        >
          En repos
        </Copy>
      </View>
      {m.resting.map((item) => (
        <View
          key={item.habit.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            minHeight: 56,
          }}
        >
          <HabitIcon item={item} />
          <View style={{ flex: 1, minWidth: 110, gap: 4 }}>
            <Copy style={[s.habitName, { color: theme.onPastel }]}>
              {item.habit.name}
            </Copy>
            <Copy style={{ fontSize: 13, color: theme.blueText }}>
              Votre série est préservée
            </Copy>
          </View>
          {m.canManageRest && (
            <Button
              accessibilityLabel={`Retirer le repos de ${item.habit.name}`}
              disabled={!!m.restRemoving}
              onPress={() => m.removeRest(item)}
              onFeedbackEnd={(outcome) => {
                if (outcome === 'success') m.finishRemoveRest()
              }}
              style={{ minWidth: 80 }}
            >
              Retirer
            </Button>
          )}
        </View>
      ))}
    </MotionCard>
  )
}
