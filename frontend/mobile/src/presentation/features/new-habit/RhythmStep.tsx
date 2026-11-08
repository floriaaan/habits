import { FormLabel } from '../../shared/forms/FormLabel'
import { View } from 'react-native'
import { Copy, Button, useTheme } from '../../shared/ui/native-ui'
import { Field, Toggle, f } from './NewHabitFields'
import { HabitOptions } from './HabitOptions'
import type { NewHabitController } from './useNewHabitController'
import { WeekdaySelector } from './WeekdaySelector'
type Props = Pick<
  NewHabitController,
  | 'draft'
  | 'update'
  | 'reminderAvailable'
  | 'integrations'
  | 'canInspectIntegrations'
> & {
  showIncrement?: boolean
  editingHabit?: boolean
  reminderMessage?: string
}
export function RhythmStep({
  draft: d,
  update,
  reminderAvailable,
  integrations,
  canInspectIntegrations,
  showIncrement = true,
  editingHabit = false,
  reminderMessage,
}: Props) {
  const theme = useTheme()
  return (
    <View style={{ gap: 24 }}>
      <View style={f.section}>
        <FormLabel label="Les jours" icon="calendar" style={f.label} />
        <WeekdaySelector
          days={d.weekdays}
          category={d.category}
          onChange={(days) => update('weekdays', days)}
        />
      </View>
      <View style={[f.panel, { backgroundColor: theme.blue[0], gap: 14 }]}>
        <Toggle
          icon="time"
          label="Plage horaire"
          value={d.windowEnabled}
          onChange={(v) => update('windowEnabled', v)}
        />
        {d.windowEnabled && (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field
                  icon="time"
                  label="Début"
                  value={d.start}
                  onChangeText={(v) => update('start', v)}
                  placeholder="08:00"
                  maxLength={5}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  icon="time"
                  label="Fin"
                  value={d.end}
                  onChangeText={(v) => update('end', v)}
                  placeholder="21:00"
                  maxLength={5}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <Copy
              style={{ color: theme.blueText, fontSize: 13, lineHeight: 18 }}
            >
              Les réalisations doivent être saisies dans cette plage, sur la
              même journée.
            </Copy>
          </>
        )}
      </View>
      <View style={[f.panel, { backgroundColor: theme.green[0], gap: 12 }]}>
        <Toggle
          icon="reminder"
          label="Rappel Home Assistant"
          value={d.reminderEnabled && (reminderAvailable || editingHabit)}
          disabled={!reminderAvailable}
          onChange={(v) => update('reminderEnabled', v)}
        />
        {!reminderAvailable ? (
          <>
            <Copy
              accessibilityLiveRegion="polite"
              style={{ color: theme.greenText, fontSize: 14, lineHeight: 20 }}
            >
              {reminderMessage ??
                (!canInspectIntegrations
                  ? 'Votre accès ne permet pas de vérifier la connexion Home Assistant.'
                  : integrations.isFetching
                    ? 'Vérification de la connexion…'
                    : integrations.isError
                      ? 'Impossible de vérifier la connexion Home Assistant.'
                      : 'Configurez d’abord Home Assistant dans Profil → Outils avancés → Intégrations.')}
            </Copy>
            {integrations.isError && (
              <Button onPress={() => integrations.refetch()}>Réessayer</Button>
            )}
          </>
        ) : d.reminderEnabled ? (
          <>
            <Field
              icon="reminder"
              label="Heure du rappel"
              value={d.reminder}
              onChangeText={(v) => update('reminder', v)}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
              placeholder="19:00"
            />
            <Copy style={{ color: theme.greenText, fontSize: 13 }}>
              Envoyé via Home Assistant les jours choisis.
            </Copy>
          </>
        ) : (
          <Copy style={{ color: theme.greenText, fontSize: 13 }}>
            Home Assistant est connecté. Ce rappel n’est pas une notification
            mobile.
          </Copy>
        )}
        {d.reminderEnabled && !reminderAvailable && (
          <Copy style={{ color: theme.greenText, fontSize: 13 }}>
            {editingHabit
              ? 'Vérifiez la connexion pour modifier ce rappel, ou retirez-le.'
              : 'Réactivez la connexion ou désactivez le rappel avant de créer l’habitude.'}
          </Copy>
        )}
        {d.reminderEnabled && !reminderAvailable && (
          <Button onPress={() => update('reminderEnabled', false)}>
            Retirer le rappel
          </Button>
        )}
      </View>
      {showIncrement && <HabitOptions draft={d} update={update} />}
    </View>
  )
}
