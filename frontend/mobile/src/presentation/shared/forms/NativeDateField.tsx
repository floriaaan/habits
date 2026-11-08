import DateTimePicker from '@react-native-community/datetimepicker'
import { useEffect, useState } from 'react'
import { Keyboard, Platform, Pressable, View } from 'react-native'
import { Copy, Icon, useTheme } from '../ui/native-ui'
import { FormLabel } from './FormLabel'
import { nativePickerOutput, nativePickerValue } from './date-field-model'

export function NativeDateField({
  label,
  value,
  onChange,
  disabled = false,
  minimum,
  maximum,
  hint,
  instant = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  minimum?: string
  maximum?: string
  hint?: string
  instant?: boolean
}) {
  const theme = useTheme()
  const [stage, setStage] = useState<'date' | 'time' | null>(null)
  const [draft, setDraft] = useState(() => nativePickerValue(value, instant))
  useEffect(() => {
    if (disabled) setStage(null)
  }, [disabled])
  const min = minimum ? nativePickerValue(minimum) : undefined
  const max = maximum ? nativePickerValue(maximum) : undefined
  let date = nativePickerValue(value, instant)
  if (min && date < min) date = min
  if (max && date > max) date = max
  function commit(selected: Date) {
    if (!disabled) onChange(nativePickerOutput(selected, instant))
  }
  return (
    <View style={{ gap: 8 }}>
      <FormLabel
        label={label}
        icon="calendar"
        style={{ fontSize: 14, fontWeight: '500' }}
      />
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          accessibilityLabel={label}
          value={date}
          mode={instant ? 'datetime' : 'date'}
          display="compact"
          timeZoneName="UTC"
          minimumDate={min}
          maximumDate={max}
          disabled={disabled}
          themeVariant={theme.dark ? 'dark' : 'light'}
          accentColor={theme.text}
          onValueChange={(_, selected) => commit(selected)}
          style={{ alignSelf: 'flex-start', minHeight: 48 }}
        />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => {
              Keyboard.dismiss()
              setDraft(date)
              setStage('date')
            }}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: 12,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: theme.selected,
              opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
            })}
          >
            <Copy style={{ flex: 1, fontSize: 16 }}>
              {new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'medium',
                ...(instant ? { timeStyle: 'short' } : {}),
                timeZone: 'UTC',
              }).format(date)}
            </Copy>
            <Icon
              name={{ ios: 'chevron.down', android: 'calendar_today' }}
              size={18}
              color={theme.secondary}
            />
          </Pressable>
          {stage && !disabled && (
            <DateTimePicker
              value={draft}
              mode={stage}
              display="default"
              timeZoneName="UTC"
              minimumDate={min}
              maximumDate={max}
              onDismiss={() => setStage(null)}
              onValueChange={(_, selected) => {
                if (instant && stage === 'date') {
                  const next = new Date(draft)
                  next.setUTCFullYear(
                    selected.getUTCFullYear(),
                    selected.getUTCMonth(),
                    selected.getUTCDate(),
                  )
                  setDraft(next)
                  setStage('time')
                } else {
                  setStage(null)
                  if (instant) {
                    const next = new Date(draft)
                    next.setUTCHours(
                      selected.getUTCHours(),
                      selected.getUTCMinutes(),
                      0,
                      0,
                    )
                    commit(next)
                  } else commit(selected)
                }
              }}
            />
          )}
        </>
      )}
      {!!hint && (
        <Copy style={{ color: theme.secondary, fontSize: 13, lineHeight: 18 }}>
          {hint}
        </Copy>
      )}
    </View>
  )
}
