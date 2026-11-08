import { PeriodSwitch } from '../../shared/ui/PeriodSwitch'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { ActivityIndicator, View, useWindowDimensions } from 'react-native'
import Svg from 'react-native-svg'
import { errorMessage } from '../../../domain/api-error'
import { NeonCurve } from '../../shared/charts/NeonCurve'
import { amount } from '../../shared/models/home-model'
import { Button, Copy, useTheme } from '../../shared/ui/native-ui'
import { s } from './activity.styles'
import type { ActivityController } from './useActivityController'

type Props = Pick<
  ActivityController,
  | 'item'
  | 'period'
  | 'setPeriod'
  | 'statistics'
  | 'total'
  | 'paths'
  | 'days'
  | 'maximum'
>
export function ActivityChartCard({
  item,
  period,
  setPeriod,
  statistics,
  total,
  paths,
  days,
  maximum,
}: Props) {
  const theme = useTheme()
  const { width, fontScale } = useWindowDimensions()
  if (!item) return null
  return (
    <MotionCard
      screen={`/habit/${item.habit.id}`}
      role="chart"
      colors={theme.pink}
      style={s.card}
    >
      <View
        style={[
          s.row,
          {
            justifyContent: 'space-between',
            gap: 12,
            ...(width < 380 || fontScale > 1.2
              ? { flexWrap: 'wrap' as const }
              : {}),
          },
        ]}
      >
        <Copy
          accessibilityRole="header"
          style={[s.heading, { color: theme.onPastel, flexShrink: 1 }]}
        >
          {period === 7 ? 'Cette semaine' : 'Ce mois'}
        </Copy>
        <PeriodSwitch value={period} onChange={setPeriod} variant="compact" />
      </View>
      {statistics.error ? (
        <>
          <Copy accessibilityRole="alert" style={{ color: theme.onPastel }}>
            {errorMessage(statistics.error)}
          </Copy>
          <Button onPress={() => statistics.refetch()}>Réessayer</Button>
        </>
      ) : !statistics.data ? (
        <ActivityIndicator color={theme.onPastel} />
      ) : (
        <>
          <Copy
            style={{ fontSize: 28, fontWeight: '600', color: theme.onPastel }}
          >
            {amount(total, item.habit.unit)}
          </Copy>
          <View
            style={s.row}
            accessible
            accessibilityLabel={`Évolution quotidienne, total ${amount(total, item.habit.unit)}. ${days.filter((d) => d.value !== null).length} jours renseignés sur ${period}.`}
          >
            <View
              style={{
                height: 130,
                justifyContent: 'space-between',
                paddingVertical: 14,
              }}
            >
              {[maximum, maximum / 2, 0].map((n) => (
                <Copy key={n} style={{ fontSize: 11, color: theme.pinkText }}>
                  {amount(n, item.habit.unit)}
                </Copy>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Svg
                width="100%"
                height={130}
                viewBox="0 0 100 54"
                preserveAspectRatio="none"
              >
                <NeonCurve
                  paths={paths}
                  color={theme.dark ? '#ffb3d2' : '#c53978'}
                />
              </Svg>
            </View>
          </View>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            {days
              .filter((_, i) => period === 7 || [0, 9, 19, 29].includes(i))
              .map((day) => (
                <Copy
                  key={day.date}
                  style={{ fontSize: 11, color: theme.pinkText }}
                >
                  {new Intl.DateTimeFormat('fr-FR', {
                    ...(period === 7
                      ? { weekday: 'narrow' as const }
                      : { day: 'numeric' as const, month: 'short' as const }),
                    timeZone: 'UTC',
                  }).format(new Date(day.date + 'T12:00:00Z'))}
                </Copy>
              ))}
          </View>
          {!paths.length && (
            <Copy style={{ fontSize: 13, color: theme.pinkText }}>
              L’historique se construit jour après jour.
            </Copy>
          )}
          {days.some((day) => day.value === null) && (
            <Copy style={{ fontSize: 12, color: theme.pinkText }}>
              Total des jours renseignés · Les jours sans données ou de repos
              sont exclus.
            </Copy>
          )}
        </>
      )}
    </MotionCard>
  )
}
