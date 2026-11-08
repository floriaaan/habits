import Reanimated, {
  ReduceMotion,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { useIsFocused } from 'expo-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { buttonOutcome } from './button-outcome'
import { Copy, Icon } from './primitives'
import { useTheme } from './theme'

type Phase = 'idle' | 'pending' | 'success' | 'error'
type Outcome = 'success' | 'error'
export interface ButtonProps {
  children: ReactNode
  onPress: () => unknown
  disabled?: boolean
  loading?: boolean
  feedback?: Phase
  tone?: 'normal' | 'danger'
  variant?: 'normal' | 'primary' | 'accent'
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  onFeedbackEnd?: (outcome: Outcome) => void
}

export function Button({
  children,
  onPress,
  disabled,
  loading,
  feedback,
  tone = 'normal',
  variant = 'normal',
  accessibilityLabel,
  style,
  onFeedbackEnd,
}: ButtonProps) {
  const theme = useTheme(),
    [phase, setPhase] = useState<Phase>('idle')
  const locked = useRef(false),
    mounted = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callback = useRef(onFeedbackEnd)
  callback.current = onFeedbackEnd
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  const shown = feedback ?? (loading ? 'pending' : phase)
  const label =
    accessibilityLabel ?? (typeof children === 'string' ? children : 'Action')
  function finish(outcome: Outcome) {
    if (!mounted.current) return
    setPhase(outcome)
    AccessibilityInfo.announceForAccessibility(
      label + (outcome === 'success' ? ', réussi' : ', échec'),
    )
    timer.current = setTimeout(() => {
      if (!mounted.current) return
      locked.current = false
      setPhase('idle')
      callback.current?.(outcome)
    }, 850)
  }
  useEffect(() => {
    if (feedback === 'success' || feedback === 'error') finish(feedback)
  }, [feedback])
  function press() {
    if (locked.current || disabled || loading) return
    locked.current = true
    try {
      const result = onPress()
      if (feedback !== undefined) {
        locked.current = false
        void Promise.resolve(result).catch(() => finish('error'))
        return
      }
      if (
        result &&
        typeof (result as PromiseLike<unknown>).then === 'function'
      ) {
        setPhase('pending')
        void buttonOutcome(Promise.resolve(result)).then(finish)
      } else if (typeof result === 'boolean')
        finish(result ? 'success' : 'error')
      else locked.current = false
    } catch {
      finish('error')
    }
  }
  const background =
    shown === 'success'
      ? theme.successSurface
      : shown === 'error'
        ? theme.errorSurface
        : variant === 'primary'
          ? tone === 'danger'
            ? theme.error
            : theme.text
          : variant === 'accent'
            ? theme.dark
              ? theme.accent
              : '#39770b'
            : theme.selected
  const ink =
    shown === 'success'
      ? theme.success
      : shown === 'error'
        ? theme.error
        : variant === 'primary'
          ? theme.surface
          : variant === 'accent'
            ? theme.dark
              ? '#101b08'
              : '#fff'
            : tone === 'danger'
              ? theme.error
              : theme.text
  const animatedColor = useAnimatedStyle(
    () => ({
      backgroundColor: withTiming(background, {
        duration: 160,
        reduceMotion: ReduceMotion.System,
      }),
    }),
    [background],
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled: !!disabled || shown !== 'idle',
        busy: shown === 'pending',
      }}
      disabled={disabled || shown !== 'idle'}
      onPress={press}
      style={({ pressed }: { pressed: boolean }) => [
        {
          backgroundColor: background,
          opacity: disabled && shown === 'idle' ? 0.45 : pressed ? 0.65 : 1,
          borderRadius: 16,
          overflow: 'hidden',
          padding: 14,
          minHeight: 48,
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Reanimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, animatedColor]}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ opacity: shown === 'idle' ? 1 : 0 }}
      >
        {typeof children === 'string' ? (
          <Copy style={{ fontWeight: '600', textAlign: 'center', color: ink }}>
            {children}
          </Copy>
        ) : (
          children
        )}
      </View>
      {shown !== 'idle' && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          <ButtonFeedback phase={shown} color={ink} />
        </View>
      )}
    </Pressable>
  )
}

export function ButtonFeedback({
  phase,
  color,
}: {
  phase: Exclude<Phase, 'idle'>
  color: string
}) {
  const progress = useRef(new Animated.Value(0)).current,
    focused = useIsFocused()
  const [reduced, setReduced] = useState(true),
    [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value)
      })
      .catch(() => {})
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    )
    const lifecycle = AppState.addEventListener('change', (value) =>
      setActive(value === 'active'),
    )
    return () => {
      mounted = false
      motion.remove()
      lifecycle.remove()
    }
  }, [])
  useEffect(() => {
    progress.stopAnimation()
    progress.setValue(reduced ? 1 : 0)
    if (reduced || !focused || !active) return
    const animation =
      phase === 'pending'
        ? Animated.loop(
            Animated.sequence([
              Animated.timing(progress, {
                toValue: 1,
                duration: 550,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(progress, {
                toValue: 0,
                duration: 550,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          )
        : Animated.timing(progress, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
    animation.start()
    return () => animation.stop()
  }, [phase, reduced, focused, active, progress])
  if (phase === 'pending')
    return (
      <View
        accessible={false}
        style={{ width: 64, height: 5, borderRadius: 3, overflow: 'hidden' }}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: color, opacity: 0.2 },
          ]}
        />
        <Animated.View
          style={{
            width: 22,
            height: 5,
            borderRadius: 3,
            backgroundColor: color,
            transform: [
              {
                translateX: reduced
                  ? 21
                  : progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 42],
                    }),
              },
            ],
          }}
        />
      </View>
    )
  return (
    <Animated.View
      accessible={false}
      style={{
        opacity: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.4, 1],
        }),
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.8, 1],
            }),
          },
        ],
      }}
    >
      <Icon
        name={
          phase === 'success'
            ? { ios: 'checkmark', android: 'check' }
            : { ios: 'xmark', android: 'close' }
        }
        size={23}
        color={color}
      />
    </Animated.View>
  )
}
