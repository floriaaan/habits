import Animated from 'react-native-reanimated'
import {
  formStepEntry,
  localLayout,
} from '../../shared/motion/local-transitions'
import { Pressable, View } from 'react-native'
import { FormInput } from '../../shared/forms/FormScrollView'
import { amount } from '../../shared/models/home-model'
import { Button, Copy, ui, useTheme } from '../../shared/ui/native-ui'
import { s } from './activity.styles'
import type { ActivityController } from './useActivityController'

type Props = Pick<
  ActivityController,
  | 'item'
  | 'mutation'
  | 'value'
  | 'setValue'
  | 'notice'
  | 'editing'
  | 'setEditing'
  | 'blocked'
  | 'step'
  | 'numeric'
  | 'action'
  | 'finishAction'
> & { canWrite: boolean }
export function ActivityActions({
  item,
  mutation,
  value,
  setValue,
  notice,
  editing,
  setEditing,
  blocked,
  step,
  numeric,
  action,
  finishAction,
  canWrite,
}: Props) {
  const theme = useTheme()
  const card = [s.card, { backgroundColor: theme.surface, borderRadius: 16 }]
  if (!item) return null
  return (
    <Animated.View layout={localLayout} style={card}>
      {!item.actionable && (
        <Copy>Cette habitude n’est pas modifiable aujourd’hui.</Copy>
      )}
      {!canWrite && <Copy>Votre accès est en lecture seule.</Copy>}
      {item.habit.kind === 'boolean' ? (
        <Button
          disabled={blocked}
          onFeedbackEnd={(outcome) => {
            if (outcome === 'success') finishAction()
          }}
          onPress={() => action(item.completed ? 'uncomplete' : 'complete')}
        >
          {item.completed
            ? 'Annuler la validation'
            : 'Valider pour aujourd’hui'}
        </Button>
      ) : (
        <>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {[step, step / 2]
              .filter(
                (n, i) =>
                  n > 0 &&
                  (item.habit.unit !== 'count' || Number.isInteger(n)) &&
                  (i === 0 || n !== step),
              )
              .map((n) => (
                <View key={n} style={{ flex: 1, minWidth: 110 }}>
                  <Button
                    disabled={blocked}
                    onFeedbackEnd={(outcome) => {
                      if (outcome === 'success') finishAction()
                    }}
                    onPress={() => action('entry', n)}
                  >
                    {'+ ' + amount(n, item.habit.unit)}
                  </Button>
                </View>
              ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked, expanded: editing }}
            disabled={blocked}
            onPress={() => setEditing(!editing)}
            style={({ pressed }) => ({
              minHeight: 48,
              padding: 14,
              borderRadius: 16,
              backgroundColor: theme.text,
              opacity: blocked ? 0.45 : pressed ? 0.65 : 1,
            })}
          >
            <Copy
              style={{
                color: theme.surface,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              {editing ? 'Fermer la saisie' : 'Ajouter une saisie'}
            </Copy>
          </Pressable>
          {editing && (
            <Animated.View entering={formStepEntry} style={{ gap: 8 }}>
              <Copy style={{ fontSize: 14 }}>
                Quantité à ajouter (
                {item.habit.unit === 'milliliters'
                  ? 'mL'
                  : item.habit.unit === 'seconds'
                    ? 'secondes'
                    : item.habit.unit === 'meters'
                      ? 'mètres'
                      : 'nombre'}
                )
              </Copy>
              <FormInput
                autoFocus
                accessibilityLabel="Quantité à ajouter"
                keyboardType="decimal-pad"
                value={value}
                onChangeText={setValue}
                editable={!blocked}
                style={[ui.input, { color: theme.text }]}
              />
              <Button
                disabled={
                  blocked ||
                  !value.trim() ||
                  !Number.isFinite(numeric) ||
                  numeric <= 0
                }
                onFeedbackEnd={(outcome) => {
                  if (outcome === 'success') finishAction()
                }}
                onPress={() => action('entry', numeric)}
              >
                Enregistrer la saisie
              </Button>
              <Button
                disabled={blocked || item.progress < step}
                onFeedbackEnd={(outcome) => {
                  if (outcome === 'success') finishAction()
                }}
                onPress={() => action('decrement')}
              >
                Retirer un pas
              </Button>
              {(item.habit.kind === 'quantity' ||
                item.habit.kind === 'duration') && (
                <Button
                  disabled={
                    blocked ||
                    !value.trim() ||
                    !Number.isFinite(numeric) ||
                    numeric < 0
                  }
                  onFeedbackEnd={(outcome) => {
                    if (outcome === 'success') finishAction()
                  }}
                  onPress={() => action('set_value', numeric)}
                >
                  Définir le total à cette valeur
                </Button>
              )}
            </Animated.View>
          )}
        </>
      )}
      {!!notice && (
        <Copy
          accessibilityRole={mutation.isError ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
        >
          {notice}
        </Copy>
      )}
    </Animated.View>
  )
}
