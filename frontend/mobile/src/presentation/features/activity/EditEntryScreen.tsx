import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useApp } from '../../../application/providers'
import { useDomainQuery } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import { Button, Copy, useTheme } from '../../shared/ui/native-ui'
import { EditEntryView } from './EditEntryView'
import { useEditEntryController } from './useEditEntryController'
import type { Entry, Habit } from '../../../domain/models'

export default function EditEntryScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>(),
    { status, session } = useApp(),
    theme = useTheme()
  const canRead =
    !!session?.scopes.includes('entries:read') &&
    !!session?.scopes.includes('habits:read')
  const query = useDomainQuery(
    'entries',
    [id, 'edit'],
    async (c, o) => {
      const entry = await c.getEntry(id, o)
      return { entry, habit: await c.getHabit(entry.habit_id, o) }
    },
    canRead,
  )
  if (status !== 'authenticated' || !session) return <Redirect href="/" />
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: 'none',
          gestureEnabled: false,
        }}
      />
      {query.data ? (
        <Content
          key={`${session.user_id}:${id}`}
          initial={query.data}
          fromToday={from === 'today'}
        />
      ) : (
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
            <Copy>Votre accès ne permet pas de consulter cette saisie.</Copy>
          ) : query.error ? (
            <>
              <Copy accessibilityRole="alert">{errorMessage(query.error)}</Copy>
              <Button onPress={() => query.refetch()}>Réessayer</Button>
            </>
          ) : (
            <ActivityIndicator />
          )}
          <Button
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace(from === 'today' ? '/today' : '/')
            }
          >
            Retour
          </Button>
        </View>
      )}
    </>
  )
}
function Content({
  initial,
  fromToday,
}: {
  initial: { entry: Entry; habit: Habit }
  fromToday: boolean
}) {
  return <EditEntryView model={useEditEntryController(initial, fromToday)} />
}
