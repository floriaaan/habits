import { LinearGradient } from 'expo-linear-gradient'
import {
  MotionCard,
  useTabCardNavigation,
  useTabMotionScroll,
} from '../../shared/motion/TabCardMotion'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useApp } from '../../../application/providers'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import {
  Copy,
  deviceCornerRadius,
  Icon,
  useTheme,
} from '../../shared/ui/native-ui'

export function WelcomeScreen() {
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { width } = useWindowDimensions(),
    { status } = useApp()
  const navigate = useTabCardNavigation()
  const motionScroll = useTabMotionScroll('/')
  const radius = deviceCornerRadius(insets.top, width),
    restoring = status === 'restoring'
  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <View style={styles.frame}>
        <ScrollView
          onScroll={motionScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ flexGrow: 1, padding: 6 }}
        >
          <MotionCard
            screen="/"
            role="primary"
            style={[
              styles.main,
              {
                backgroundColor: theme.surface,
                paddingTop: insets.top + 22,
                borderTopLeftRadius: radius,
                borderTopRightRadius: radius,
                borderCurve: 'continuous',
              },
            ]}
          >
            <Copy style={styles.brand}>Habits</Copy>
            <View style={{ gap: 12 }}>
              <Copy accessibilityRole="header" style={styles.title}>
                Faites place à vos habitudes.
              </Copy>
              <Copy style={{ color: theme.secondary, fontSize: 16 }}>
                Un geste aujourd’hui. Un rythme qui dure.
              </Copy>
            </View>
            <WelcomeIllustration />
            <Copy style={{ color: theme.secondary, fontSize: 14 }}>
              Commencez simplement, ajustez au fil des jours.
            </Copy>
          </MotionCard>
        </ScrollView>
        <MotionCard
          screen="/"
          role="welcome-footer"
          surfaceOrder={1}
          style={[
            styles.footer,
            {
              backgroundColor: theme.surface,
              borderBottomLeftRadius: radius,
              borderBottomRightRadius: radius,
              borderCurve: 'continuous',
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: restoring, busy: restoring }}
            disabled={restoring}
            onPress={() => navigate('/login', '/')}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: theme.dark ? theme.accent : '#39770b',
                opacity: restoring ? 0.6 : pressed ? 0.7 : 1,
              },
            ]}
          >
            {restoring && (
              <ActivityIndicator color={theme.dark ? '#101b08' : '#fff'} />
            )}
            <Copy
              style={{
                color: theme.dark ? '#101b08' : '#fff',
                fontSize: 17,
                fontWeight: '600',
              }}
            >
              Se connecter
            </Copy>
          </Pressable>
        </MotionCard>
      </View>
    </View>
  )
}
function WelcomeIllustration() {
  const theme = useTheme()
  const tiles = [
    {
      colors: theme.pink,
      ink: theme.pinkText,
      top: 0,
      left: '10%' as const,
      icon: { ios: 'book', android: 'menu_book' } as const,
    },
    {
      colors: theme.blue,
      ink: theme.blueText,
      top: 68,
      left: '16%' as const,
      icon: null,
    },
    {
      colors: theme.green,
      ink: theme.greenText,
      top: 136,
      left: '22%' as const,
      icon: { ios: 'figure.run', android: 'directions_run' } as const,
    },
  ]
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.illustration}
    >
      <View
        style={{
          position: 'absolute',
          left: '4%',
          top: 32,
          bottom: 32,
          width: 1,
          backgroundColor: theme.selected,
        }}
      />
      {tiles.map((tile, index) => (
        <View key={index}>
          <View
            style={{
              position: 'absolute',
              left: '4%',
              marginLeft: -4,
              top: tile.top + 30,
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: tile.colors[1],
            }}
          />
          <LinearGradient
            colors={tile.colors}
            style={[styles.tile, { top: tile.top, left: tile.left }]}
          >
            {tile.icon ? (
              <Icon name={tile.icon} color={tile.ink} size={34} />
            ) : (
              <Svg width={34} height={38} viewBox="0 0 36 42">
                <Path
                  d="M4 3 H32 L27 38 H9 Z"
                  fill="none"
                  stroke={tile.ink}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
                <Path
                  d="M7 18 Q14 14 20 18 Q26 21 29 17 L26 36 H10 Z"
                  fill={tile.ink}
                  opacity={0.4}
                />
              </Svg>
            )}
            <View style={{ flex: 1, gap: 8 }}>
              <View
                style={{
                  height: 8,
                  width: '88%',
                  borderRadius: 5,
                  backgroundColor: tile.ink,
                  opacity: 0.25,
                }}
              />
              <View
                style={{
                  height: 8,
                  width: '56%',
                  borderRadius: 5,
                  backgroundColor: tile.ink,
                  opacity: 0.25,
                }}
              />
            </View>
          </LinearGradient>
        </View>
      ))}
    </View>
  )
}
const styles = StyleSheet.create({
  frame: { flex: 1, width: '100%', maxWidth: 700, alignSelf: 'center' },
  main: {
    flex: 1,
    padding: 22,
    borderRadius: 26,
    gap: 28,
    justifyContent: 'space-between',
  },
  brand: { fontSize: 23, fontWeight: '600', letterSpacing: -0.4 },
  title: { fontSize: 26, fontWeight: '600', letterSpacing: -0.5 },
  illustration: {
    height: 210,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  tile: {
    position: 'absolute',
    width: '78%',
    height: 74,
    borderRadius: 22,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  footer: { marginHorizontal: 6, borderRadius: 28, padding: 20 },
  button: {
    minHeight: 48,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
})
