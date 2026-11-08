import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient'
import { router, useIsFocused, usePathname } from 'expo-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentClass,
  type ComponentRef,
  type ReactNode,
} from 'react'
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  measure as measureNative,
  ReduceMotion,
  withTiming,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { useApp } from '../../../application/providers'
import { useDeviceInsets } from '../layout/DeviceInsets'
import type { MorphRect } from './morph-geometry'
import { cardLayout } from './card-layout'
import {
  cardMotionKey,
  cardResizePhase,
  matchingCardSource,
  cardStartGeometry,
  pendingCardSize,
  dockHeight,
  scrolledVisibleCardRect,
  visibleCardRect,
  type TabPath,
  type AcceptedCardResize,
} from './tab-motion-model'

type NativeView = ComponentRef<typeof View>
// 0.3.2's legacy NativeMethods mixin loses the React class shape in TS 6.
// The runtime export is a React.Component; retain its declared props.
const CardMask = MaskedView as unknown as ComponentClass<
  ConstructorParameters<typeof MaskedView>[0]
>
interface Transition {
  expiresAt: number
  id: number
  destination: TabPath
  from: Record<string, MorphRect>
  to: Record<string, MorphRect>
}
interface MotionContext {
  transition: SharedValue<Transition | null>
  reduceMotion: boolean
  register: (screen: TabPath, role: string, node: NativeView | null) => void
  navigate: (
    destination: TabPath,
    source: string,
    section?: 'overview' | 'regularity',
  ) => void
  measure: (
    screen: TabPath,
    key: string,
    node: NativeView,
    layoutHeight: number,
  ) => void
  scroll: (screen: TabPath, y: number) => void
  prepare: (destination: TabPath, source: string, resize?: boolean) => void
}
const Context = createContext<MotionContext | null>(null)

