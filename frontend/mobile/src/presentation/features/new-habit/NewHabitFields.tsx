import {
  Pressable,
  StyleSheet,
  Switch,
  View,
  type TextInputProps,
} from 'react-native'
import { FormLabel, type FormIcon } from '../../shared/forms/FormLabel'
import { FormInput } from '../../shared/forms/FormScrollView'
import { Copy, Icon, useTheme } from '../../shared/ui/native-ui'

export function Field({
  label,
  hint,
  icon,
  ...props
}: TextInputProps & { label: string; hint?: string; icon?: FormIcon }) {
  const theme = useTheme()
  return (
    <View style={f.field}>
      <FormLabel label={label} icon={icon} style={f.label} />
      <FormInput
        accessibilityLabel={label}
        placeholderTextColor={theme.secondary}
        {...props}
        style={[
          f.input,
          {
            color: theme.text,
            backgroundColor: theme.chip,
            borderColor: theme.selected,
          },
          props.style,
        ]}
      />
      {!!hint && (
        <Copy style={{ color: theme.secondary, fontSize: 13, lineHeight: 18 }}>
          {hint}
        </Copy>
      )}
    </View>
  )
}
export function Choice({
  label,
  selected,
  onPress,
  tint,
  ink,
}: {
  label: string
  selected: boolean
  onPress: () => void
  tint?: string
  ink?: string
}) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        f.choice,
        {
          backgroundColor: selected ? (tint ?? theme.text) : theme.chip,
          opacity: pressed ? 0.65 : 1,
        },
      ]}
    >
      <Copy
        style={{
          color: selected ? (ink ?? theme.surface) : theme.text,
          fontSize: 14,
        }}
      >
        {label}
      </Copy>
      {selected && (
        <Icon
          name={{ ios: 'checkmark', android: 'check' }}
          color={ink ?? theme.surface}
          size={13}
        />
      )}
    </Pressable>
  )
}
export function Toggle({
  label,
  value,
  onChange,
  icon,
  disabled = false,
}: {
  label: string
  value: boolean
  icon?: FormIcon
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const theme = useTheme()
  return (
    <View style={f.row}>
      <FormLabel
        label={label}
        icon={icon}
        containerStyle={{ flex: 1 }}
        style={{
          fontSize: 16,
          fontWeight: '500',
          color: disabled ? theme.secondary : theme.text,
        }}
      />
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
      />
    </View>
  )
}
export const f = StyleSheet.create({
  field: { gap: 8 },
  label: { fontSize: 16, fontWeight: '600' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    minHeight: 48,
    fontSize: 16,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  panel: { borderRadius: 16, padding: 16, gap: 4 },
  section: { gap: 12 },
})
