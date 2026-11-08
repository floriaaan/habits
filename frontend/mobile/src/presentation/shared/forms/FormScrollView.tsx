import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ComponentRef,
} from 'react'
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type ScrollViewProps,
  type TextInputProps,
} from 'react-native'
import { focusedScrollOffset } from './keyboard-geometry'

type NativeInput = ComponentRef<typeof TextInput>
type NativeScroll = ComponentRef<typeof ScrollView>
type Focus = { focus(input: NativeInput): void; blur(input: NativeInput): void }
const FormFocus = createContext<Focus | null>(null)

export const FormScrollView = forwardRef<NativeScroll, ScrollViewProps>(
  function FormScrollView(
    { children, onScroll, onLayout, onContentSizeChange, ...props },
    ref,
  ) {
    const scroll = useRef<NativeScroll>(null),
      focused = useRef<NativeInput | null>(null),
      offset = useRef(0)
    const ensureVisible = useCallback(() => {
      const input = focused.current,
        viewport = scroll.current
      if (!input || !viewport) return
      viewport.measureInWindow((_x, y, _width, height) => {
        input.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
          if (focused.current !== input || scroll.current !== viewport) return
          const next = focusedScrollOffset(
            offset.current,
            inputY,
            inputHeight,
            y,
            height,
            Keyboard.metrics()?.screenY ?? Infinity,
          )
          if (Math.abs(next - offset.current) > 1)
            viewport.scrollTo({ y: next, animated: false })
        })
      })
    }, [])
    useEffect(() => {
      const subscription = Keyboard.addListener(
        'keyboardDidShow',
        ensureVisible,
      )
      return () => {
        subscription.remove()
        focused.current = null
      }
    }, [ensureVisible])
    return (
      <FormFocus.Provider
        value={{
          focus: (input) => {
            focused.current = input
            ensureVisible()
          },
          blur: (input) => {
            if (focused.current === input) focused.current = null
          },
        }}
      >
        <ScrollView
          {...props}
          ref={(node) => {
            scroll.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) ref.current = node
          }}
          keyboardDismissMode={
            props.keyboardDismissMode ??
            (Platform.OS === 'ios' ? 'interactive' : 'on-drag')
          }
          keyboardShouldPersistTaps={
            props.keyboardShouldPersistTaps ?? 'handled'
          }
          scrollEventThrottle={16}
          onScroll={(event) => {
            offset.current = event.nativeEvent.contentOffset.y
            onScroll?.(event)
          }}
          onLayout={(event) => {
            onLayout?.(event)
            ensureVisible()
          }}
          onContentSizeChange={(width, height) => {
            onContentSizeChange?.(width, height)
            ensureVisible()
          }}
        >
          {children}
        </ScrollView>
      </FormFocus.Provider>
    )
  },
)

export const FormInput = forwardRef<NativeInput, TextInputProps>(
  function FormInput({ onFocus, onBlur, ...props }, ref) {
    const focus = useContext(FormFocus),
      input = useRef<NativeInput>(null)
    return (
      <TextInput
        {...props}
        ref={(node) => {
          input.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        onFocus={(event) => {
          if (input.current) focus?.focus(input.current)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          if (input.current) focus?.blur(input.current)
          onBlur?.(event)
        }}
      />
    )
  },
)
