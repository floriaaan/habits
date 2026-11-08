import { View } from 'react-native'
import Svg from 'react-native-svg'
import { smoothLinePaths } from '../../shared/charts/chart-model'
import { NeonCurve } from '../../shared/charts/NeonCurve'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Copy, useTheme } from '../../shared/ui/native-ui'
import { dayLabel, fullDays } from './progress-model'
import { s } from './progress.styles'

import type { ProgressController } from './useProgressController'

type Props = Pick<
  ProgressController,
  'data' | 'days' | 'period' | 'setRegularityY'
>
export function RegularityCard({ data, days, period, setRegularityY }: Props) {
  const theme = useTheme()
  if (!data) return null
  return (
    <MotionCard
      screen="/progress"
      role="tertiary"
      colors={theme.green}
      onLayout={(event) => setRegularityY(event.nativeEvent.layout.y)}
      style={[s.card, s.clip]}
    >
      <Copy
        accessibilityRole="header"
        style={[s.heading, { color: theme.onPastel }]}
      >
        Régularité
      </Copy>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 18,
          justifyContent: 'space-between',
          paddingVertical: 18,
        }}
      >
        <Copy style={{ fontSize: 19, color: theme.onPastel }}>
          <Copy
            style={{ fontSize: 23, color: theme.onPastel, fontWeight: '600' }}
          >
            {data.streak_91_days.record}
          </Copy>{' '}
          jours record
        </Copy>
        <Copy style={{ fontSize: 19, color: theme.onPastel }}>
          <Copy
            style={{ fontSize: 23, color: theme.onPastel, fontWeight: '600' }}
          >
            {fullDays(days)}
          </Copy>{' '}
          jours complets
        </Copy>
      </View>
      <View
        accessible
        accessibilityLabel="Part des habitudes validées chaque jour. Les valeurs figurent dans les jours ci-dessous."
        style={{ marginBottom: 16 }}
      >
        <Svg
          width="100%"
          height={90}
          viewBox="0 0 100 54"
          preserveAspectRatio="none"
        >
          <NeonCurve
            paths={smoothLinePaths(
              days.map((day) =>
                day.percent !== null && day.eligible > 0
                  ? (day.completed / day.eligible) * 100
                  : null,
              ),
            )}
            color={theme.dark ? '#b6ec80' : '#39770b'}
          />
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {days.map((day) => {
          const done = day.eligible > 0 && day.completed === day.eligible
          return (
            <View
              key={day.date}
              accessible
              accessibilityLabel={`${dayLabel(day.date)} : ${day.percent === null ? 'données indisponibles' : done ? 'tous les objectifs atteints' : `${day.completed} sur ${day.eligible} objectifs atteints`}`}
              style={{
                ...(period === 7 ? { flex: 1, minWidth: 26 } : { width: 27 }),
                alignItems: 'center',
                gap: 7,
              }}
            >
              <View
                style={{
                  width: '100%',
                  height: 26,
                  borderRadius: 7,
                  borderWidth: 1,
                  borderColor: theme.greenText,
                  backgroundColor: done ? theme.accent : theme.chip,
                  opacity: day.percent === null ? 0.3 : done ? 1 : 0.6,
                }}
              />
              {period === 7 && (
                <Copy style={{ color: theme.greenText, fontSize: 11 }}>
                  {dayLabel(day.date, { weekday: 'narrow' })}
                </Copy>
              )}
            </View>
          )
        })}
      </View>
      <Copy style={{ marginTop: 14, color: theme.greenText, fontSize: 12 }}>
        Record sur 91 jours · {data.streak_91_days.current} jours de suite ·{' '}
        {data.gamification.xp.toLocaleString('fr-FR')} XP
      </Copy>
    </MotionCard>
  )
}