export function TabCardMotionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const previousPath = useRef(pathname)
  const [transition, setTransition] = useState<Transition | null>(null)
  const uiTransition = useSharedValue<Transition | null>(null)
  function publishTransition(value: Transition | null) {
    // Publish before navigation, including to mounted, unfocused native tabs.
    uiTransition.value = value
    setTransition(value)
  }
  const [reduceMotion, setReduceMotion] = useState(true)
  const cached = useRef(new Map<TabPath, Map<string, MorphRect>>()),
    offsets = useRef(new Map<TabPath, number>())
  const nodes = useRef(new Map<TabPath, Map<string, NativeView>>())
  const sequence = useRef(0),
    busy = useRef(false),
    reduced = useRef(true),
    mounted = useRef(true)
  const { width, height } = useWindowDimensions(),
    { status } = useApp(),
    insets = useDeviceInsets()
  useEffect(() => {
    mounted.current = true
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted.current) {
          reduced.current = value
          setReduceMotion(value)
        }
      })
      .catch(() => {})
    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        reduced.current = value
        setReduceMotion(value)
        if (value) publishTransition(null)
      },
    )
    return () => {
      mounted.current = false
      sequence.current++
      listener.remove()
    }
  }, [])
  useEffect(() => {
    if (status !== 'authenticated') {
      sequence.current++
      busy.current = false
      publishTransition(null)
    }
  }, [status])
  const register = useCallback(
    (screen: TabPath, role: string, node: NativeView | null) => {
      let cards = nodes.current.get(screen)
      if (!cards) {
        cards = new Map()
        nodes.current.set(screen, cards)
      }
      if (node) cards.set(role, node)
      else {
        cards.delete(role)
        cached.current.get(screen)?.delete(role)
      }
    },
    [],
  )
  const measure = useCallback(
    (screen: TabPath, key: string, node: NativeView, layoutHeight: number) => {
      const offset = offsets.current.get(screen) ?? 0
      try {
        node.measureInWindow((x, y, width, height) => {
          if (!mounted.current || nodes.current.get(screen)?.get(key) !== node)
            return
          let cards = cached.current.get(screen)
          if (!cards) {
            cards = new Map()
            cached.current.set(screen, cards)
          }
          cards.set(key, {
            x,
            y: y + offset,
            width,
            height: layoutHeight || height,
          })
        })
      } catch {
        /* Unmeasured cards remain still. */
      }
    },
    [],
  )
  function destinationSnapshot(screen: TabPath) {
    const result: Record<string, MorphRect> = {}
    for (const [key, rect] of cached.current.get(screen) ?? []) {
      const visible = scrolledVisibleCardRect(
        rect,
        offsets.current.get(screen) ?? 0,
        width,
        height - dockHeight(insets.bottom),
      )
      if (visible) result[key] = visible
    }
    return result
  }
  function prepare(destination: TabPath, source: string, resize = false) {
    if (destination === source && !resize) return
    const id = ++sequence.current
    busy.current = false
    if (reduced.current) {
      publishTransition(null)
      return
    }
    const from: Record<string, MorphRect> = {},
      offset = offsets.current.get(source as TabPath) ?? 0
    for (const [key, rect] of cached.current.get(source as TabPath) ?? []) {
      const visible = scrolledVisibleCardRect(
        rect,
        offset,
        width,
        height - dockHeight(insets.bottom),
      )
      if (visible) from[key] = visible
    }
    // Synchronous snapshot: native selection never waits for a measurement callback.
    publishTransition({
      id,
      destination,
      from,
      to: destinationSnapshot(destination),
      expiresAt: Date.now() + 800,
    })
  }
  useLayoutEffect(() => {
    const previous = previousPath.current
    previousPath.current = pathname
    if (
      previous !== pathname &&
      !(
        transition?.destination === pathname &&
        transition.expiresAt > Date.now()
      )
    )
      prepare(pathname as TabPath, previous)
  }, [pathname])
  async function navigate(
    destination: TabPath,
    source: string,
    section?: 'overview' | 'regularity',
  ) {
    if (source === destination || busy.current) return
    const target =
      destination === '/progress'
        ? ({
            pathname: destination,
            params: { section: section ?? 'overview' },
          } as const)
        : destination
    const id = ++sequence.current
    if (reduced.current) {
      publishTransition(null)
      router.navigate(target)
      return
    }
    busy.current = true
    const from: Record<string, MorphRect> = {}
    await Promise.all(
      [...(nodes.current.get(source as TabPath) ?? [])].map(
        ([role, node]) =>
          new Promise<void>((resolve) => {
            let done = false
            const finish = (rect?: MorphRect) => {
              if (done) return
              done = true
              clearTimeout(timeout)
              if (rect) {
                const visible = visibleCardRect(
                  rect,
                  width,
                  height - dockHeight(insets.bottom),
                )
                if (visible) from[role] = visible
              }
              resolve()
            }
            const timeout = setTimeout(() => finish(), 120)
            try {
              node.measureInWindow((x, y, width, height) =>
                finish({ x, y, width, height }),
              )
            } catch {
              finish()
            }
          }),
      ),
    )
    if (!mounted.current || id !== sequence.current) return
    busy.current = false
    publishTransition({
      id,
      destination,
      from,
      to: destinationSnapshot(destination),
      expiresAt: Date.now() + 800,
    })
    router.navigate(target)
  }
  return (
    <Context.Provider
      value={{
        transition: uiTransition,
        reduceMotion,
        register,
        navigate,
        measure,
        prepare,
        scroll: (screen, y) => {
          offsets.current.set(screen, y)
        },
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useTabCardNavigation() {
  const motion = useContext(Context)
  return (
    destination: TabPath,
    source: string,
    section?: 'overview' | 'regularity',
  ) =>
    motion
      ? motion.navigate(destination, source, section)
      : router.navigate(
          destination === '/progress'
            ? {
                pathname: destination,
                params: { section: section ?? 'overview' },
              }
            : destination,
        )
}
export function usePrepareNativeTabMotion() {
  const motion = useContext(Context)
  return (destination: TabPath, source: string) =>
    motion?.prepare(destination, source)
}
// Local form steps share a route but can change the visible card dimensions.
export function usePrepareCardResize(screen: TabPath) {
  const motion = useContext(Context)
  return () => motion?.prepare(screen, screen, true)
}
export function useTabMotionScroll(screen: TabPath) {
  const motion = useContext(Context)
  return (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    motion?.scroll(screen, event.nativeEvent.contentOffset.y)
}
interface MotionCardProps extends Omit<ViewProps, 'role'> {
  screen: TabPath
  role: string
  surfaceOrder?: number
  colors?: LinearGradientProps['colors']
}
export function MotionCard({
  screen,
  role,
  surfaceOrder = 0,
  colors,
  children,
  ...props
}: MotionCardProps) {
  const motion = useContext(Context),
    focused = useIsFocused()
  const { width, height } = useWindowDimensions(),
    insets = useDeviceInsets()
  const visibleHeight = height - dockHeight(insets.bottom)
  const register = motion?.register,
    nodeRef = useAnimatedRef<NativeView>()
  const layoutHeight = useRef(0)
  const measure = motion?.measure
  const sharedKey = cardMotionKey(role, colors)
  const capture = useCallback(
    (node: NativeView | null) => {
      nodeRef(node)
      register?.(screen, sharedKey, node)
    },
    [register, screen, sharedKey, nodeRef],
  )
  const size = useSharedValue({ width: 0, height: 0 })
  const animatedWidth = useSharedValue(0)
  const animatedHeight = useSharedValue(0)
  const accepted = useSharedValue<AcceptedCardResize | null>(null)
  const ready = useSharedValue(0)
  const isFocused = useSharedValue(focused)
  const reduced = useSharedValue(motion?.reduceMotion !== false)
  const transition = motion?.transition
  const request = useDerivedValue(() => {
    const current = transition?.value
    const destination = current?.destination === screen ? current : null
    return {
      focused: isFocused.value,
      reduced: reduced.value,
      transition: destination,
      source: destination
        ? (matchingCardSource(
            sharedKey,
            destination.from,
            destination.to,
            surfaceOrder,
          ) ?? null)
        : null,
    }
  })

  useLayoutEffect(() => {
    isFocused.value = focused
    reduced.value = motion?.reduceMotion !== false
  }, [focused, motion?.reduceMotion, isFocused, reduced])

  useLayoutEffect(() => {
    // Fabric measures synchronously here, before paint. Do not wait for the
    // JS onLayout event to give a newly mounted surface its starting size.
    nodeRef.current?.measureInWindow((_x, _y, width, height) => {
      if (width > 0 && height > 0) size.value = { width, height }
    })
  }, [nodeRef, size, width])

  useEffect(() => {
    if (!focused || !measure) return
    // A native tab may finish attaching after its first layout notification.
    const frame = requestAnimationFrame(() => {
      if (nodeRef.current) {
        measure(screen, sharedKey, nodeRef.current, layoutHeight.current)
        ready.value += 1
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [
    focused,
    measure,
    screen,
    sharedKey,
    width,
    visibleHeight,
    nodeRef,
    ready,
  ])

  // One UI-thread owner for the entire tween. Layout updates retarget the
  // currently displayed dimensions; they never replace an interpolation endpoint.
  useAnimatedReaction(
    () => ({ request: request.value, size: size.value, ready: ready.value }),
    (next, previous) => {
      const { request: intent, size: target } = next
      if (!intent.focused) {
        cancelAnimation(animatedWidth)
        cancelAnimation(animatedHeight)
        return
      }
      if (target.width <= 0 || target.height <= 0) return
      const phase =
        intent.source && !intent.reduced
          ? cardResizePhase(intent.transition, accepted.value, Date.now())
          : 'idle'
      if (phase === 'idle') {
        animatedWidth.value = target.width
        animatedHeight.value = target.height
        return
      }
      if (phase === 'start') {
        const measured = measureNative(nodeRef)
        if (!measured) return // Retry on layout / attachment, not mid-animation.
        const visible = visibleCardRect(
          {
            x: measured.pageX,
            y: measured.pageY,
            width: measured.width,
            height: measured.height,
          },
          width,
          visibleHeight,
        )
        accepted.value = { id: intent.transition!.id, animated: !!visible }
        if (!visible) {
          animatedWidth.value = target.width
          animatedHeight.value = target.height
          return
        }
        const start = cardStartGeometry(intent.source!, {
          targetOriginX: 0,
          targetOriginY: 0,
          targetGlobalOriginX: measured.pageX,
          targetGlobalOriginY: measured.pageY,
          targetWidth: target.width,
          targetHeight: target.height,
        })
        animatedWidth.value = start.width
        animatedHeight.value = start.height
      }
      const config = {
        duration: phase === 'start' ? 340 : 180,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }
      // Same-size layout notifications and rerenders must not replay the tween.
      const resuming = !previous?.request.focused
      if (
        phase === 'start' ||
        resuming ||
        previous?.size.width !== target.width
      )
        animatedWidth.value = withTiming(target.width, config)
      if (
        phase === 'start' ||
        resuming ||
        previous?.size.height !== target.height
      )
        animatedHeight.value = withTiming(target.height, config)
    },
  )
  const initialSize = useDerivedValue(() => {
    const intent = request.value
    return pendingCardSize(
      intent.reduced ? null : intent.transition,
      accepted.value,
      intent.source,
      size.value,
      Date.now(),
    )
  })
  const displayedSize = useDerivedValue(() => ({
    // The pending frame is already the source shape, even before focus. Never
    // show the destination shape and then rewind it when the tween starts.
    width: initialSize.value?.width ?? (animatedWidth.value || '100%'),
    height: initialSize.value?.height ?? (animatedHeight.value || '100%'),
  }))
  const surfaceMotion = useAnimatedStyle(() => displayedSize.value)
  const maskMotion = useAnimatedStyle(() => displayedSize.value)
  const initialVisibility = useAnimatedStyle(() => ({
    // Only a new, not-yet-measured morph waits for layout. Keep its content and
    // background together; existing cards and unmatched colors stay visible.
    opacity:
      initialSize.value && (size.value.width <= 0 || size.value.height <= 0)
        ? 0
        : 1,
  }))
  const style = StyleSheet.flatten(props.style)
  const layout = cardLayout(style ?? {})
  const surface = {
    backgroundColor: style?.backgroundColor,
    borderRadius: style?.borderRadius ?? 26,
    borderTopLeftRadius: style?.borderTopLeftRadius,
    borderTopRightRadius: style?.borderTopRightRadius,
    borderBottomLeftRadius: style?.borderBottomLeftRadius,
    borderBottomRightRadius: style?.borderBottomRightRadius,
    borderCurve: style?.borderCurve,
  }
  return (
    <Animated.View
      ref={capture}
      collapsable={false}
      {...props}
      style={[
        layout.frame,
        { backgroundColor: 'transparent' },
        initialVisibility,
      ]}
      onLayout={(event) => {
        props.onLayout?.(event)
        layoutHeight.current = event.nativeEvent.layout.height
        size.value = {
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        }
        if (focused && nodeRef.current)
          motion?.measure(
            screen,
            sharedKey,
            nodeRef.current,
            event.nativeEvent.layout.height,
          )
      }}
    >
      <CardMask
        // Keep this interop host free of padding, borders and child layout.
        style={{ flexGrow: 1, flexShrink: 1, alignSelf: 'stretch' }}
        androidRenderingMode="software"
        maskElement={
          <Animated.View
            pointerEvents="none"
            style={[surface, { backgroundColor: '#000' }, maskMotion]}
          />
        }
      >
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
            surface,
            surfaceMotion,
          ]}
        >
          {colors && (
            <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
          )}
        </Animated.View>
        <View style={layout.content}>{children}</View>
      </CardMask>
    </Animated.View>
  )
}
