import { Redirect, useLocalSearchParams, router } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useApp } from '../../../application/providers'
import { errorMessage } from '../../../domain/api-error'
import { Button, Copy, useTheme } from '../../shared/ui/native-ui'
import { EditHabitView } from './EditHabitView'
import {
  useEditHabitController,
  useEditHabitQuery,
} from './useEditHabitController'
import type { EditHabitSnapshot } from './edit-habit-model'

export default function EditHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { status, session } = useApp(),
    { query, canRead } = useEditHabitQuery(id),
    theme = useTheme()
  if (status !== 'authenticated' || !session) return <Redirect href="/" />
  if (query.data)
    return <Content key={`${session.user_id}:${id}`} snapshot={query.data} />
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        paddingTop: 80,
        gap: 20,
        backgroundColor: theme.surface,
      }}
    >
      {!canRead ? (
        <Copy>Votre accès ne permet pas de lire cette habitude.</Copy>
      ) : query.error ? (
        <>
          <Copy accessibilityRole="alert">{errorMessage(query.error)}</Copy>
          <Button onPress={() => query.refetch()}>Réessayer</Button>
        </>
      ) : (
        <ActivityIndicator />
      )}
      <BackButton />
    </View>
  )
}
function BackButton() {
  return (
    <Button
      onPress={() => {
        /* Navigation stays available even if loading fails. */ router.canGoBack()
          ? router.back()
          : router.replace('/')
      }}
    >
      Retour
    </Button>
  )
}
function Content({ snapshot }: { snapshot: EditHabitSnapshot }) {
  const model = useEditHabitController(snapshot)
  return <EditHabitView model={model} />
}
