import { categoryColor } from '../../shared/ui/category-colors'
import { useLayoutEffect, useRef } from 'react'
import Animated from 'react-native-reanimated'
import { formStepEntry } from '../../shared/motion/local-transitions'
import { LinearGradient } from 'expo-linear-gradient'
import { router, Stack } from 'expo-router'
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Category } from '../../../domain/models'
import { FormInput, FormScrollView } from '../../shared/forms/FormScrollView'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { categories } from '../../shared/models/home-model'
import { Button, Copy, Icon, ui, useTheme } from '../../shared/ui/native-ui'
import { goalUnits, trackingOptions } from './new-habit-model'

import type { NewHabitController } from './useNewHabitController'

export function NewHabitView({ model }: { model: NewHabitController }) {
  const {
    step,
    finish,
    name,
    setName,
    kind,
    setKind,
    unit,
    setUnit,
    target,
    setTarget,
    category,
    setCategory,
    error,
    scroll,
    nameInput,
    goalInput,
    canWrite,
    busy,
    measurement,
    tracking,
    changeStep,
    next,
    save,
    summaryIcon,
  } = model
  const previousStep = useRef(step)
  const stepEntry = previousStep.current === step ? undefined : formStepEntry
  useLayoutEffect(() => {
    previousStep.current = step
  }, [step])
  const theme = useTheme(),
    insets = useSafeAreaInsets()
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: theme.canvas }]}>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <View style={[styles.body, { backgroundColor: theme.surface }]}>
        <View
          style={[
            styles.navigation,
            Platform.OS === 'android' && {
              paddingTop: Math.max(insets.top, 8),
            },
          ]}
        >
          {step === 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Revenir à la définition de l’habitude"
              disabled={busy}
              onPress={() => changeStep(1)}
              style={styles.back}
            >
              <Icon
                name={{ ios: 'chevron.left', android: 'arrow_back' }}
                color={theme.text}
                size={18}
              />
              <Copy style={{ fontSize: 16 }}>Retour</Copy>
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}
          <Copy
            accessibilityLiveRegion="polite"
            style={[styles.step, { color: theme.secondary }]}
          >
            {step} sur 2
          </Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer la création"
            disabled={busy}
            onPress={() => router.back()}
            style={[styles.close, { opacity: busy ? 0.45 : 1 }]}
          >
            <Icon
              name={{ ios: 'xmark', android: 'close' }}
              color={theme.text}
              size={22}
            />
          </Pressable>
        </View>
        <FormScrollView
          pointerEvents={busy ? 'none' : 'auto'}
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={styles.content}
        >
          <Animated.View key={step} entering={stepEntry} style={{ gap: 24 }}>
            <View style={styles.heading}>
              <Copy accessibilityRole="header" style={styles.title}>
                {step === 1 ? 'Nouvelle habitude' : 'Quel objectif ?'}
              </Copy>
              <Copy style={{ color: theme.secondary, fontSize: 16 }}>
                {step === 1
                  ? 'Un petit geste à garder chaque jour.'
                  : name.trim()}
              </Copy>
            </View>
            {step === 1 ? (
              <>
                <View style={styles.section}>
                  <Copy style={styles.label}>Nom</Copy>
                  <FormInput
                    ref={nameInput}
                    accessibilityLabel="Nom de l’habitude"
                    placeholder="Par exemple, boire de l’eau"
                    placeholderTextColor={theme.secondary}
                    value={name}
                    onChangeText={setName}
                    style={[
                      ui.input,
                      { backgroundColor: theme.chip, color: theme.text },
                    ]}
                    maxLength={150}
                    returnKeyType="next"
                    onSubmitEditing={next}
                  />
                </View>
                <View style={styles.section}>
                  <Copy style={styles.label}>Catégorie</Copy>
                  <View style={styles.choices}>
                    {(Object.keys(categories) as Category[]).map((value) => (
                      <Choice
                        key={value}
                        label={categories[value]}
                        category={value}
                        selected={category === value}
                        onPress={() => setCategory(value)}
                      />
                    ))}
                  </View>
                </View>
                <View style={styles.section}>
                  <Copy style={styles.label}>Type de suivi</Copy>
                  <View style={styles.choices}>
                    {trackingOptions.map((option) => (
                      <Choice
                        key={option.kind}
                        label={option.label}
                        selected={kind === option.kind}
                        onPress={() => {
                          if (kind !== option.kind) {
                            setKind(option.kind)
                            setUnit(option.unit)
                            setTarget(option.target)
                          }
                        }}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : (
              <>
                <LinearGradient colors={theme.blue} style={styles.goal}>
                  <Copy style={[styles.label, { color: theme.onPastel }]}>
                    Chaque jour
                  </Copy>
                  {kind === 'boolean' ? (
                    <View style={styles.booleanGoal}>
                      <Icon
                        name={{
                          ios: 'checkmark.circle',
                          android: 'check_circle',
                        }}
                        color={theme.blueText}
                        size={36}
                      />
                      <Copy
                        style={{
                          color: theme.onPastel,
                          fontSize: 19,
                          fontWeight: '600',
                        }}
                      >
                        Une validation
                      </Copy>
                      <Copy style={{ color: theme.blueText, fontSize: 15 }}>
                        Un geste accompli, une habitude validée.
                      </Copy>
                    </View>
                  ) : (
                    <>
                      {kind === 'quantity' && (
                        <View style={styles.units}>
                          {(['milliliters', 'meters', 'count'] as const).map(
                            (value) => (
                              <Choice
                                key={value}
                                label={goalUnits[value].label}
                                selected={unit === value}
                                onPress={() => {
                                  if (unit !== value) {
                                    setUnit(value)
                                    setTarget(goalUnits[value].presets[1])
                                  }
                                }}
                                compact
                              />
                            ),
                          )}
                        </View>
                      )}
                      <View style={styles.quantity}>
                        <FormInput
                          ref={goalInput}
                          accessibilityLabel={`Objectif quotidien en ${measurement.label}`}
                          value={target}
                          onChangeText={setTarget}
                          keyboardType="decimal-pad"
                          maxLength={12}
                          selectTextOnFocus
                          style={[
                            styles.number,
                            {
                              backgroundColor: theme.surface,
                              color: theme.text,
                            },
                          ]}
                        />
                        <Copy
                          style={{
                            color: theme.onPastel,
                            fontSize: 24,
                            fontWeight: '600',
                          }}
                        >
                          {measurement.label}
                        </Copy>
                      </View>
                      <View style={styles.presets}>
                        {measurement.presets.map((value) => (
                          <Choice
                            key={value}
                            label={`${value} ${measurement.label}`}
                            selected={
                              Number(target.replace(',', '.')) ===
                              Number(value.replace(',', '.'))
                            }
                            onPress={() => {
                              Keyboard.dismiss()
                              setTarget(value)
                            }}
                            compact
                          />
                        ))}
                      </View>
                      {unit === 'milliliters' &&
                        Number(target.replace(',', '.')) > 0 &&
                        Number.isFinite(Number(target.replace(',', '.'))) && (
                          <Copy
                            style={{
                              color: theme.blueText,
                              textAlign: 'center',
                              fontSize: 14,
                            }}
                          >
                            Soit{' '}
                            {new Intl.NumberFormat('fr-FR', {
                              maximumFractionDigits: 1,
                            }).format(
                              Number(target.replace(',', '.')) * 4,
                            )}{' '}
                            verres de 250 mL
                          </Copy>
                        )}
                    </>
                  )}
                </LinearGradient>
                <View
                  style={[styles.summary, { backgroundColor: theme.selected }]}
                >
                  <Icon name={summaryIcon} color={theme.blueText} size={28} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Copy style={{ fontSize: 17, fontWeight: '600' }}>
                      {name.trim()}
                    </Copy>
                    <Copy style={{ color: theme.secondary, fontSize: 14 }}>
                      {categories[category]} · {tracking.label}
                    </Copy>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Modifier le nom, la catégorie ou le type"
                    disabled={busy}
                    onPress={() => changeStep(1)}
                    style={styles.modify}
                  >
                    <Copy style={{ fontSize: 14 }}>Modifier</Copy>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
          {!!error && (
            <Copy
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={{ color: theme.error, fontSize: 15 }}
            >
              {error}
            </Copy>
          )}
          {!canWrite && (
            <Copy
              accessibilityRole="alert"
              style={{ color: theme.error, fontSize: 15 }}
            >
              Votre accès ne permet pas de créer une habitude.
            </Copy>
          )}
        </FormScrollView>
      </View>
      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.surface,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <Button
          variant="accent"
          disabled={busy || !canWrite}
          onPress={step === 1 ? next : save}
          onFeedbackEnd={(outcome) => {
            if (outcome === 'success') finish()
          }}
        >
          {step === 1 ? 'Continuer' : 'Créer l’habitude'}
        </Button>
      </View>
    </KeyboardScreen>
  )
}

function Choice({
  category,
  label,
  selected,
  onPress,
  compact = false,
}: {
  category?: Category
  label: string
  selected: boolean
  onPress: () => void
  compact?: boolean
}) {
  const theme = useTheme()
  const color = category ? categoryColor(category, theme.dark) : undefined
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        compact && styles.compactChoice,
        {
          backgroundColor: selected ? (color?.tint ?? theme.text) : theme.chip,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Copy
        style={{
          fontSize: 15,
          color: color?.ink ?? (selected ? theme.surface : theme.text),
        }}
      >
        {label}
      </Copy>
      {selected && (
        <Icon
          name={{ ios: 'checkmark', android: 'check' }}
          color={color?.ink ?? theme.surface}
          size={14}
        />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 6 },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  back: {
    minWidth: 82,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  step: { flex: 1, textAlign: 'right', fontSize: 14 },
  close: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 22, gap: 24, paddingBottom: 28 },
  heading: { gap: 8 },
  title: { fontSize: 24, fontWeight: '600', letterSpacing: -0.5 },
  section: { gap: 10 },
  label: { fontSize: 17, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: 48,
    padding: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  compactChoice: {
    flexBasis: 'auto',
    flexGrow: 0,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  goal: { borderRadius: 16, padding: 18, gap: 20 },
  units: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  quantity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  number: {
    fontSize: 36,
    fontWeight: '600',
    borderRadius: 12,
    textAlign: 'center',
    minWidth: 110,
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontVariant: ['tabular-nums'],
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  booleanGoal: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  summary: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  modify: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  footer: {
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  primary: {
    minHeight: 48,
    padding: 14,
    borderRadius: 16,
    justifyContent: 'center',
  },
})
