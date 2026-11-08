import { FormLabel } from '../../shared/forms/FormLabel'
import { View } from 'react-native'
import { categories } from '../../shared/models/home-model'
import { categoryColor } from '../../shared/ui/category-colors'
import { Copy, useTheme } from '../../shared/ui/native-ui'
import type { Category } from '../../../domain/models'
import { Choice, Field, f } from './NewHabitFields'
import { goalUnits, trackingOptions } from './new-habit-model'
import type { NewHabitController } from './useNewHabitController'

type Props = Pick<
  NewHabitController,
  'draft' | 'update' | 'chooseKind' | 'chooseUnit'
>
export function DefinitionStep({ draft: d, update, chooseKind }: Props) {
  const theme = useTheme()
  return (
    <View style={{ gap: 24 }}>
      <Field
        icon="text"
        label="Nom"
        value={d.name}
        onChangeText={(v) => update('name', v)}
        maxLength={120}
        placeholder="Par exemple, courir"
        returnKeyType="done"
      />
      <View style={f.section}>
        <FormLabel label="Catégorie" icon="category" style={f.label} />
        <View style={f.choices}>
          {(Object.keys(categories) as Category[]).map((category) => {
            const color = categoryColor(category, theme.dark)
            return (
              <Choice
                key={category}
                label={categories[category]}
                selected={d.category === category}
                tint={color.tint}
                ink={color.ink}
                onPress={() => update('category', category)}
              />
            )
          })}
        </View>
      </View>
      <View style={f.section}>
        <FormLabel label="Type de suivi" icon="repeat" style={f.label} />
        <View style={f.choices}>
          {trackingOptions.map((option) => (
            <Choice
              key={option.kind}
              label={option.label}
              selected={d.kind === option.kind}
              onPress={() => chooseKind(option.kind)}
            />
          ))}
        </View>
      </View>
    </View>
  )
}
export function GoalStep({ draft: d, update, chooseUnit }: Props) {
  const theme = useTheme(),
    measurement = goalUnits[d.unit]
  return (
    <View style={{ gap: 24 }}>
      <View style={f.section}>
        <FormLabel
          label="Période de l’objectif"
          icon="calendar"
          style={f.label}
        />
        <View style={f.choices}>
          <Choice
            label="Par jour"
            selected={d.period === 'daily'}
            onPress={() => update('period', 'daily')}
          />
          <Choice
            label="Par semaine"
            selected={d.period === 'weekly'}
            onPress={() => update('period', 'weekly')}
          />
        </View>
      </View>
      <View style={[f.panel, { backgroundColor: theme.blue[0], gap: 18 }]}>
        <Copy
          style={{ color: theme.onPastel, fontSize: 16, fontWeight: '600' }}
        >
          {d.period === 'daily' ? 'Chaque jour de pratique' : 'Sur la semaine'}
        </Copy>
        {d.kind === 'boolean' ? (
          <Copy style={{ color: theme.blueText, fontSize: 17 }}>
            Une validation{' '}
            {d.period === 'weekly' ? 'dans la semaine' : 'par jour choisi'}.
          </Copy>
        ) : (
          <>
            {d.kind === 'quantity' && (
              <View style={f.choices}>
                {(['milliliters', 'meters', 'count'] as const).map((unit) => (
                  <Choice
                    key={unit}
                    label={goalUnits[unit].label}
                    selected={unit === d.unit}
                    onPress={() => chooseUnit(unit)}
                  />
                ))}
              </View>
            )}
            <Field
              icon="target"
              label={`Objectif en ${measurement.label}`}
              value={d.target}
              onChangeText={(v) => update('target', v)}
              keyboardType={
                d.kind === 'frequency' ? 'number-pad' : 'decimal-pad'
              }
              maxLength={18}
              selectTextOnFocus
            />
            <View style={f.choices}>
              {measurement.presets.map((value) => (
                <Choice
                  key={value}
                  label={`${value} ${measurement.label}`}
                  selected={
                    Number(d.target.replace(',', '.')) ===
                    Number(value.replace(',', '.'))
                  }
                  onPress={() => update('target', value)}
                />
              ))}
            </View>
          </>
        )}
      </View>
      <Copy style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>
        {d.period === 'weekly'
          ? 'L’objectif cumule les réalisations de vos jours de pratique, du lundi au dimanche.'
          : 'L’objectif est renouvelé pour chaque jour de pratique.'}
      </Copy>
      <Copy style={{ fontSize: 13, lineHeight: 19, color: theme.secondary }}>
        Le type, l’unité et la période sont fixés à la création.
      </Copy>
    </View>
  )
}
