import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useApp } from '../../../application/providers'
import { errorMessage } from '../../../domain/api-error'
import { Button, Copy, useTheme } from '../../shared/ui/native-ui'
import { RestView } from './RestView'
import { useRestController, useRestQuery } from './useRestController'
import type { Habit, RestException } from '../../../domain/models'

export default function RestScreen() {
  const { id, date, from } = useLocalSearchParams<{
    id: string
    date?: string
    from?: string
  }>()
  const { status, session } = useApp(),
    { query, canRead } = useRestQuery(id),
    theme = useTheme()
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
          date={date}
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
            <Copy>Votre accès ne permet pas de consulter cette habitude.</Copy>
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
  date,
  fromToday,
}: {
  initial: { habit: Habit; rests: RestException[] }
  date?: string
  fromToday: boolean
}) {
  return <RestView model={useRestController(initial, date, fromToday)} />
}
