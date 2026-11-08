import { Pressable, View } from 'react-native'
import Svg from 'react-native-svg'
import type { Dashboard } from '../../../domain/models'
import { smoothLinePaths } from '../../shared/charts/chart-model'
import { NeonCurve } from '../../shared/charts/NeonCurve'
import { history } from '../../shared/models/home-model'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Copy, ui, useTheme } from '../../shared/ui/native-ui'

import { s } from './home.styles'

export function RegularityCard({
  data,
  height,
  onPress,
}: {
  data: Dashboard
  height: number
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Régularité, ${data.streak_91_days.current} jours de suite, ${data.gamification.xp} XP. Voir les statistiques`}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      <MotionCard
        screen="/"
        role="tertiary"
        colors={theme.green}
        style={[s.metric, { minHeight: height }]}
      >
        <Copy style={[s.cardTitle, { color: theme.onPastel }]}>Régularité</Copy>
        <Copy style={{ color: theme.greenText, fontSize: 17 }}>
          Cette semaine
        </Copy>
        <View
          accessible
          accessibilityLabel="Part des habitudes validées chaque jour sur les sept derniers jours"
          style={{
            flex: 1,
            minHeight: 55,
            justifyContent: 'center',
            marginHorizontal: -16,
          }}
        >
          <Svg
            width="100%"
            height={65}
            viewBox="0 0 100 54"
            preserveAspectRatio="none"
          >
            <NeonCurve
              paths={smoothLinePaths(
                history(data).map((day) =>
                  day.percent !== null && day.eligible > 0
                    ? (day.completed / day.eligible) * 100
                    : null,
                ),
              )}
              color={theme.dark ? '#b6ec80' : '#39770b'}
            />
          </Svg>
        </View>
        <View
          style={[
            ui.row,
            { justifyContent: 'space-between', alignItems: 'flex-end' },
          ]}
        >
          <View style={{ flexShrink: 1 }}>
            <Copy style={[s.metricValue, { color: theme.onPastel }]}>
              {data.streak_91_days.current} jours
            </Copy>
            <Copy style={{ color: theme.greenText, fontSize: 15 }}>
              de suite
            </Copy>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
            <Copy style={[s.metricValue, { color: theme.onPastel }]}>
              {data.gamification.xp} XP
            </Copy>
            <Copy style={{ color: theme.greenText, fontSize: 15 }}>
              cumulés
            </Copy>
          </View>
        </View>
      </MotionCard>
    </Pressable>
  )
}
