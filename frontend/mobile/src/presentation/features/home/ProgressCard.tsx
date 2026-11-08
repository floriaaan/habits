import { RollingValue } from '../../shared/ui/RollingValue'
import { Pressable, View } from 'react-native'
import Svg from 'react-native-svg'
import type { Dashboard } from '../../../domain/models'
import { smoothLinePaths } from '../../shared/charts/chart-model'
import { NeonCurve } from '../../shared/charts/NeonCurve'
import { dailyDelta, history, percent } from '../../shared/models/home-model'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Copy, Icon, ui, useTheme } from '../../shared/ui/native-ui'

import { s } from './home.styles'

export function ProgressCard({
  data,
  height,
  onPress,
}: {
  data: Dashboard
  height: number
  onPress: () => void
}) {
  const theme = useTheme(),
    delta = dailyDelta(data),
    days = history(data),
    valid = days.filter((day) => day.percent !== null)
  const paths = smoothLinePaths(days.map((day) => day.percent))
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Progression ${percent(data.global_percent)}, ${delta === null ? 'comparaison indisponible' : `${delta} points depuis hier`}. Voir les statistiques`}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      <MotionCard
        screen="/"
        role="secondary"
        colors={theme.pink}
        style={[s.metric, { minHeight: height }]}
      >
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Copy style={[s.cardTitle, { color: theme.onPastel }]}>
            Progression
          </Copy>
          <Icon
            name={{ ios: 'arrow.up.right', android: 'trending_up' }}
            color={theme.pinkText}
            size={25}
          />
        </View>
        <View
          accessible
          accessibilityLabel={`Progression sur les 7 derniers jours. ${valid.length} jours renseignés.`}
          style={{
            flex: 1,
            minHeight: 55,
            marginHorizontal: -16,
            justifyContent: 'center',
          }}
        >
          {paths.length > 0 ? (
            <Svg
              width="100%"
              height={65}
              viewBox="0 0 100 54"
              preserveAspectRatio="none"
            >
              <NeonCurve
                paths={paths}
                color={theme.dark ? '#ffb3d2' : '#c53978'}
              />
            </Svg>
          ) : (
            <Copy
              style={{
                fontSize: 13,
                paddingHorizontal: 16,
                color: theme.pinkText,
              }}
            >
              L’historique se construit jour après jour.
            </Copy>
          )}
        </View>
        <View
          style={[
            ui.row,
            { justifyContent: 'space-between', alignItems: 'flex-end' },
          ]}
        >
          <View>
            <RollingValue
              id="home.progress"
              style={[s.metricValue, { color: theme.onPastel }]}
              value={percent(data.global_percent)}
            />
            <Copy style={{ color: theme.pinkText, fontSize: 15 }}>
              Objectif
            </Copy>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <RollingValue
              id="home.delta"
              style={[s.metricValue, { color: theme.onPastel }]}
              value={delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta} %`}
            />
            <Copy style={{ color: theme.pinkText, fontSize: 15 }}>vs hier</Copy>
          </View>
        </View>
      </MotionCard>
    </Pressable>
  )
}
