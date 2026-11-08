import {
  MotionCard,
  useTabMotionScroll,
} from '../../shared/motion/TabCardMotion'
import { Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { errorMessage } from '../../../domain/api-error'
import { FormScrollView } from '../../shared/forms/FormScrollView'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { amount, categories } from '../../shared/models/home-model'
import {
  HabitMorphContent,
  useHabitMorph,
} from '../../shared/motion/HabitMorph'
import {
  Button,
  Copy,
  deviceCornerRadius,
  Icon,
  useTheme,
} from '../../shared/ui/native-ui'
import { s } from './activity.styles'
import { ActivityActions } from './ActivityActions'
import { ActivityChartCard } from './ActivityChartCard'
import { RecentEntriesCard } from './RecentEntriesCard'
import type { ActivityController } from './useActivityController'

export function ActivityView({
  id,
  morphParam,
  session,
  model,
}: {
  id: string
  morphParam?: string
  session: { scopes: readonly string[] }
  model: ActivityController
}) {
  const {
    query,
    item,
    statistics,
    entries,
    mutation,
    value,
    setValue,
    notice,
    editing,
    setEditing,
    period,
    setPeriod,
    blocked,
    days,
    maximum,
    total,
    paths,
    step,
    numeric,
    action,
    finishAction,
  } = model
  const theme = useTheme(),
    insets = useSafeAreaInsets(),
    { width } = useWindowDimensions()
  const screen = `/habit/${id}` as const
  const motionScroll = useTabMotionScroll(screen)
  const [actionsHeight, setActionsHeight] = useState(0)
  const morph = useHabitMorph()
  const card = [s.card, { backgroundColor: theme.surface }]
  const firstCard = [
    ...card,
    {
      paddingTop: insets.top + 8,
      borderTopLeftRadius: deviceCornerRadius(insets.top, width),
      borderTopRightRadius: deviceCornerRadius(insets.top, width),
    },
  ]
  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Retour"
      onPress={() => morph.back()}
      style={{
        minWidth: 48,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Icon
        name={{ ios: 'chevron.left', android: 'arrow_back' }}
        color={theme.text}
        size={22}
      />
    </Pressable>
  )
  return (
    <KeyboardScreen style={{ flex: 1, backgroundColor: theme.canvas }}>
      <Stack.Screen
        options={{
          headerShown: false,
          ...(morphParam === '1' ? { animation: 'none' as const } : {}),
        }}
      />
      <ScrollView
        onScroll={motionScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 6,
          gap: 6,
          paddingBottom:
            item && !query.error
              ? actionsHeight + 12
              : Math.max(insets.bottom, 12),
          maxWidth: 700,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {query.error ? (
          <MotionCard screen={screen} role="primary" style={firstCard}>
            {back}
            <Copy accessibilityRole="alert">{errorMessage(query.error)}</Copy>
            <Button onPress={() => query.refetch()}>Réessayer</Button>
          </MotionCard>
        ) : !item ? (
          <MotionCard screen={screen} role="primary" style={firstCard}>
            {back}
            <Copy>
              {query.isPending
                ? 'Chargement…'
                : 'Habitude indisponible avec cet accès.'}
            </Copy>
          </MotionCard>
        ) : (
          <>
            <MotionCard screen={screen} role="primary" style={firstCard}>
              <View style={s.row}>
                {back}
                <View style={{ flex: 1 }}>
                  <View collapsable={false}>
                    <HabitMorphContent item={item} />
                  </View>
                </View>
              </View>
              <Copy style={{ color: theme.secondary, fontSize: 13 }}>
                {categories[item.habit.category]} ·{' '}
                {item.habit.period === 'weekly'
                  ? 'Cette semaine'
                  : 'Aujourd’hui'}
              </Copy>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: Math.round(item.percent ?? 0),
                  text: `${amount(item.progress, item.habit.unit)} sur ${amount(item.target, item.habit.unit)}`,
                }}
                style={{
                  height: 7,
                  borderRadius: 4,
                  overflow: 'hidden',
                  backgroundColor: theme.selected,
                }}
              >
                <View
                  style={{
                    height: 7,
                    width: `${Math.max(0, Math.min(100, item.percent ?? 0))}%`,
                    backgroundColor: theme.dark ? '#ffb3d2' : '#c53978',
                  }}
                />
              </View>
            </MotionCard>
            <ActivityChartCard
              {...{
                item,
                period,
                setPeriod,
                statistics,
                total,
                paths,
                days,
                maximum,
              }}
            />
            <View style={[s.row, { alignItems: 'stretch', flexWrap: 'wrap' }]}>
              <MotionCard
                screen={screen}
                role="regularity"
                colors={theme.green}
                style={[s.card, { flex: 1, minWidth: 145 }]}
              >
                <Copy
                  accessibilityRole="header"
                  style={[s.heading, { color: theme.onPastel }]}
                >
                  Régularité
                </Copy>
                <Copy
                  style={{
                    fontSize: 24,
                    fontWeight: '600',
                    color: theme.onPastel,
                  }}
                >
                  {statistics.data
                    ? `${statistics.data.streak.current} jours`
                    : '—'}
                </Copy>
                <Copy style={{ fontSize: 13, color: theme.greenText }}>
                  de suite
                </Copy>
              </MotionCard>
              <MotionCard
                screen={screen}
                role="goal"
                surfaceOrder={1}
                style={[...card, { flex: 1, minWidth: 145 }]}
              >
                <Copy accessibilityRole="header" style={s.heading}>
                  Objectif
                </Copy>
                <Copy style={{ fontSize: 24, fontWeight: '600' }}>
                  {amount(item.target, item.habit.unit)}
                </Copy>
                <Copy style={{ fontSize: 13, color: theme.secondary }}>
                  {item.habit.period === 'weekly' ? 'par semaine' : 'par jour'}
                </Copy>
              </MotionCard>
            </View>
            <RecentEntriesCard
              item={item}
              entries={entries}
              canRead={session.scopes.includes('entries:read')}
            />
          </>
        )}
      </ScrollView>
      {item && !query.error && (
        <View
          pointerEvents="box-none"
          onLayout={(event) =>
            setActionsHeight(event.nativeEvent.layout.height)
          }
          style={{
            position: 'absolute',
            bottom: 6,
            width: '100%',
            maxWidth: 700,
            alignSelf: 'center',
            maxHeight: '60%',
            paddingHorizontal: 6,
          }}
        >
          <View
            style={{
              maxHeight: '100%',
              borderRadius: editing ? 16 : 26,
              borderBottomLeftRadius: editing
                ? 16
                : deviceCornerRadius(insets.top, width),
              borderBottomRightRadius: editing
                ? 16
                : deviceCornerRadius(insets.top, width),
              borderCurve: 'continuous',
              backgroundColor: theme.surface,
              overflow: 'hidden',
            }}
          >
            <FormScrollView
              style={{ flexGrow: 0 }}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustContentInsets={false}
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={{
                paddingBottom: Math.max(insets.bottom - 6, 6),
              }}
            >
              <ActivityActions
                {...{
                  item,
                  mutation,
                  value,
                  setValue,
                  notice,
                  editing,
                  setEditing,
                  blocked,
                  step,
                  numeric,
                  action,
                  finishAction,
                }}
                canWrite={session.scopes.includes('entries:write')}
              />
            </FormScrollView>
          </View>
        </View>
      )}
    </KeyboardScreen>
  )
}
