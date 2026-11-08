import { NativeDateField } from '../../shared/forms/NativeDateField'
import { calendarDate } from '../../../domain/calendar'
import { FormLabel } from '../../shared/forms/FormLabel'
import { Pressable, View, useWindowDimensions } from 'react-native'
import { FormInput, FormScrollView } from '../../shared/forms/FormScrollView'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { amount } from '../../shared/models/home-model'
import {
  Button,
  Copy,
  Icon,
  deviceCornerRadius,
  useTheme,
} from '../../shared/ui/native-ui'
import { DeleteEntrySheet } from './DeleteEntrySheet'
import { entryUnits } from './entry-edit-model'
import type { EditEntryController } from './useEditEntryController'

export function EditEntryView({ model: m }: { model: EditEntryController }) {
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { width } = useWindowDimensions()
  const { entry, habit } = m.snapshot,
    screen = `/entry/${entry.id}` as const
  const numeric = !['boolean', 'frequency'].includes(habit.kind),
    busy = !!m.work
  return (
    <KeyboardScreen
      style={{
        flex: 1,
        gap: 6,
        paddingHorizontal: 6,
        backgroundColor: theme.canvas,
      }}
    >
      <MotionCard
        screen={screen}
        role="primary"
        style={{
          flex: 1,
          backgroundColor: theme.surface,
          borderRadius: 26,
          borderTopLeftRadius: deviceCornerRadius(insets.top, width),
          borderTopRightRadius: deviceCornerRadius(insets.top, width),
          paddingTop: insets.top + 8,
          width: '100%',
          maxWidth: 700,
          alignSelf: 'center',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            onPress={m.close}
            disabled={busy}
            style={{
              minHeight: 48,
              minWidth: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={{ ios: 'chevron.left', android: 'arrow_back' }}
              size={20}
              color={theme.text}
            />
          </Pressable>
          <Copy
            accessibilityRole="header"
            style={{
              flex: 1,
              fontSize: 18,
              fontWeight: '600',
              textAlign: 'center',
              paddingRight: 44,
            }}
          >
            Corriger une saisie
          </Copy>
        </View>
        <FormScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ padding: 20, gap: 24 }}
          pointerEvents={busy ? 'none' : 'auto'}
        >
          <View style={{ gap: 6 }}>
            <Copy style={{ fontSize: 24, fontWeight: '600' }}>
              {habit.name}
            </Copy>
            <Copy style={{ color: theme.secondary, fontSize: 14 }}>
              Saisie d’origine · {amount(entry.value, habit.unit)}
            </Copy>
            <Copy style={{ color: theme.secondary, fontSize: 13 }}>
              {new Date(entry.occurred_at).toLocaleString('fr-FR', {
                timeZone: habit.timezone,
              })}
            </Copy>
          </View>
          {numeric ? (
            <Field
              label={`Valeur en ${entryUnits[habit.unit].label}`}
              value={m.draft.value}
              onChangeText={(v) => m.update('value', v)}
              numeric
              disabled={busy || !m.canWrite}
            />
          ) : (
            <Copy>
              Une validation. Vous pouvez corriger sa date et son heure.
            </Copy>
          )}
          <NativeDateField
            label="Date"
            value={m.draft.date}
            onChange={(date) => m.update('date', date)}
            disabled={busy || !m.canWrite}
            minimum="1970-01-01"
            maximum={calendarDate(habit.timezone)}
          />
          <Field
            label="Heure"
            value={m.draft.time}
            onChangeText={(v) => m.update('time', v)}
            placeholder="HH:MM"
            disabled={busy || !m.canWrite}
          />
          <Copy style={{ color: theme.secondary, fontSize: 13 }}>
            Fuseau de l’habitude : {habit.timezone}. La date doit respecter ses
            jours de pratique et sa plage horaire.
          </Copy>
          {!!m.error && !m.confirmation && (
            <Copy accessibilityRole="alert" style={{ color: theme.error }}>
              {m.error}
            </Copy>
          )}
          {!m.canWrite && (
            <Copy>Votre accès ne permet pas de modifier cette saisie.</Copy>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy || !m.canWrite}
            onPress={m.openConfirmation}
            style={{
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              opacity: m.canWrite ? 1 : 0.45,
            }}
          >
            <Icon
              name={{ ios: 'trash', android: 'delete' }}
              color={theme.error}
              size={20}
            />
            <Copy style={{ color: theme.error, fontSize: 15 }}>
              Supprimer cette saisie
            </Copy>
          </Pressable>
        </FormScrollView>
      </MotionCard>
      <MotionCard
        screen={screen}
        role="entry-footer"
        colors={theme.green}
        style={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 12),
          borderRadius: 26,
          width: '100%',
          maxWidth: 700,
          alignSelf: 'center',
        }}
      >
        <Button
          variant="primary"
          disabled={busy || !m.canWrite || !m.dirty}
          onPress={m.save}
          onFeedbackEnd={(outcome) => {
            if (outcome === 'success') m.finish()
          }}
        >
          Enregistrer les modifications
        </Button>
      </MotionCard>
      <DeleteEntrySheet model={m} />
    </KeyboardScreen>
  )
}
function Field({
  label,
  value,
  onChangeText,
  numeric,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  numeric?: boolean
  placeholder?: string
  disabled: boolean
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <FormLabel
        label={label}
        icon={
          numeric ? 'quantity' : placeholder === 'HH:MM' ? 'time' : 'calendar'
        }
        style={{ fontSize: 14, fontWeight: '500' }}
      />
      <FormInput
        accessibilityLabel={label}
        editable={!disabled}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.secondary}
        keyboardType={numeric ? 'decimal-pad' : 'numbers-and-punctuation'}
        autoCorrect={false}
        maxLength={numeric ? 24 : placeholder === 'HH:MM' ? 5 : 10}
        style={{
          backgroundColor: theme.selected,
          color: theme.text,
          padding: 14,
          borderRadius: 12,
          minHeight: 48,
          fontSize: 16,
        }}
      />
    </View>
  )
}
