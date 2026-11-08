import { FormLabel, type FormIcon } from '../../shared/forms/FormLabel'
import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { FormInput } from '../../shared/forms/FormScrollView'
import { styles } from './technical.styles'
export function Button({
  label,
  onPress,
  disabled = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  )
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  secret = false,
  icon,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  secret?: boolean
  icon?: FormIcon
}) {
  return (
    <View style={styles.field}>
      <FormLabel
        label={label}
        icon={icon ?? (secret ? 'key' : multiline ? 'editor' : 'text')}
        style={styles.label}
      />
      <FormInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        secureTextEntry={secret}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, multiline && styles.editor]}
      />
    </View>
  )
}
export function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {children}
    </View>
  )
}
export function Result({ value }: { value: unknown }) {
  return (
    <Text selectable style={styles.result}>
      {JSON.stringify(value ?? { success: true }, null, 2)}
    </Text>
  )
}
