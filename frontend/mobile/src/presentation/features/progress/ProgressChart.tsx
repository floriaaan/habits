import { useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import type { DashboardDay } from '../../../domain/models'
import { smoothLinePaths } from '../../shared/charts/chart-model'
import { NeonCurve } from '../../shared/charts/NeonCurve'
import { Copy, useTheme } from '../../shared/ui/native-ui'
import { dayLabel } from './progress-model'

export function ProgressChart({ days }: { days: DashboardDay[] }) {
  const { fontScale } = useWindowDimensions()
  const axisWidth = Math.max(38, 32 * fontScale)
  const theme = useTheme(),
    paths = smoothLinePaths(days.map((day) => day.percent)),
    ink = theme.dark ? '#ffb3d2' : '#c53978'
  const ticks =
    days.length === 7
      ? days
      : days.filter((_, i) => [0, 9, 19, days.length - 1].includes(i))
  return (
    <View
      accessible
      accessibilityLabel="Évolution des objectifs. Les valeurs exactes figurent dans le détail jour par jour."
      style={{ marginTop: 12, marginBottom: 16 }}
    >
      <View style={{ flexDirection: 'row', height: 160 }}>
        <View
          style={{
            width: axisWidth,
            paddingVertical: 13,
            justifyContent: 'space-between',
          }}
        >
          {[100, 75, 50, 25, 0].map((value) => (
            <Copy key={value} style={{ color: theme.pinkText, fontSize: 10 }}>
              {value} %
            </Copy>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Svg
            width="100%"
            height={160}
            viewBox="0 0 100 54"
            preserveAspectRatio="none"
          >
            {[6, 16.5, 27, 37.5, 48].map((y) => (
              <Line
                key={y}
                x1={0}
                x2={100}
                y1={y}
                y2={y}
                stroke={theme.pinkText}
                strokeWidth={0.15}
                opacity={0.2}
              />
            ))}
            <NeonCurve paths={paths} color={ink} />
            {days.map((day, i) =>
              day.percent === null ? null : (
                <Circle
                  key={day.date}
                  cx={(i * 100) / (days.length - 1)}
                  cy={48 - Math.max(0, Math.min(100, day.percent)) * 0.42}
                  r={days.length === 7 ? 1 : 0.55}
                  fill={ink}
                  stroke={theme.pink[0]}
                  strokeWidth={0.35}
                />
              ),
            )}
          </Svg>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginLeft: axisWidth,
          gap: 3,
        }}
      >
        {ticks.map((day) => (
          <Copy key={day.date} style={{ color: theme.pinkText, fontSize: 10 }}>
            {dayLabel(
              day.date,
              days.length === 7
                ? { weekday: 'narrow' }
                : { day: 'numeric', month: 'short' },
            )}
          </Copy>
        ))}
      </View>
      {!days.some((day) => day.percent !== null) && (
        <Copy style={{ color: theme.pinkText, fontSize: 13, marginTop: 8 }}>
          L’historique se construit jour après jour.
        </Copy>
      )}
    </View>
  )
}
