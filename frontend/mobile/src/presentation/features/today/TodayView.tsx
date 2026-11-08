import { router } from 'expo-router'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { errorMessage } from '../../../domain/api-error'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { TabFrame } from '../../shared/layout/TabFrame'
import { PullToRefresh } from '../../shared/layout/PullToRefresh'
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
  Icon,
  ScrollViewport,
  useTheme,
} from '../../shared/ui/native-ui'
import { DaySelector } from './DaySelector'
import { RestingHabitsCard } from './RestingHabitsCard'
import { JournalCard } from './JournalCard'
import { PendingHabitsCard } from './PendingHabitsCard'
import { dateLabel } from './today-visuals'
import { s } from './today.styles'
import type { TodayController } from './useTodayController'

export function TodayView({ model }: { model: TodayController }) {
  const {
    isDemo,
    canCreate,
    canWrite,
    canRead,
    dashboard,
    selected,
    anchor,
    history,
    day,
    pending,
    eligible,
    completed,
    historical,
    earliest,
    error,
    transition,
    direction,
    choose,
    setWeek,
    gestures,
    refresh,
    quickAction,
    finishQuickAction,
    blocked,
    today,
    notice,
  } = model
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { width, fontScale } = useWindowDimensions()
  const compact = width < 380 || fontScale > 1.2
  const motionScroll = useTabMotionScroll('/today')
  return (
    <TabFrame>
      <ScrollViewport>
        <ScrollView
          onScroll={motionScroll}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <PullToRefresh onRefresh={refresh} tintColor={theme.text} />
          }
          contentContainerStyle={[
            s.scroll,
            { paddingBottom: dockHeight(insets.bottom) + 6 },
          ]}
        >
          <MotionCard
            screen="/today"
            role="primary"
            style={[
              s.header,
              {
                backgroundColor: theme.surface,
                paddingTop: insets.top + 12,
                borderTopLeftRadius: deviceCornerRadius(insets.top, width),
                borderTopRightRadius: deviceCornerRadius(insets.top, width),
                borderCurve: 'continuous',
              },
            ]}
          >
            <View style={s.headerRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Copy accessibilityRole="header" style={s.title}>
                  Aujourd’hui
                </Copy>
                <Copy style={{ color: theme.secondary, fontSize: 15 }}>
                  {selected ? dateLabel(selected) : 'Votre journal quotidien'}
                  {isDemo ? ' · Démo' : ''}
                </Copy>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ajouter une habitude"
                disabled={!canCreate}
                onPress={() => router.push('/new')}
                style={[s.iconButton, { backgroundColor: theme.selected }]}
              >
                <Icon
                  name={{ ios: 'plus', android: 'add' }}
                  color={theme.text}
                  size={24}
                />
              </Pressable>
            </View>
            <DaySelector
              {...{ today, anchor, earliest, selected, setWeek, choose }}
            />
            {day && (
              <Copy
                accessibilityLiveRegion="polite"
                style={{ color: theme.secondary, fontSize: 15 }}
              >
                {completed} habitude{completed > 1 ? 's' : ''} validée
                {completed > 1 ? 's' : ''} sur {eligible.length}
              </Copy>
            )}
            {historical && selected && (
              <Copy style={{ fontSize: 13, color: theme.secondary }}>
                Historique des habitudes actives
              </Copy>
            )}
          </MotionCard>
          <Animated.View
            {...gestures.panHandlers}
            style={{
              gap: 6,
              opacity: transition.interpolate({
                inputRange: [0, 1],
                outputRange: [0.65, 1],
              }),
              transform: [
                {
                  translateX: transition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [direction.current * 12, 0],
                  }),
                },
              ],
            }}
          >
            {!canRead ? (
              <View style={[s.panel, { backgroundColor: theme.surface }]}>
                <Copy>
                  Le journal nécessite les droits de lecture des habitudes, des
                  saisies et des statistiques.
                </Copy>
              </View>
            ) : error ? (
              <View
                style={[s.panel, { backgroundColor: theme.surface, gap: 12 }]}
              >
                <Copy accessibilityRole="alert" style={{ color: theme.error }}>
                  {errorMessage(error)}
                </Copy>
                <Button
                  onPress={() => {
                    void refresh()
                  }}
                >
                  Réessayer
                </Button>
              </View>
            ) : !day ? (
              <View
                style={[s.panel, { backgroundColor: theme.surface, gap: 12 }]}
              >
                <ActivityIndicator />
                <Copy>Chargement du journal…</Copy>
              </View>
            ) : (
              <>
                <JournalCard {...{ day, compact, canWrite }} />
                <RestingHabitsCard model={model} />
                <PendingHabitsCard
                  {...{
                    day,
                    historical,
                    dashboard,
                    history,
                    pending,
                    eligible,
                    blocked,
                    selected,
                    quickAction,
                    finishQuickAction,
                    notice,
                    refresh,
                    canWrite,
                    compact,
                  }}
                  canManageRest={model.canManageRest}
                  openHabitMenu={model.openHabitMenu}
                  restRemoving={model.restRemoving}
                />
              </>
            )}
          </Animated.View>
        </ScrollView>
      </ScrollViewport>
      <Dock />
    </TabFrame>
  )
}
