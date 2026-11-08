import { useRef, useState, type ComponentRef, type ReactNode } from 'react'
import {
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
      </KeyboardAvoidingView>
    </View>
  )
}
