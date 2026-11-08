import { View } from 'react-native'
import { percent } from '../../shared/models/home-model'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Copy, useTheme } from '../../shared/ui/native-ui'
import { dayLabel } from './progress-model'
import { s } from './progress.styles'

import type { ProgressController } from './useProgressController'

type Props = Pick<ProgressController, 'days' | 'period' | 'data'>
export function DailyDetailsCard({ days, period, data }: Props) {
  const theme = useTheme()
  if (!data) return null
  return (
    <MotionCard
      screen="/progress"
      surfaceOrder={1}
      role="daily-detail"
      style={[s.card, { backgroundColor: theme.surface, paddingVertical: 6 }]}
    >
      {days.map((day) => (
        <View
          key={day.date}
          accessible
          accessibilityLabel={`${dayLabel(day.date)}, ${percent(day.percent)}${day.date === data.date ? ', aujourd’hui' : ''}`}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            minHeight: 44,
            padding: 8,
            borderRadius: 12,
            backgroundColor:
              day.date === data.date ? theme.pink[0] : 'transparent',
          }}
        >
          <Copy
            style={{
              width: period === 7 ? 64 : 82,
              fontSize: 14,
              color: day.date === data.date ? theme.onPastel : theme.text,
            }}
          >
            {dayLabel(
              day.date,
              period === 7
                ? { weekday: 'short' }
                : { day: 'numeric', month: 'short' },
            )}
          </Copy>
          <Copy
            style={{
              width: 55,
              fontSize: 14,
              fontWeight: '600',
              color: day.date === data.date ? theme.onPastel : theme.text,
            }}
          >
            {percent(day.percent)}
          </Copy>
          <View
            style={{
              flex: 1,
              minWidth: 60,
              height: 7,
              borderRadius: 4,
              overflow: 'hidden',
              backgroundColor: theme.selected,
            }}
          >
            {day.percent !== null && (
              <View
                style={{
                  height: 7,
                  borderRadius: 4,
                  width: `${Math.max(0, Math.min(100, day.percent))}%`,
                  backgroundColor: theme.dark ? '#ff97c4' : '#db4b89',
                }}
              />
            )}
          </View>
        </View>
      ))}
      <Copy style={{ color: theme.secondary, fontSize: 12, padding: 8 }}>
        Un tiret indique une absence de données ou d’objectif éligible.
      </Copy>
    </MotionCard>
  )
}
