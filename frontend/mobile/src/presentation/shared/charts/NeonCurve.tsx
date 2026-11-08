import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useIsFocused } from 'expo-router'
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg'

// Layered SVG strokes keep the glow native without a blur filter or bitmap.
function CurveLayer({ paths, color }: { paths: string[]; color: string }) {
  const id = 'neon' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <G>
      <Defs>
        <LinearGradient
          id={id}
          x1="0"
          y1="0"
          x2="0"
          y2="54"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={color} stopOpacity={0.24} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {paths.map((d, i) => {
        // smoothLinePaths emits M x y followed by cubic segments, one per gap-free run.
        const coordinates = d.split(' '),
          firstX = coordinates[1],
          lastX = coordinates.at(-2)
        return (
          <G key={i}>
            <Path
              d={`${d} L ${lastX} 54 L ${firstX} 54 Z`}
              fill={`url(#${id})`}
            />
            <Path
              d={d}
              transform="translate(0 1)"
              fill="none"
              stroke={color}
              strokeWidth={5}
              strokeOpacity={0.04}
              strokeLinecap="round"
            />
            <Path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={2.6}
              strokeOpacity={0.1}
              strokeLinecap="round"
            />
            <Path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={0.85}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </G>
        )
      })}
    </G>
  )
}

const AnimatedGroup = Animated.createAnimatedComponent(G)

export function NeonCurve({
  paths,
  color,
}: {
  paths: string[]
  color: string
}) {
  const signature = paths.join('|'),
    last = useRef({ signature, paths })
  const [previous, setPrevious] = useState<string[]>([])
  const focused = useIsFocused(),
    progress = useSharedValue(1)
  useLayoutEffect(() => {
    if (last.current.signature === signature) return
    setPrevious(focused ? last.current.paths : [])
    last.current = { signature, paths }
    progress.value = focused ? 0 : 1
    if (focused)
      progress.value = withTiming(1, {
        duration: 220,
        reduceMotion: ReduceMotion.System,
      })
  }, [signature, focused, paths, progress])
  const incoming = useAnimatedProps(() => ({ opacity: progress.value }))
  const outgoing = useAnimatedProps(() => ({ opacity: 1 - progress.value }))
  return (
    <G>
      {previous.length > 0 && (
        <AnimatedGroup animatedProps={outgoing}>
          <CurveLayer paths={previous} color={color} />
        </AnimatedGroup>
      )}
      <AnimatedGroup animatedProps={incoming}>
        <CurveLayer paths={paths} color={color} />
      </AnimatedGroup>
    </G>
  )
}
