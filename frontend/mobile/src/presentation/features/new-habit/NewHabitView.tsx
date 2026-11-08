import { useLayoutEffect, useRef } from 'react'
import Animated from 'react-native-reanimated'
import { Stack } from 'expo-router'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FormScrollView } from '../../shared/forms/FormScrollView'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { formStepEntry } from '../../shared/motion/local-transitions'
import { Button, Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import { DefinitionStep, GoalStep } from './DefinitionAndGoal'
import { RhythmStep } from './RhythmStep'
import { ReviewStep } from './ReviewStep'
import type { CreationStep } from './new-habit-model'
import type { NewHabitController } from './useNewHabitController'
const titles = [
  'Nouvelle habitude',
  'Quel objectif ?',
  'Votre rythme',
  'Tout est prêt ?',
]
export function NewHabitView({ model: m }: { model: NewHabitController }) {
  const theme = useTheme(),
    insets = useSafeAreaInsets(),
    previousStep = useRef(m.step)
  const entry = previousStep.current === m.step ? undefined : formStepEntry
  useLayoutEffect(() => {
    previousStep.current = m.step
  }, [m.step])
  return (
    <KeyboardScreen style={{ flex: 1, gap: 6, backgroundColor: theme.canvas }}>
      <Stack.Screen options={{ gestureEnabled: !m.busy }} />
      <View style={[s.body, { backgroundColor: theme.surface }]}>
        <View
          style={[
            s.navigation,
            Platform.OS === 'android' && {
              paddingTop: Math.max(insets.top, 8),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Étape précédente"
            disabled={m.busy || m.step === 1}
            onPress={() => m.changeStep((m.step - 1) as CreationStep)}
            style={[s.navButton, { opacity: m.step === 1 ? 0 : 1 }]}
          >
            <Icon
              name={{ ios: 'chevron.left', android: 'arrow_back' }}
              color={theme.text}
              size={20}
            />
          </Pressable>
          <Copy
            accessibilityLiveRegion="polite"
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 14,
              color: theme.secondary,
            }}
          >
            {m.step === 4 ? 'Récapitulatif' : `${m.step} sur 3`}
          </Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer la création"
            disabled={m.busy}
            onPress={m.finish}
            style={s.navButton}
          >
            <Icon
              name={{ ios: 'xmark', android: 'close' }}
              color={theme.text}
              size={21}
            />
          </Pressable>
        </View>
        <FormScrollView
          ref={m.scroll}
          pointerEvents={m.busy ? 'none' : 'auto'}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ padding: 22, gap: 20, paddingBottom: 28 }}
        >
          <Animated.View key={m.step} entering={entry} style={{ gap: 24 }}>
            <View style={{ gap: 8 }}>
              <Copy
                accessibilityRole="header"
                style={{ fontSize: 24, fontWeight: '600', letterSpacing: -0.5 }}
              >
                {titles[m.step - 1]}
              </Copy>
              <Copy
                style={{ color: theme.secondary, fontSize: 15, lineHeight: 21 }}
              >
                {m.step === 1
                  ? 'Un geste à votre mesure.'
                  : m.step === 4
                    ? 'Touchez une ligne pour ajuster.'
                    : m.draft.name.trim()}
              </Copy>
            </View>
            {m.step === 1 && <DefinitionStep {...m} />}
            {m.step === 2 && <GoalStep {...m} />}
            {m.step === 3 && <RhythmStep {...m} />}
            {m.step === 4 && <ReviewStep {...m} />}
          </Animated.View>
          {!!m.error && (
            <Copy
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={{ color: theme.error, fontSize: 14 }}
            >
              {m.error}
            </Copy>
          )}
          {!m.canWrite && (
            <Copy
              accessibilityRole="alert"
              style={{ color: theme.error, fontSize: 14 }}
            >
              Votre accès ne permet pas de créer une habitude.
            </Copy>
          )}
        </FormScrollView>
      </View>
      <View
        style={[
          s.footer,
          {
            backgroundColor: theme.surface,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <Button
          variant="accent"
          disabled={m.busy || !m.canWrite}
          onPress={m.step === 4 ? m.save : m.next}
          onFeedbackEnd={(outcome) => {
            if (m.step === 4 && outcome === 'success') m.finish()
          }}
        >
          {m.step === 4
            ? 'Créer l’habitude'
            : m.step === 3
              ? 'Vérifier mon habitude'
              : 'Continuer'}
        </Button>
      </View>
    </KeyboardScreen>
  )
}
const s = StyleSheet.create({
  body: {
    flex: 1,
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  navButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    borderRadius: 18,
    padding: 16,
  },
})
