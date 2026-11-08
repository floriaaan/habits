import { useTheme } from '../ui/theme'
import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react'
import {
  Keyboard,
  Pressable,
  Text,
  KeyboardAvoidingView,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

// Absolute footers must be inside the flex child, not on the padded avoiding view.
export function KeyboardScreen({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible())
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    )
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    )
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  const root = useRef<ComponentRef<typeof View>>(null)
  const [originY, setOriginY] = useState(0)
  return (
    <View
      collapsable={false}
      ref={root}
      style={{ flex: 1 }}
      onLayout={() => root.current?.measureInWindow((_x, y) => setOriginY(y))}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={originY}
      >
        <View style={[{ flex: 1 }, style]}>{children}</View>
        {keyboardVisible && (
          <View
            style={{ backgroundColor: theme.surface, alignItems: 'flex-end' }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer le clavier"
              onPress={Keyboard.dismiss}
              style={{
                minHeight: 44,
                paddingHorizontal: 20,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}
              >
                Terminé
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}
