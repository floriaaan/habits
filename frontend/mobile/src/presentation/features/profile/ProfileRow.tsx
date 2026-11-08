import { ButtonFeedback } from '../../shared/ui/ActionButton'
import type { SymbolViewProps } from 'expo-symbols'
import { Pressable, StyleSheet, View } from 'react-native'
import { Copy, Icon, useTheme } from '../../shared/ui/native-ui'
export function ProfileRow({
  icon,
  label,
  value,
  onPress,
  danger,
  disabled,
  last,
  feedback = 'idle',
}: {
  icon: SymbolViewProps['name']
  label: string
  value?: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
  last?: boolean
  feedback?: 'idle' | 'pending' | 'success' | 'error'
}) {
  const theme = useTheme(),
    ink =
      feedback === 'success'
        ? theme.success
        : feedback === 'error' || danger
          ? theme.error
          : theme.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled, busy: feedback === 'pending' }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 62,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: theme.selected,
        opacity: disabled && feedback === 'idle' ? 0.45 : pressed ? 0.6 : 1,
        backgroundColor:
          feedback === 'success'
            ? theme.successSurface
            : feedback === 'error'
              ? theme.errorSurface
              : 'transparent',
      })}
    >
      <Icon name={icon} color={ink} size={23} />
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Copy style={{ flexGrow: 1, color: ink, fontSize: 16 }}>{label}</Copy>
        {value && (
          <Copy style={{ color: theme.secondary, fontSize: 14 }}>{value}</Copy>
        )}
      </View>
      {feedback !== 'idle' && <ButtonFeedback phase={feedback} color={ink} />}
      {!danger && feedback === 'idle' && (
        <Icon
          name={{ ios: 'chevron.right', android: 'chevron_right' }}
          color={theme.secondary}
          size={16}
        />
      )}
    </Pressable>
  )
}
