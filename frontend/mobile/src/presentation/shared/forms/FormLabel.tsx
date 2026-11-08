import {
  View,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { Copy, Icon, useTheme } from '../ui/native-ui'

const icons = {
  text: { ios: 'text.alignleft', android: 'notes' },
  email: { ios: 'envelope', android: 'mail' },
  password: { ios: 'lock', android: 'lock' },
  key: { ios: 'key', android: 'key' },
  code: { ios: 'number', android: 'pin' },
  calendar: { ios: 'calendar', android: 'calendar_today' },
  time: { ios: 'clock', android: 'schedule' },
  target: { ios: 'target', android: 'flag' },
  quantity: { ios: 'ruler', android: 'straighten' },
  category: { ios: 'square.grid.2x2', android: 'category' },
  repeat: { ios: 'repeat', android: 'repeat' },
  reminder: { ios: 'bell', android: 'notifications' },
  step: { ios: 'plus.forwardslash.minus', android: 'exposure' },
  globe: { ios: 'globe', android: 'public' },
  id: { ios: 'number', android: 'tag' },
  editor: { ios: 'chevron.left.forwardslash.chevron.right', android: 'code' },
  offset: { ios: 'arrow.up.arrow.down', android: 'swap_vert' },
} as const
export type FormIcon = keyof typeof icons

export function FormLabel({
  label,
  icon = 'text',
  style,
  containerStyle,
}: {
  label: string
  icon?: FormIcon
  style?: StyleProp<TextStyle>
  containerStyle?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const color = StyleSheet.flatten(style)?.color ?? theme.secondary
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 8 },
        containerStyle,
      ]}
    >
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon
          name={icons[icon]}
          color={typeof color === 'string' ? color : theme.secondary}
          size={17}
        />
      </View>
      <Copy style={[{ flexShrink: 1 }, style]}>{label}</Copy>
    </View>
  )
}
