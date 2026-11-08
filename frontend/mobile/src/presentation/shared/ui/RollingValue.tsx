import { useMotionVisible } from '../motion/MotionVisibility'
import { useIsFocused } from 'expo-router'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Copy } from './primitives'

const Values = createContext<Map<string, string> | null>(null)
export function RollingValuesProvider({ children }: { children: ReactNode }) {
  const values = useRef(new Map<string, string>()).current
  return <Values.Provider value={values}>{children}</Values.Provider>
}

// Only the glyphs roll inside clipped columns; the value's container stays in place.
export function RollingValue({
  value,
  id,
  style,
}: {
  id: string
  value: string | number
  style?: StyleProp<TextStyle>
}) {
  const values = useContext(Values)
  const previous = useRef(values?.get(id))
  const text = String(value),
    focused = useIsFocused(),
    visible = useMotionVisible(),
    { fontScale } = useWindowDimensions()
  useEffect(() => {
    if (visible && focused) values?.set(id, text)
  }, [values, id, text, visible, focused])
  const lineHeight = (StyleSheet.flatten(style)?.fontSize ?? 17) * 1.25
  if (!/\d/.test(text)) return <Copy style={style}>{text}</Copy>
  return (
    <View
      accessible
      accessibilityLabel={text}
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {Array.from(text).map((character, index) =>
        /\d/.test(character) ? (
          <RollingDigit
            key={index}
            digit={Number(character)}
            initialDigit={Number(
              previous.current?.[index]?.match(/\d/)?.[0] ?? 0,
            )}
            lineHeight={lineHeight}
            height={Math.ceil(lineHeight * fontScale)}
            style={style}
            focused={focused}
            visible={visible}
          />
        ) : (
          <Copy key={index} accessible={false} style={[style, { lineHeight }]}>
            {character}
          </Copy>
        ),
      )}
    </View>
  )
}
function RollingDigit({
  digit,
  initialDigit,
  lineHeight,
  height,
  style,
  focused,
  visible,
}: {
  digit: number
  initialDigit: number
  lineHeight: number
  height: number
  style?: StyleProp<TextStyle>
  focused: boolean
  visible: boolean
}) {
  const y = useSharedValue(-initialDigit * height)
  useEffect(() => {
    if (!visible || !focused) return
    y.value = withTiming(-digit * height, {
      duration: 480,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    })
  }, [digit, height, focused, visible, y])
  const motion = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }))
  const type = [
    style,
    { lineHeight, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
  ]
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, overflow: 'hidden' }}
    >
      <Copy style={[type, { opacity: 0 }]}>8</Copy>
      <Animated.View
        style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, motion]}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <View key={n} style={{ height, justifyContent: 'center' }}>
            <Copy style={type}>{n}</Copy>
          </View>
        ))}
      </Animated.View>
    </View>
  )
}
