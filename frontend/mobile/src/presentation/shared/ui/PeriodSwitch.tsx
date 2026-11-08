import { useLayoutEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type LayoutRectangle } from 'react-native'
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Copy } from './primitives'
import { useTheme } from './theme'

type Period = 7 | 30
export function PeriodSwitch({
  value,
  onChange,
  variant = 'standard',
}: {
  value: Period
  onChange: (value: Period) => void
  variant?: 'standard' | 'compact' | 'water'
}) {
  const theme = useTheme(),
    compact = variant === 'compact',
    water = variant === 'water'
  const [rects, setRects] = useState<Partial<Record<Period, LayoutRectangle>>>(
    {},
  )
  const x = useSharedValue(0),
    width = useSharedValue(0),
    initialized = useRef(false)
  const selected = rects[value],
    inset = compact ? 2 : 0
  useLayoutEffect(() => {
    if (!selected) return
    const config = { duration: 150, reduceMotion: ReduceMotion.System }
    x.value = initialized.current
      ? withTiming(selected.x + inset, config)
      : selected.x + inset
    width.value = initialized.current
      ? withTiming(selected.width - inset * 2, config)
      : selected.width - inset * 2
    initialized.current = true
  }, [selected, inset, width, x])
  const pill = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: x.value }],
  }))
  const background = water ? '#1b2023' : compact ? theme.chip : theme.selected
  const selectedColor = water
    ? '#129ef4'
    : compact
      ? theme.selected
      : theme.chip
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: compact ? 0 : water ? 2 : 3,
        borderRadius: 24,
        ...(compact ? { flexShrink: 0 } : {}),
      }}
    >
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            top: compact ? 8 : 0,
            bottom: compact ? 8 : 0,
            backgroundColor: background,
            borderRadius: 24,
          },
        ]}
      />
      {selected && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: compact ? 10 : water ? 2 : 3,
              bottom: compact ? 10 : water ? 2 : 3,
              borderRadius: compact ? 15 : 22,
              backgroundColor: selectedColor,
            },
            pill,
          ]}
        />
      )}
      {([7, 30] as const).map((period) => (
        <Pressable
          key={period}
          accessibilityRole="tab"
          accessibilityLabel={
            period === 7
              ? 'Semaine, sept derniers jours'
              : 'Mois, trente derniers jours'
          }
          accessibilityState={{ selected: value === period }}
          onPress={() => onChange(period)}
          onLayout={(event) => {
            const layout = event.nativeEvent.layout
            setRects((previous) =>
              previous[period]?.x === layout.x &&
              previous[period]?.width === layout.width
                ? previous
                : { ...previous, [period]: layout },
            )
          }}
          style={{
            ...(variant === 'standard'
              ? { flex: 1 }
              : { paddingHorizontal: compact ? 11 : 12 }),
            minWidth: 48,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 22,
            backgroundColor:
              !selected && value === period ? selectedColor : 'transparent',
          }}
        >
          <Copy
            style={{
              fontSize: compact ? 12 : water ? 14 : 15,
              fontWeight:
                !compact && !water && value === period ? '600' : '400',
              color: water
                ? value === period
                  ? '#081c27'
                  : '#fff'
                : theme.text,
            }}
          >
            {period === 7 ? 'Semaine' : 'Mois'}
          </Copy>
        </Pressable>
      ))}
    </View>
  )
}
