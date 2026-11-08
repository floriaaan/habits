import Animated from 'react-native-reanimated'
import { useIsFocused } from 'expo-router'
import {
  collapseCompletedRow,
  localLayout,
} from '../../shared/motion/local-transitions'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { amount, habitProgress } from '../../shared/models/home-model'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Button, Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import { HabitIcon } from './today-visuals'
import { s } from './today.styles'
import type { TodayController } from './useTodayController'

type Props = Pick<
  TodayController,
  | 'day'
  | 'historical'
  | 'dashboard'
  | 'history'
  | 'pending'
  | 'eligible'
  | 'blocked'
  | 'selected'
  | 'quickAction'
  | 'finishQuickAction'
  | 'notice'
  | 'refresh'
  | 'canWrite'
> & { compact: boolean }
export function PendingHabitsCard({
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
}: Props) {
  const theme = useTheme(),
    focused = useIsFocused()
  if (!day) return null
  return (
    <MotionCard
      screen="/today"
      surfaceOrder={2}
      role="tertiary"
      colors={theme.green}
      style={s.panel}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          historical
            ? 'Actualiser le bilan du jour'
            : 'Actualiser encore aujourd’hui'
        }
        accessibilityState={{
          busy: dashboard.isRefetching || history.isRefetching,
          disabled: dashboard.isFetching || history.isFetching,
        }}
        disabled={dashboard.isFetching || history.isFetching}
        onPress={() => {
          void refresh()
        }}
        style={s.refreshHeading}
      >
        <Copy
          style={[
            s.sectionTitle,
            { color: theme.onPastel, marginBottom: 0, flex: 1 },
          ]}
        >
          {historical ? 'Bilan du jour' : 'Encore aujourd’hui'}
        </Copy>
        {dashboard.isRefetching || history.isRefetching ? (
          <ActivityIndicator color={theme.greenText} />
        ) : (
          <Icon
            name={{ ios: 'arrow.clockwise', android: 'refresh' }}
            color={theme.greenText}
            size={18}
          />
        )}
      </Pressable>
      {pending.length === 0 && (
        <Copy
          style={{ color: theme.greenText, fontSize: 15, paddingVertical: 16 }}
        >
          {day.unavailable.length
            ? 'Le bilan de ce jour est partiel.'
            : eligible.length
              ? 'Tous les objectifs sont atteints.'
              : 'Aucune habitude prévue pour ce jour.'}
        </Copy>
      )}
      {pending.map((item) => (
        <Animated.View
          key={item.habit.id}
          layout={localLayout}
          exiting={
            focused && item.completed && !historical
              ? collapseCompletedRow
              : undefined
          }
          style={[
            s.pending,
            compact && { flexDirection: 'column', alignItems: 'stretch' },
          ]}
        >
          <View style={[s.headerRow, { flex: 1 }]}>
            <HabitIcon item={item} />
            <View style={{ flex: 1, gap: 4 }}>
              <Copy style={[s.habitName, { color: theme.onPastel }]}>
                {item.habit.name}
              </Copy>
              <Copy style={{ color: theme.greenText, fontSize: 14 }}>
                {habitProgress(item)}
                {item.habit.period === 'weekly' ? ' · Cette semaine' : ''}
              </Copy>
            </View>
          </View>
          {!historical && (
            <Button
              accessibilityLabel={
                item.habit.kind === 'boolean'
                  ? 'Valider ' + item.habit.name
                  : 'Ajouter ' +
                    amount(item.presentation.step, item.habit.unit) +
                    ' à ' +
                    item.habit.name
              }
              disabled={
                blocked || !item.actionable || item.local_date !== selected
              }
              onPress={() => quickAction(item)}
              onFeedbackEnd={finishQuickAction}
              style={[s.quick, { paddingVertical: 10 }]}
            >
              {item.habit.unit === 'milliliters' ? (
                <Copy style={{ fontSize: 14 }}>
                  +{amount(item.presentation.step, item.habit.unit)}
                </Copy>
              ) : (
                <Icon
                  name={
                    item.habit.kind === 'boolean'
                      ? { ios: 'checkmark', android: 'check' }
                      : { ios: 'plus', android: 'add' }
                  }
                  color={theme.text}
                  size={20}
                />
              )}
            </Button>
          )}
        </Animated.View>
      ))}
      {!historical && !canWrite && (
        <Copy style={{ color: theme.greenText, fontSize: 14 }}>
          Votre accès est en lecture seule.
        </Copy>
      )}
      {day.unavailable.length > 0 && (
        <Copy style={{ color: theme.greenText, fontSize: 14 }}>
          Historique indisponible pour : {day.unavailable.join(', ')}. Ces
          habitudes ne sont pas comptées dans le bilan.
        </Copy>
      )}
      {!!notice && (
        <Copy
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={{ color: theme.greenText, fontSize: 15, marginTop: 12 }}
        >
          {notice}
        </Copy>
      )}
    </MotionCard>
  )
}
