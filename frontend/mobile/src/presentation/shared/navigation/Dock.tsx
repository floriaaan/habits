import { usePathname } from 'expo-router'
import { Platform, Pressable, View, useWindowDimensions } from 'react-native'
import { useDeviceInsets } from '../layout/DeviceInsets'
import { deviceCornerRadius } from '../layout/geometry'
import { dockHeight } from '../motion/tab-motion-model'
import { useTabCardNavigation } from '../motion/TabCardMotion'
import { Icon } from '../ui/primitives'
import { useTheme } from '../ui/theme'

export function Dock() {
  const theme = useTheme(),
    insets = useDeviceInsets(),
    path = usePathname(),
    { width } = useWindowDimensions()
  const navigate = useTabCardNavigation()
  const outerRadius = deviceCornerRadius(insets.top, width)
  const destinations = [
    {
      href: '/',
      label: 'Accueil',
      name: { ios: 'square.stack.3d.up.fill', android: 'stacks' },
    },
    {
      href: '/today',
      label: 'Aujourd’hui',
      name: { ios: 'calendar', android: 'calendar_today' },
    },
    {
      href: '/progress',
      label: 'Progression',
      name: { ios: 'chart.bar.xaxis', android: 'bar_chart' },
    },
    {
      href: '/profile',
      label: 'Profil',
      name: { ios: 'person.fill', android: 'person' },
    },
  ] as const
  // iOS owns the actual tab bar; this is its white card backdrop only.
  if (Platform.OS === 'ios')
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 6,
          right: 6,
          height: dockHeight(insets.bottom),
          backgroundColor: theme.dark ? '#0c1011' : '#ffffff',
          borderRadius: 28,
          borderBottomLeftRadius: outerRadius,
          borderBottomRightRadius: outerRadius,
          borderCurve: 'continuous',
        }}
      />
    )
  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 6,
        right: 6,
        backgroundColor: theme.surface,
        borderRadius: 28,
        borderBottomLeftRadius: outerRadius,
        borderBottomRightRadius: outerRadius,
        borderCurve: 'continuous',
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 16,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {destinations.map((item) => (
          <Pressable
            key={item.href}
            onPress={() => navigate(item.href, path)}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: path === item.href }}
            style={{
              minHeight: 48,
              minWidth: 48,
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 28,
              backgroundColor:
                path === item.href ? theme.selected : 'transparent',
            }}
          >
            <Icon name={item.name} color={theme.text} size={29} />
          </Pressable>
        ))}
      </View>
    </View>
  )
}
