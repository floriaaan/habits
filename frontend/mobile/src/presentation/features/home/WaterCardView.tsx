import { RollingValue } from '../../shared/ui/RollingValue'
import { PeriodSwitch } from '../../shared/ui/PeriodSwitch'
import { Pressable, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import type { DashboardHabit } from '../../../domain/models'
import { amount, percent } from '../../shared/models/home-model'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Copy, ui, useTheme } from '../../shared/ui/native-ui'

import { s } from './home.styles'

import type { WaterCardController } from './useWaterCard'
export function WaterCardView({
  item,
  height,
  compact,
  model,
}: {
  item?: DashboardHabit
  height: number
  compact: boolean
  model: WaterCardController
}) {
  const theme = useTheme()
  const { period, setPeriod, stats, dates, progress, open } = model
  return (
    <MotionCard
      screen="/"
      role="quaternary"
      colors={theme.blue}
      style={[s.water, { minHeight: height }]}
    >
      <View
        style={[
          ui.row,
          {
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            ...(compact ? ({ flexDirection: 'column', gap: 12 } as const) : {}),
          },
        ]}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <View
            accessible
            accessibilityLabel={`Hydratation, historique des ${period} derniers jours${stats.error ? ', indisponible' : ''}`}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: period === 7 ? 4 : 2,
              maxWidth: 180,
            }}
          >
            {dates.map((date) => {
              const day = stats.data?.heatmap.find((day) => day.date === date),
                value =
                  date === item?.local_date
                    ? item.percent
                    : day?.eligible
                      ? Math.min(
                          100,
                          (day.progress / (item?.target ?? 1)) * 100,
                        )
                      : null
              return (
                <View
                  key={date}
                  style={{
                    width: period === 7 ? 17 : 10,
                    height: period === 7 ? 17 : 8,
                    borderRadius: 5,
                    backgroundColor:
                      value == null
                        ? theme.dark
                          ? '#5b7688'
                          : '#afcde1'
                        : `rgba(0,145,245,${0.25 + value * 0.0075})`,
                  }}
                />
              )
            })}
          </View>
          <Copy style={{ color: theme.blueText, fontSize: 18, marginTop: 5 }}>
            Hydratation
          </Copy>
        </View>
        <PeriodSwitch value={period} onChange={setPeriod} variant="water" />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          item
            ? `${item.habit.name}, ${amount(item.progress, item.habit.unit)}, ${percent(item.percent)} de l’objectif. Modifier la quantité`
            : 'Créer une habitude d’hydratation'
        }
        onPress={open}
        style={({ pressed }) => [
          ui.row,
          {
            flex: 1,
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            ...(compact ? ({ flexDirection: 'column', gap: 12 } as const) : {}),
            paddingTop: 14,
            opacity: pressed ? 0.65 : 1,
          },
        ]}
      >
        <Svg width="43%" height={64} viewBox="0 0 170 80" accessible={false}>
          <Path
            d="M7 78 Q3 78 3 73 L3 20 Q3 12 12 12 L12 4 L21 4 L21 12 Q30 12 30 20 L30 73 Q30 78 25 78 Z"
            fill="#069cfa"
            opacity={progress >= 0.2 ? 1 : 0.25}
          />
          <Path
            d="M44 78 Q40 78 40 73 L40 20 Q40 12 49 12 L49 4 L58 4 L58 12 Q67 12 67 20 L67 73 Q67 78 62 78 Z"
            fill="#069cfa"
            opacity={progress >= 0.4 ? 1 : 0.25}
          />
          {[0, 1, 2].map((i) => (
            <Path
              key={i}
              d={`M${77 + i * 29} 39 L${101 + i * 29} 39 L${97 + i * 29} 78 L${81 + i * 29} 78 Z`}
              fill="#069cfa"
              opacity={Math.max(0.18, Math.min(1, progress * 5 - i - 2))}
            />
          ))}
        </Svg>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <RollingValue
            id="home.water"
            style={{
              fontSize: item ? 36 : 20,
              fontWeight: '600',
              letterSpacing: -1,
              color: theme.onPastel,
            }}
            value={item ? amount(item.progress, item.habit.unit) : 'Commencer'}
          />
          <Copy
            style={{ fontSize: 15, color: theme.blueText, textAlign: 'right' }}
          >
            {item
              ? `${percent(item.percent)} de l’objectif`
              : 'Ajouter une habitude d’eau'}
          </Copy>
        </View>
      </Pressable>
    </MotionCard>
  )
}
