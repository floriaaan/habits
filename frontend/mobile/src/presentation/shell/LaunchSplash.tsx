import { MotionVisibility } from '../shared/motion/MotionVisibility'
import { LinearGradient } from 'expo-linear-gradient'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useDeviceInsets } from '../shared/layout/DeviceInsets'
import { deviceCornerRadius, useTheme } from '../shared/ui/native-ui'
import { splashFrames, type SplashCardFrames } from './splash-model'

export function LaunchSplash({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true),
    [shown, setShown] = useState(false)
  const [reduced, setReduced] = useState<boolean | null>(null)
  const progress = useSharedValue(0),
    opacity = useSharedValue(1)
  const { width, height } = useWindowDimensions(),
    insets = useDeviceInsets(),
    theme = useTheme()
  const finish = useCallback(() => {
    setVisible(false)
    void SplashScreen.hideAsync().catch(() => {})
  }, [])
  useEffect(() => {
    if (!visible) return
    const deadline = setTimeout(finish, 2500)
    return () => clearTimeout(deadline)
  }, [visible, finish])
  useEffect(() => {
    let active = true
    const fallback = setTimeout(() => {
      if (active) setReduced(true)
    }, 200)
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) {
          clearTimeout(fallback)
          setReduced(value)
        }
      })
      .catch(() => {
        if (active) {
          clearTimeout(fallback)
          setReduced(true)
        }
      })
    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    )
    return () => {
      active = false
      clearTimeout(fallback)
      listener.remove()
    }
  }, [])
  useEffect(() => {
    if (!visible || !shown || reduced === null) return
    if (reduced) {
      finish()
      return
    }
    progress.value = withTiming(1, {
      duration: 760,
      easing: Easing.inOut(Easing.cubic),
    })
    opacity.value = withDelay(
      760,
      withTiming(0, { duration: 190 }, (done) => {
        if (done) runOnJS(finish)()
      }),
    )
    return () => {
      cancelAnimation(progress)
      cancelAnimation(opacity)
    }
  }, [visible, shown, reduced, finish, progress, opacity])
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }))
  const frames = splashFrames(width, height, insets.bottom)
  const palettes = [
    [theme.surface, theme.surface] as const,
    theme.pink,
    theme.green,
    theme.blue,
    [
      theme.dark ? theme.canvas : '#ffffff',
      theme.dark ? theme.canvas : '#ffffff',
    ] as const,
  ]
  return (
    <>
      <MotionVisibility.Provider value={!visible}>
        {children}
      </MotionVisibility.Provider>
      {visible && (
        <Modal
          visible
          transparent
          animationType="none"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={finish}
          onShow={() => {
            setShown(true)
            void SplashScreen.hideAsync().catch(() => {})
          }}
        >
          <StatusBar hidden />
          <Animated.View
            accessibilityViewIsModal
            accessible
            accessibilityLabel="Habits démarre"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.canvas },
              fade,
            ]}
          >
            {frames.map((frame, index) => (
              <SplashCard
                key={index}
                frame={frame}
                index={index}
                colors={palettes[index]!}
                progress={progress}
                topInset={insets.top}
                radius={deviceCornerRadius(insets.top, width)}
                textColor={theme.text}
              />
            ))}
          </Animated.View>
        </Modal>
      )}
    </>
  )
}
function SplashCard({
  frame,
  index,
  colors,
  progress,
  topInset,
  radius,
  textColor,
}: {
  frame: SplashCardFrames
  index: number
  colors: readonly [string, string]
  progress: SharedValue<number>
  topInset: number
  radius: number
  textColor: string
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value,
      stops = [0, 0.45, 1]
    return {
      left: interpolate(p, stops, [frame.start.x, frame.middle.x, frame.end.x]),
      top: interpolate(p, stops, [frame.start.y, frame.middle.y, frame.end.y]),
      width: interpolate(p, stops, [
        frame.start.width,
        frame.middle.width,
        frame.end.width,
      ]),
      height: interpolate(p, stops, [
        frame.start.height,
        frame.middle.height,
        frame.end.height,
      ]),
      borderRadius: interpolate(p, stops, [4, 14, index === 4 ? radius : 26]),
      opacity:
        index === 0 || index === 4
          ? interpolate(p, [0, 0.25, 1], [0, 1, 1])
          : 1,
    }
  })
  const label = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3, 1], [0, 1, 1]),
    left: interpolate(progress.value, [0, 0.45, 1], [0, 48, 16]),
    top: interpolate(progress.value, [0, 0.45, 1], [0, 18, topInset + 12]),
  }))
  return (
    <Animated.View
      accessible={false}
      style={[
        { position: 'absolute', overflow: 'hidden', borderCurve: 'continuous' },
        style,
      ]}
    >
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
      {index === 0 && (
        <Animated.Text
          style={[
            {
              position: 'absolute',
              fontSize: 30,
              fontWeight: '700',
              letterSpacing: -0.6,
              color: textColor,
            },
            label,
          ]}
        >
          Habits
        </Animated.Text>
      )}
    </Animated.View>
  )
}
