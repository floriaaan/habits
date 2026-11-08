import { PeriodSwitch } from '../../shared/ui/PeriodSwitch'
import {
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { errorMessage } from '../../../domain/api-error'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { TabFrame } from '../../shared/layout/TabFrame'
import { PullToRefresh } from '../../shared/layout/PullToRefresh'
import { percent } from '../../shared/models/home-model'
import {
  MotionCard,
  useTabMotionScroll,
} from '../../shared/motion/TabCardMotion'
import {
  Button,
  Copy,
  deviceCornerRadius,
  Dock,
  dockHeight,
  ScrollViewport,
  useTheme,
} from '../../shared/ui/native-ui'
import { CategoryCard } from './CategoryCard'
import { DailyDetailsCard } from './DailyDetailsCard'
import { s } from './progress.styles'
import { ProgressChart } from './ProgressChart'
import { RegularityCard } from './RegularityCard'

import type { ProgressController } from './useProgressController'

export function ProgressView({ model }: { model: ProgressController }) {
  const {
    isDemo,
    allowed,
    query,
    data,
    days,
    delta,
    dateRange,
    period,
    setPeriod,
    expanded,
    setExpanded,
    scroll,
    setRegularityY,
  } = model
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { width } = useWindowDimensions()
  const motionScroll = useTabMotionScroll('/progress')
  return (
    <TabFrame>
      <ScrollViewport>
        <ScrollView
          onScroll={motionScroll}
          scrollEventThrottle={16}
          ref={scroll}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <PullToRefresh
              onRefresh={() => query.refetch()}
              tintColor={theme.text}
            />
          }
          contentContainerStyle={{
            padding: 6,
            gap: 6,
            paddingBottom: dockHeight(insets.bottom) + 6,
          }}
        >
          <MotionCard
            screen="/progress"
            role="primary"
            style={[
              s.card,
              {
                backgroundColor: theme.surface,
                paddingTop: insets.top + 12,
                borderTopLeftRadius: deviceCornerRadius(insets.top, width),
                borderTopRightRadius: deviceCornerRadius(insets.top, width),
                borderCurve: 'continuous',
              },
            ]}
          >
            <View style={s.row}>
              <Copy accessibilityRole="header" style={s.title}>
                Progression
              </Copy>
              {isDemo && (
                <Copy style={{ fontSize: 11, color: theme.secondary }}>
                  DÉMO
                </Copy>
              )}
            </View>
            <Copy
              style={{ color: theme.secondary, fontSize: 14, marginTop: 5 }}
            >
              {dateRange}
            </Copy>
            <View style={{ marginTop: 16 }}>
              <PeriodSwitch value={period} onChange={setPeriod} />
            </View>
          </MotionCard>
          {!allowed ? (
            <View style={[s.card, { backgroundColor: theme.surface }]}>
              <Copy>
                Votre accès ne permet pas de consulter les statistiques.
              </Copy>
            </View>
          ) : query.error ? (
            <View style={[s.card, { backgroundColor: theme.surface, gap: 12 }]}>
              <Copy accessibilityRole="alert">{errorMessage(query.error)}</Copy>
              <Button onPress={() => query.refetch()}>Réessayer</Button>
            </View>
          ) : !data ? (
            <View style={[s.card, { backgroundColor: theme.surface }]}>
              <ActivityIndicator
                accessibilityLabel="Chargement de la progression"
                color={theme.text}
              />
            </View>
          ) : (
            <>
              <MotionCard
                screen="/progress"
                role="secondary"
                colors={theme.pink}
                style={[s.card, s.clip]}
              >
                <Copy
                  accessibilityRole="header"
                  style={[s.heading, { color: theme.onPastel }]}
                >
                  Objectif quotidien
                </Copy>
                <View
                  style={[s.row, { marginTop: 6, flexWrap: 'wrap', gap: 6 }]}
                >
                  <Copy
                    style={{
                      color: theme.onPastel,
                      fontSize: 26,
                      fontWeight: '600',
                    }}
                  >
                    {percent(data.global_percent)}
                  </Copy>
                  <Copy style={{ color: theme.onPastel, fontSize: 16 }}>
                    aujourd’hui
                  </Copy>
                </View>
                <ProgressChart days={days} />
                <View
                  style={[
                    s.row,
                    { justifyContent: 'space-between', flexWrap: 'wrap' },
                  ]}
                >
                  <Copy style={{ color: theme.pinkText, fontSize: 13 }}>
                    {period} jours
                  </Copy>
                  <Copy style={{ color: theme.pinkText, fontSize: 13 }}>
                    {delta === null
                      ? 'Comparaison indisponible'
                      : `${delta > 0 ? '+' : ''}${delta} pts vs hier`}
                  </Copy>
                </View>
              </MotionCard>
              <DailyDetailsCard {...{ days, period, data }} />
              <RegularityCard {...{ data, days, period, setRegularityY }} />
              <CategoryCard {...{ data, expanded, setExpanded }} />
            </>
          )}
        </ScrollView>
      </ScrollViewport>
      <Dock />
    </TabFrame>
  )
}
