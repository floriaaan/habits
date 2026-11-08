import { NativeDateField } from '../../shared/forms/NativeDateField'
import { calendarDate, shiftDay } from '../../../domain/calendar'
import { useState } from 'react'
import { Pressable, View, useWindowDimensions } from 'react-native'
import { Stack } from 'expo-router'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { FormScrollView } from '../../shared/forms/FormScrollView'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { categories } from '../../shared/models/home-model'
import {
  Button,
  Copy,
  Icon,
  deviceCornerRadius,
  useTheme,
} from '../../shared/ui/native-ui'
import { categoryColor } from '../../shared/ui/category-colors'
import type { Category } from '../../../domain/models'
import { Field, Choice, f } from './NewHabitFields'
import { goalUnits, trackingOptions } from './new-habit-model'
import { RhythmStep } from './RhythmStep'
import { ArchiveHabitSheet } from './ArchiveHabitSheet'
import type { EditHabitController } from './useEditHabitController'

export function EditHabitView({ model: m }: { model: EditHabitController }) {
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { width } = useWindowDimensions()
  const [chooseCategory, setChooseCategory] = useState(false)
  const habit = m.snapshot.habit,
    draft = m.draft,
    busy = !!m.work || m.archiveCommitted,
    screen = `/edit/${habit.id}` as const
  return (
    <KeyboardScreen
      style={{
        flex: 1,
        gap: 6,
        paddingHorizontal: 6,
        backgroundColor: theme.canvas,
      }}
    >
      <Stack.Screen options={{ gestureEnabled: false, animation: 'none' }} />
      <MotionCard
        screen={screen}
        role="primary"
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 700,
          alignSelf: 'center',
          backgroundColor: theme.surface,
          borderRadius: 26,
          borderTopLeftRadius: deviceCornerRadius(insets.top, width),
          borderTopRightRadius: deviceCornerRadius(insets.top, width),
          paddingTop: insets.top + 8,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            disabled={busy}
            onPress={m.close}
            style={{
              minWidth: 44,
              minHeight: 48,
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
              textAlign: 'center',
              fontSize: 18,
              fontWeight: '600',
            }}
          >
            Modifier l’habitude
          </Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer les modifications"
            disabled={busy}
            onPress={m.close}
            style={{
              minWidth: 44,
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name={{ ios: 'xmark', android: 'close' }}
              size={20}
              color={theme.text}
            />
          </Pressable>
        </View>
        <FormScrollView
          style={{ flex: 1 }}
          pointerEvents={busy ? 'none' : 'auto'}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ padding: 16, gap: 22 }}
        >
          {habit.archived_at ? (
            <Copy>Cette habitude est déjà archivée.</Copy>
          ) : (
            <>
              <Field
                icon="text"
                label="Nom"
                value={draft.name}
                onChangeText={(v) => m.update('name', v)}
                maxLength={120}
              />
              <View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: chooseCategory }}
                  onPress={() => setChooseCategory(!chooseCategory)}
                  style={f.row}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: categoryColor(draft.category).accent,
                    }}
                  />
                  <Copy style={{ flex: 1, fontSize: 16, fontWeight: '600' }}>
                    {categories[draft.category]}
                  </Copy>
                  <Icon
                    name={{
                      ios: chooseCategory ? 'chevron.up' : 'chevron.down',
                      android: chooseCategory ? 'expand_less' : 'expand_more',
                    }}
                    color={theme.secondary}
                    size={16}
                  />
                </Pressable>
                {chooseCategory && (
                  <View style={f.choices}>
                    {(Object.keys(categories) as Category[]).map((category) => {
                      const color = categoryColor(category, theme.dark)
                      return (
                        <Choice
                          key={category}
                          label={categories[category]}
                          selected={draft.category === category}
                          tint={color.tint}
                          ink={color.ink}
                          onPress={() => {
                            m.update('category', category)
                            setChooseCategory(false)
                          }}
                        />
                      )
                    })}
                  </View>
                )}
              </View>
              <View
                style={[f.panel, { backgroundColor: theme.blue[0], gap: 12 }]}
              >
                {habit.kind === 'boolean' ? (
                  <Copy style={{ fontSize: 17, color: theme.onPastel }}>
                    Une validation{' '}
                    {habit.period === 'weekly'
                      ? 'par semaine'
                      : 'par jour de pratique'}
                  </Copy>
                ) : (
                  <Field
                    icon="target"
                    label={`Objectif en ${goalUnits[habit.unit].label}`}
                    value={draft.target}
                    onChangeText={(v) => m.update('target', v)}
                    keyboardType={
                      habit.kind === 'frequency' ? 'number-pad' : 'decimal-pad'
                    }
                    maxLength={18}
                  />
                )}
                <Copy style={{ color: theme.blueText, fontSize: 13 }}>
                  {trackingOptions.find((o) => o.kind === habit.kind)!.label} ·{' '}
                  {goalUnits[habit.unit].label} ·{' '}
                  {habit.period === 'weekly' ? 'Hebdomadaire' : 'Quotidien'}
                </Copy>
              </View>
              <RhythmStep
                draft={draft}
                update={m.update}
                integrations={m.integrations}
                canInspectIntegrations={m.canInspectIntegrations}
                reminderAvailable={m.reminderAvailable}
                showIncrement={false}
                editingHabit
                reminderMessage={
                  !m.snapshot.presentation
                    ? 'Votre accès ne permet pas de consulter ou modifier le rappel.'
                    : undefined
                }
              />
              <View
                style={[f.panel, { backgroundColor: theme.blue[0], gap: 10 }]}
              >
                <NativeDateField
                  label="À partir du"
                  value={m.effectiveDate}
                  onChange={m.setEffectiveDate}
                  disabled={busy || !m.canWrite}
                  minimum={shiftDay(calendarDate(habit.timezone), 1)}
                  maximum={shiftDay(calendarDate(habit.timezone), 366)}
                  hint={
                    habit.period === 'weekly'
                      ? 'Choisissez un lundi futur.'
                      : 'Les modifications s’appliquent à partir de cette date.'
                  }
                />
                <Copy style={{ fontSize: 13, color: theme.blueText }}>
                  Les journées passées restent inchangées. Le rappel, s’il est
                  modifié, s’applique immédiatement.
                </Copy>
                {m.snapshot.versions.some(
                  (v) => v.effective_from > m.snapshot.localDate,
                ) && (
                  <Copy style={{ fontSize: 13, color: theme.blueText }}>
                    Changements déjà prévus :{' '}
                    {m.snapshot.versions
                      .filter((v) => v.effective_from > m.snapshot.localDate)
                      .map((v) => v.effective_from)
                      .join(', ')}
                    .
                  </Copy>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!m.canWrite || busy}
                onPress={m.openArchive}
                style={[f.row, { opacity: m.canWrite ? 1 : 0.45 }]}
              >
                <Icon
                  name={{ ios: 'archivebox', android: 'archive' }}
                  size={21}
                  color={theme.error}
                />
                <Copy
                  style={{
                    fontSize: 15,
                    fontWeight: '500',
                    color: theme.error,
                  }}
                >
                  Archiver cette habitude
                </Copy>
              </Pressable>
            </>
          )}
          {!!m.error && !m.archiveVisible && (
            <Copy
              accessibilityRole="alert"
              style={{ color: theme.error, fontSize: 14 }}
            >
              {m.error}
            </Copy>
          )}
          {!m.canWrite && !habit.archived_at && (
            <Copy style={{ color: theme.secondary, fontSize: 14 }}>
              Votre accès ne permet pas de modifier cette habitude.
            </Copy>
          )}
        </FormScrollView>
      </MotionCard>
      <MotionCard
        screen={screen}
        role="edit-footer"
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
            if (outcome === 'success') m.finishSave()
          }}
        >
          Enregistrer les modifications
        </Button>
      </MotionCard>
      <ArchiveHabitSheet {...m} />
    </KeyboardScreen>
  )
}
