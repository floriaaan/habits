import { categoryColor } from '../../shared/ui/category-colors'
import { RollingValue } from '../../shared/ui/RollingValue'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native'
import { errorMessage } from '../../../domain/api-error'
import type { Category } from '../../../domain/models'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { TabFrame } from '../../shared/layout/TabFrame'
import { PullToRefresh } from '../../shared/layout/PullToRefresh'
import { categories, percent } from '../../shared/models/home-model'
import { HabitMorphLink } from '../../shared/motion/HabitMorph'
import {
  MotionCard,
  useTabCardNavigation,
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
  ui,
  useTheme,
} from '../../shared/ui/native-ui'

import { s } from './home.styles'
import { ProgressCard } from './ProgressCard'
import { RegularityCard } from './RegularityCard'
import type { HomeController } from './useHomeController'
import { WaterCard } from './WaterCard'

export function HomeView({ model }: { model: HomeController }) {
  const {
    allowed,
    query,
    category,
    setCategory,
    setPage,
    data,
    all,
    count,
    currentPage,
    visible,
    water,
    isDemo,
    canWrite,
  } = model
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { height, fontScale, width } = useWindowDimensions()
  const navigate = useTabCardNavigation()
  const motionScroll = useTabMotionScroll('/')
  const overscroll = useRef(new Animated.Value(0)).current
  const [largeText, setLargeText] = useState(false),
    [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const compact = width < 380 || fontScale > 1.2 || largeText
  const cardSpace = Math.max(
    0,
    (viewportHeight ?? height) - dockHeight(insets.bottom) - 24,
  )
  return (
    <TabFrame>
      <ScrollViewport>
        <Animated.ScrollView
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: overscroll } } }],
            { useNativeDriver: true, listener: motionScroll },
          )}
          onLayout={(event) =>
            setViewportHeight(event.nativeEvent.layout.height)
          }
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
            paddingBottom: dockHeight(insets.bottom) + 6,
            gap: 6,
            flexGrow: 1,
          }}
        >
          <MotionCard
            screen="/"
            role="primary"
            style={[
              s.top,
              {
                backgroundColor: theme.surface,
                borderTopLeftRadius: deviceCornerRadius(insets.top, width),
                borderTopRightRadius: deviceCornerRadius(insets.top, width),
                borderCurve: 'continuous',
                paddingTop: insets.top + 12,
                minHeight: width > 700 ? 360 : cardSpace * 0.53,
              },
            ]}
          >
            <View
              style={[
                ui.row,
                {
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  ...(compact
                    ? ({
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                      } as const)
                    : {}),
                },
              ]}
            >
              <View style={ui.row}>
                <Copy
                  accessibilityRole="header"
                  onTextLayout={(event) =>
                    setLargeText((event.nativeEvent.lines[0]?.height ?? 0) > 51)
                  }
                  style={s.title}
                >
                  Habits
                </Copy>
                {isDemo && (
                  <Copy style={{ fontSize: 11, color: theme.secondary }}>
                    DÉMO
                  </Copy>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${data?.streak_91_days.current ?? 0} jours de suite. Voir la progression`}
                onPress={() => navigate('/progress', '/', 'regularity')}
                style={s.streak}
              >
                <Icon
                  name={{ ios: 'flame.fill', android: 'local_fire_department' }}
                  size={24}
                  color="#a46500"
                />
                <RollingValue
                  id="home.streak"
                  style={{ fontSize: 22, color: '#805000' }}
                  value={data?.streak_91_days.current ?? '—'}
                />
              </Pressable>
            </View>
            <View
              style={[s.categories, compact && { flexDirection: 'column' }]}
            >
              {(Object.keys(categories) as Category[]).map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${categories[key]}, ${percent(data?.groups.find((g) => g.category === key)?.percent)}`}
                  accessibilityState={{ selected: category === key }}
                  onPress={() => {
                    setCategory(category === key ? null : key)
                    setPage(0)
                  }}
                  style={({ pressed }) => [
                    s.category,
                    {
                      backgroundColor:
                        category === key
                          ? categoryColor(key, theme.dark).tint
                          : theme.chip,
                      opacity: pressed ? 0.65 : 1,
                    },
                    compact && {
                      flex: 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    },
                  ]}
                >
                  <Copy
                    style={{
                      fontSize: 12,
                      marginBottom: 3,
                      color: categoryColor(key, theme.dark).ink,
                    }}
                  >
                    {categories[key]}
                  </Copy>
                  <RollingValue
                    id={'home.category.' + key}
                    style={{
                      fontSize: 20,
                      fontWeight: '600',
                      fontVariant: ['tabular-nums'],
                      color:
                        data?.groups.find((g) => g.category === key)
                          ?.percent === 100
                          ? categoryColor(key, theme.dark).ink
                          : theme.text,
                    }}
                    value={percent(
                      data?.groups.find((g) => g.category === key)?.percent,
                    )}
                  />
                </Pressable>
              ))}
            </View>
            {!allowed && (
              <Copy style={s.state}>
                Cet accès nécessite les droits de lecture des habitudes et
                statistiques. Modifiez les droits du token ou utilisez les
                outils du profil.
              </Copy>
            )}
            {query.isPending && allowed && (
              <View style={s.state}>
                <ActivityIndicator />
                <Copy>Chargement des habitudes…</Copy>
              </View>
            )}
            {query.error && (
              <View style={s.state}>
                <Copy accessibilityRole="alert" style={{ color: theme.error }}>
                  {errorMessage(query.error)}
                </Copy>
                <Button onPress={() => query.refetch()}>Réessayer</Button>
              </View>
            )}
            {data && !query.error && (
              <View style={{ flex: 1, paddingTop: 8, gap: 2 }}>
                {visible.map((item) => (
                  <HabitMorphLink key={item.habit.id} item={item} />
                ))}
                {!visible.length && (
                  <Copy style={[s.state, { color: theme.secondary }]}>
                    {all.length
                      ? 'Aucune habitude dans cette catégorie.'
                      : 'Votre journée commence ici. Ajoutez votre première habitude.'}
                  </Copy>
                )}
              </View>
            )}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 0,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {count > 1 && (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Habitudes précédentes"
                      disabled={currentPage === 0}
                      onPress={() => setPage(currentPage - 1)}
                      style={{
                        width: 44,
                        height: 48,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: currentPage === 0 ? 0.3 : 1,
                      }}
                    >
                      <Icon
                        name={{ ios: 'chevron.left', android: 'chevron_left' }}
                        color={theme.secondary}
                        size={16}
                      />
                    </Pressable>
                    <Copy style={{ fontSize: 12, color: theme.secondary }}>
                      {currentPage + 1} / {count}
                    </Copy>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Habitudes suivantes"
                      disabled={currentPage === count - 1}
                      onPress={() => setPage(currentPage + 1)}
                      style={{
                        width: 44,
                        height: 48,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: currentPage === count - 1 ? 0.3 : 1,
                      }}
                    >
                      <Icon
                        name={{
                          ios: 'chevron.right',
                          android: 'chevron_right',
                        }}
                        color={theme.secondary}
                        size={16}
                      />
                    </Pressable>
                  </>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ajouter une habitude"
                disabled={!canWrite}
                onPress={() => router.push('/new')}
                style={({ pressed }) => [
                  s.add,
                  {
                    backgroundColor: theme.chip,
                    opacity: !canWrite ? 0.45 : pressed ? 0.6 : 1,
                  },
                ]}
              >
                <View style={s.plus}>
                  <Icon
                    name={{ ios: 'plus', android: 'add' }}
                    color="#fff"
                    size={25}
                  />
                </View>
                <Copy style={{ fontSize: 19, fontWeight: '600' }}>Ajouter</Copy>
              </Pressable>
            </View>
          </MotionCard>
          {data && (
            <>
              <View style={[s.middle, compact && { flexDirection: 'column' }]}>
                <ProgressCard
                  onPress={() => navigate('/progress', '/', 'overview')}
                  data={data}
                  height={Math.max(154, cardSpace * 0.25)}
                />
                <RegularityCard
                  onPress={() => navigate('/progress', '/', 'regularity')}
                  data={data}
                  height={Math.max(154, cardSpace * 0.25)}
                />
              </View>
              <WaterCard
                item={water}
                compact={compact}
                height={Math.max(156, cardSpace * 0.22)}
              />
            </>
          )}
        </Animated.ScrollView>
      </ScrollViewport>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          top: insets.top + 20,
          left: 20,
          right: 20,
          alignItems: 'center',
          gap: 6,
          opacity: overscroll.interpolate({
            inputRange: [-(insets.top + 140), -(insets.top + 96), 0],
            outputRange: [1, 0, 0],
            extrapolate: 'clamp',
          }),
        }}
      >
        <Icon
          name={{ ios: 'sparkles', android: 'auto_awesome' }}
          color="#a3d55c"
          size={20}
        />
        <Copy style={{ color: '#c2c9c6', fontSize: 13 }}>
          Même les habitudes prennent une pause.
        </Copy>
      </Animated.View>
      <Dock />
    </TabFrame>
  )
}
