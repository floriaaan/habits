import { Field } from './NewHabitFields'
import { goalUnits } from './new-habit-model'
import type { NewHabitController } from './useNewHabitController'

type Props = Pick<NewHabitController, 'draft' | 'update'>
export function HabitOptions({ draft: d, update }: Props) {
  if (d.kind === 'boolean' || d.kind === 'frequency') return null
  return (
    <Field
      icon="step"
      label={`Pas d’ajout en ${goalUnits[d.unit].label}`}
      value={d.increment}
      onChangeText={(value) => update('increment', value)}
      keyboardType="decimal-pad"
      hint="Quantité ajoutée par l’action rapide +."
      maxLength={18}
    />
  )
}
