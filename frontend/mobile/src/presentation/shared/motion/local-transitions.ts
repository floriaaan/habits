import {
  FadeInDown,
  LinearTransition,
  ReduceMotion,
  withTiming,
  type ExitAnimationsValues,
} from 'react-native-reanimated'

export const formStepEntry = FadeInDown.duration(180)
  .withInitialValues({ transform: [{ translateY: 8 }] })
  .reduceMotion(ReduceMotion.System)
export const localLayout = LinearTransition.duration(180).reduceMotion(
  ReduceMotion.System,
)

// Validation removes this row only after its button has shown the success check.
export function collapseCompletedRow(values: ExitAnimationsValues) {
  'worklet'
  const config = { duration: 180, reduceMotion: ReduceMotion.System }
  return {
    initialValues: {
      height: values.currentHeight,
      opacity: 1,
      paddingVertical: 10,
    },
    animations: {
      height: withTiming(0, config),
      paddingVertical: withTiming(0, config),
      opacity: withTiming(0, { ...config, duration: 120 }),
    },
  }
}
